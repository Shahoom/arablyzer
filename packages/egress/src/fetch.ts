import http, { type IncomingMessage } from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { pipeline, type Readable } from 'node:stream'
import zlib from 'node:zlib'
import { egressError, type EgressError } from './errors'
import { DEFAULT_POLICY, type EgressPolicy } from './policy'
import { resolveEndpoint, systemResolver, type ResolvedAddress, type Resolver } from './resolve'
import { checkUrl } from './url'

/** BUILD-PLAN §11 page-load limits. */
export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024
export const DEFAULT_MAX_REDIRECTS = 10

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export interface SafeFetchOptions {
  /** Sent as-is: Arablyzer always identifies itself and never poses as another bot. */
  readonly userAgent: string
  readonly accept?: string
  readonly policy?: EgressPolicy
  readonly resolver?: Resolver
  /** Budget for the whole fetch, redirects included. */
  readonly timeoutMs?: number
  /** Cap on decoded body bytes. */
  readonly maxBytes?: number
  /** 'truncate' keeps the first maxBytes (robots.txt parse limit, RFC 9309). */
  readonly onTooLarge?: 'error' | 'truncate'
  readonly maxRedirects?: number
  readonly signal?: AbortSignal
}

export interface FetchHop {
  readonly url: string
  readonly status: number
  readonly location: string
}

export interface FetchResponse {
  /** Final URL after redirects. */
  readonly url: string
  readonly status: number
  /** Names lowercased; order and repeated headers kept as received. */
  readonly headers: readonly (readonly [string, string])[]
  readonly body: Uint8Array
  readonly truncated: boolean
  readonly remoteAddress: string | null
}

export interface FetchResult {
  readonly requestedUrl: string
  readonly redirects: readonly FetchHop[]
  readonly response: FetchResponse | null
  readonly error: EgressError | null
  readonly startedAt: string
  readonly durationMs: number
}

class TooLargeError extends Error {}
class DecodeError extends Error {}

/**
 * The only way Arablyzer code reaches the network (docs/design/phase-0.md §1). Every hop is vetted:
 * URL rules, then every DNS answer, then a connection pinned to the vetted addresses so DNS cannot
 * change in between.
 */
export async function safeFetch(input: string, options: SafeFetchOptions): Promise<FetchResult> {
  const policy = options.policy ?? DEFAULT_POLICY
  const resolver = options.resolver ?? systemResolver
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const deadline = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal =
    options.signal === undefined ? deadline : AbortSignal.any([deadline, options.signal])
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const redirects: FetchHop[] = []
  const finish = (response: FetchResponse | null, error: EgressError | null): FetchResult => ({
    requestedUrl: input,
    redirects,
    response,
    error,
    startedAt,
    durationMs: Math.round(performance.now() - started),
  })

  let current = input
  for (;;) {
    const checked = checkUrl(current, policy)
    if (!checked.ok) return finish(null, checked.error)
    const { url, host, port } = checked
    try {
      const endpoint = await untilAborted(
        resolveEndpoint(url, host, port, policy, resolver),
        signal,
      )
      if (!endpoint.ok) return finish(null, endpoint.error)
      const res = await sendRequest(url, endpoint.addresses, options, signal)
      const status = res.statusCode ?? 0
      const location = res.headers.location
      if (REDIRECT_STATUSES.has(status) && location !== undefined) {
        res.destroy()
        if (redirects.length >= maxRedirects) {
          return finish(
            null,
            egressError('too-many-redirects', url.href, `More than ${maxRedirects} redirects`),
          )
        }
        const next = parseLocation(location, url)
        if (next === null) {
          return finish(
            null,
            egressError('invalid-redirect', url.href, `Unusable Location header: ${location}`),
          )
        }
        redirects.push({ url: url.href, status, location: next.href })
        current = next.href
        continue
      }
      const remoteAddress = res.socket.remoteAddress ?? null
      const headers = headerPairs(res.rawHeaders)
      const { body, truncated } = await readBody(
        res,
        options.maxBytes ?? DEFAULT_MAX_BYTES,
        options.onTooLarge ?? 'error',
      )
      return finish({ url: url.href, status, headers, body, truncated, remoteAddress }, null)
    } catch (error) {
      return finish(null, toEgressError(error, url.href, deadline, signal))
    }
  }
}

function sendRequest(
  url: URL,
  addresses: readonly ResolvedAddress[],
  options: SafeFetchOptions,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  // Hand Node only the vetted answers, so the connection cannot be re-resolved elsewhere.
  const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all === true) {
      callback(
        null,
        addresses.map(({ address, family }) => ({ address, family })),
      )
      return
    }
    const [first] = addresses
    if (first === undefined) {
      callback(new Error('No vetted address'), '', 0)
      return
    }
    callback(null, first.address, first.family)
  }
  const requestOptions: https.RequestOptions = {
    method: 'GET',
    agent: false,
    lookup,
    signal,
    headers: {
      'user-agent': options.userAgent,
      accept: options.accept ?? '*/*',
      'accept-encoding': 'gzip, deflate, br',
    },
  }
  return new Promise((resolve, reject) => {
    const request =
      url.protocol === 'https:'
        ? https.request(url, requestOptions, resolve)
        : http.request(url, requestOptions, resolve)
    request.on('error', reject)
    request.end()
  })
}

async function readBody(
  res: IncomingMessage,
  maxBytes: number,
  onTooLarge: 'error' | 'truncate',
): Promise<{ body: Uint8Array; truncated: boolean }> {
  const encoding = (res.headers['content-encoding'] ?? '').trim().toLowerCase()
  const declared = Number(res.headers['content-length'] ?? Number.NaN)
  if (onTooLarge === 'error' && !isEncoded(encoding) && declared > maxBytes) {
    res.destroy()
    throw new TooLargeError(`Content-Length ${declared} is over the ${maxBytes}-byte limit`)
  }
  const stream = decodedStream(res, encoding)
  const chunks: Buffer[] = []
  let size = 0
  try {
    for await (const chunk of stream) {
      const buffer = chunk as Buffer
      if (size + buffer.length > maxBytes) {
        if (onTooLarge === 'truncate') {
          chunks.push(buffer.subarray(0, maxBytes - size))
          return { body: Buffer.concat(chunks), truncated: true }
        }
        throw new TooLargeError(`Body is over the ${maxBytes}-byte limit`)
      }
      chunks.push(buffer)
      size += buffer.length
    }
    return { body: Buffer.concat(chunks), truncated: false }
  } finally {
    stream.destroy()
    res.destroy()
  }
}

function isEncoded(encoding: string): boolean {
  return encoding !== '' && encoding !== 'identity'
}

function decodedStream(res: IncomingMessage, encoding: string): Readable {
  if (!isEncoded(encoding)) return res
  let decoder: zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress
  if (encoding === 'gzip' || encoding === 'x-gzip') decoder = zlib.createGunzip()
  else if (encoding === 'deflate') decoder = zlib.createInflate()
  else if (encoding === 'br') decoder = zlib.createBrotliDecompress()
  else {
    res.destroy()
    throw new DecodeError(`Unsupported Content-Encoding: ${encoding}`)
  }
  // pipeline forwards an error on either side into the decoder, which the reader then sees.
  return pipeline(res, decoder, () => undefined)
}

/** Location bytes are UTF-8 on the wire (browsers read them so); Node hands them over as latin1. */
function parseLocation(location: string, base: URL): URL | null {
  try {
    return new URL(decodeHeaderValue(location), base)
  } catch {
    return null
  }
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

function decodeHeaderValue(value: string): string {
  if (!hasCharAbove(value, 0x7f)) return value
  try {
    return utf8.decode(Buffer.from(value, 'latin1'))
  } catch {
    return value
  }
}

function hasCharAbove(value: string, max: number): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > max) return true
  }
  return false
}

function headerPairs(raw: readonly string[]): [string, string][] {
  const pairs: [string, string][] = []
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const name = raw[i]
    const value = raw[i + 1]
    if (name !== undefined && value !== undefined) {
      pairs.push([name.toLowerCase(), decodeHeaderValue(value)])
    }
  }
  return pairs
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(abortReason(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Aborted')
}

const TLS_ERROR =
  /^(?:ERR_TLS|ERR_SSL|ERR_OSSL|CERT_|UNABLE_TO_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|HOSTNAME_MISMATCH)/
const ZLIB_ERROR = /^(?:Z_|ERR_ZLIB|ERR__ERROR)|BROTLI/

function toEgressError(
  error: unknown,
  url: string,
  deadline: AbortSignal,
  signal: AbortSignal,
): EgressError {
  // After an abort the socket may surface ECONNRESET rather than an AbortError; the abort is the cause.
  if (deadline.aborted) return egressError('timeout', url, 'Time limit reached')
  if (signal.aborted) return egressError('aborted', url, 'Request was cancelled')
  if (error instanceof TooLargeError) return egressError('too-large', url, error.message)
  if (error instanceof DecodeError) return egressError('decode-failed', url, error.message)
  const code = errorCode(error)
  if (TLS_ERROR.test(code)) return egressError('tls-failed', url, `TLS failed: ${code}`)
  if (ZLIB_ERROR.test(code)) {
    return egressError('decode-failed', url, `Could not decompress the body: ${code}`)
  }
  return egressError(
    'connect-failed',
    url,
    `Request failed: ${code === '' ? describe(error) : code}`,
  )
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : ''
  }
  return ''
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
