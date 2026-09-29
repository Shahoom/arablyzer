import http, { type IncomingMessage } from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import type { Readable } from 'node:stream'
import tls, { TLSSocket, type PeerCertificate } from 'node:tls'
import zlib from 'node:zlib'
import { egressError, type EgressError, type EgressErrorCode } from './errors'
import { DEFAULT_POLICY, type EgressPolicy } from './policy'
import { redactUrl } from './redact'
import {
  defaultResolver,
  pinnedLookup,
  resolveEndpoint,
  type ResolvedAddress,
  type Resolver,
} from './resolve'
import { openTunnel } from './upstream'
import { checkUrl } from './url'

/** BUILD-PLAN §11 page-load limits. */
export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024
export const DEFAULT_MAX_REDIRECTS = 10
/** Upper bounds for caller-supplied limits (§11: a whole scan stays within 120 s). */
const MAX_TIMEOUT_MS = 120_000
const MAX_REDIRECTS = 20

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

function checkLimit(name: string, value: number | undefined, min: number, max: number): void {
  if (value === undefined) return
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(
      `${name} must be a whole number from ${min} to ${max}, got ${String(value)}`,
    )
  }
}

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
  /**
   * A JSON body to send with POST instead of a GET, as the CrUX API takes (M1.3 plan §0); at most
   * MAX_JSON_BODY_BYTES. A request with a body or added headers is never redirected: a redirect
   * would carry them to another address.
   */
  readonly json?: unknown
  /**
   * Request headers to add, such as an API key: sent, and never kept in a result or an error.
   * Names are tokens and cannot be the fetch's own (FIXED_HEADERS); values have no line breaks.
   */
  readonly headers?: Readonly<Record<string, string>>
  /**
   * Asked before each redirect is followed, with the URL it leads to (without credentials): false
   * ends the fetch there, with no response and no error, that redirect last in `redirects`. The
   * engine reads the next page's robots.txt here (M2.4 plan §2). It gets the fetch's own signal,
   * so its work ends with the fetch's time, and whether private addresses are still open for the
   * chain, so a fetch of its own can keep the same lockdown. One that throws fails the fetch.
   */
  readonly beforeRedirect?: (
    to: string,
    hop: { readonly signal: AbortSignal; readonly privateAccess: boolean },
  ) => Promise<boolean>
}

/** A JSON body's largest size: a CrUX query is a few hundred bytes. */
export const MAX_JSON_BODY_BYTES = 64 * 1024

/** Headers the fetch sets itself, or that framing and routing depend on. */
const FIXED_HEADERS: ReadonlySet<string> = new Set([
  'host',
  'user-agent',
  'accept',
  'accept-encoding',
  'content-type',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'upgrade',
  'expect',
  'te',
  'trailer',
  'cookie',
  'proxy-authorization',
  'proxy-connection',
])

/** RFC 9110 §5.6.2. */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

export interface FetchHop {
  readonly url: string
  readonly status: number
  readonly location: string
}

/** The final response's TLS certificate: when it became valid and when it expires. */
export interface CertificateValidity {
  /** ISO 8601. */
  readonly validFrom: string
  readonly validTo: string
}

export interface FetchResponse {
  /** Final URL after redirects. */
  readonly url: string
  readonly status: number
  /** Names lowercased; order and repeated headers kept as received. */
  readonly headers: readonly (readonly [string, string])[]
  readonly body: Uint8Array
  readonly truncated: boolean
  /** The server's address; null through an egress proxy, which alone knows it. */
  readonly remoteAddress: string | null
  /** null over plain HTTP, or when the certificate's dates could not be read. */
  readonly certificate: CertificateValidity | null
}

export interface FetchResult {
  readonly requestedUrl: string
  readonly redirects: readonly FetchHop[]
  /** Null, with no error either, when beforeRedirect declined the last redirect. */
  readonly response: FetchResponse | null
  readonly error: EgressError | null
  readonly startedAt: string
  readonly durationMs: number
  /**
   * Whether private addresses were still open when the fetch ended: only under allowPrivate, and
   * only for a chain that started on a private address. A follow-up fetch for the same site (its
   * robots.txt) should use the same lockdown, so DNS cannot move it onto a private address.
   */
  readonly privateAccess: boolean
}

class TooLargeError extends Error {}
class DecodeError extends Error {}
/** The egress proxy refused the connection, or could not make it. */
class UpstreamRefusal extends Error {
  readonly refusal: EgressErrorCode

  constructor(refusal: EgressErrorCode, message: string) {
    super(message)
    this.refusal = refusal
  }
}

/**
 * The only way Arablyzer code reaches the network (docs/design/phase-0.md §1). Every hop is vetted:
 * URL rules, then every DNS answer, then a connection pinned to the vetted addresses so DNS cannot
 * change in between. With an egress proxy in the policy (`upstream`), a name goes to the proxy,
 * which resolves it and vets its addresses; every other check still runs here.
 *
 * Network problems come back in `error`; invalid options (e.g. a NaN limit) throw a TypeError.
 */
export async function safeFetch(input: string, options: SafeFetchOptions): Promise<FetchResult> {
  checkLimit('timeoutMs', options.timeoutMs, 1, MAX_TIMEOUT_MS)
  checkLimit('maxBytes', options.maxBytes, 1, DEFAULT_MAX_BYTES)
  checkLimit('maxRedirects', options.maxRedirects, 0, MAX_REDIRECTS)
  const postBody = jsonBody(options.json)
  const addedHeaders = extraHeaders(options.headers)
  const policy = options.policy ?? DEFAULT_POLICY
  const resolver = options.resolver ?? defaultResolver(policy)
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const deadline = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal =
    options.signal === undefined ? deadline : AbortSignal.any([deadline, options.signal])
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const redirects: FetchHop[] = []
  let hopPolicy = policy
  const finish = (response: FetchResponse | null, error: EgressError | null): FetchResult => ({
    requestedUrl: redactUrl(input),
    redirects,
    response,
    error,
    startedAt,
    durationMs: Math.round(performance.now() - started),
    privateAccess: hopPolicy.allowPrivate,
  })

  let current = input
  for (;;) {
    const checked = checkUrl(current, hopPolicy)
    if (!checked.ok) return finish(null, checked.error)
    const { url, host, port } = checked
    try {
      // Through an egress proxy, a name is the proxy's to resolve and vet; an address is vetted
      // here all the same.
      const upstream = hopPolicy.upstream
      const endpoint =
        upstream !== undefined && isIP(host) === 0
          ? null
          : await untilAborted(
              resolveEndpoint(url, host, port, hopPolicy, resolver, signal),
              signal,
            )
      if (endpoint !== null && !endpoint.ok) return finish(null, endpoint.error)
      if (redirects.length === 0 && hopPolicy.allowPrivate && endpoint?.private !== true) {
        // --allow-private is for local builds: a chain that starts on a public address keeps
        // the default rules on every later hop, so it cannot redirect into local services.
        hopPolicy = { ...hopPolicy, allowPrivate: false }
      }
      const res =
        upstream === undefined
          ? await sendRequest(
              url,
              endpoint?.addresses ?? [],
              options,
              signal,
              postBody,
              addedHeaders,
            )
          : await sendThrough(upstream, url, host, port, options, signal, postBody, addedHeaders)
      const status = res.statusCode ?? 0
      // HTTP status codes are 100-599 (RFC 9110 §15); Node's parser also lets 600-999 through,
      // and some sites use them to refuse bots.
      if (status < 100 || status > 599) {
        res.destroy()
        return finish(
          null,
          egressError('invalid-status', url.href, `Invalid HTTP status ${status}`),
        )
      }
      const location = res.headers.location
      if (REDIRECT_STATUSES.has(status) && location !== undefined) {
        res.destroy()
        // A redirect would carry the body, or an added header such as a key, to another address.
        if (postBody !== undefined || Object.keys(addedHeaders).length > 0) {
          return finish(
            null,
            egressError(
              'too-many-redirects',
              url.href,
              'A request with a body or added headers is not redirected',
            ),
          )
        }
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
            egressError(
              'invalid-redirect',
              url.href,
              `Unusable Location header: ${redactUrl(location)}`,
            ),
          )
        }
        redirects.push({ url: url.href, status, location: redactUrl(next.href) })
        const follow =
          options.beforeRedirect === undefined ||
          (await untilAborted(
            options.beforeRedirect(redactUrl(next.href), {
              signal,
              privateAccess: hopPolicy.allowPrivate,
            }),
            signal,
          ))
        if (!follow) return finish(null, null)
        current = next.href
        continue
      }
      const remoteAddress = upstream === undefined ? (res.socket.remoteAddress ?? null) : null
      const certificate = res.socket instanceof TLSSocket ? validityOf(res.socket) : null
      const headers = headerPairs(res.rawHeaders)
      const { body, truncated } = await readBody(
        res,
        options.maxBytes ?? DEFAULT_MAX_BYTES,
        options.onTooLarge ?? 'error',
      )
      return finish(
        { url: url.href, status, headers, body, truncated, remoteAddress, certificate },
        null,
      )
    } catch (error) {
      return finish(null, toEgressError(error, url.href, deadline, signal))
    }
  }
}

/**
 * The validity of the certificate the server presented, which verified (rejectUnauthorized), as
 * ISO dates; null when the socket gives none or its dates do not parse.
 */
export function validityOf(
  socket: Pick<TLSSocket, 'getPeerCertificate'>,
): CertificateValidity | null {
  // Null once the socket is destroyed, whatever its type says (Node's documentation).
  const certificate = socket.getPeerCertificate() as PeerCertificate | null
  if (certificate === null) return null
  const from = new Date(certificate.valid_from)
  const to = new Date(certificate.valid_to)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  return { validFrom: from.toISOString(), validTo: to.toISOString() }
}

/** The JSON body as bytes; a TypeError when it cannot be sent. */
function jsonBody(json: unknown): Buffer | undefined {
  if (json === undefined) return undefined
  const text = JSON.stringify(json) as string | undefined
  if (text === undefined) throw new TypeError('json must be a JSON value')
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.length > MAX_JSON_BODY_BYTES) {
    throw new TypeError(`json is over the ${MAX_JSON_BODY_BYTES}-byte limit`)
  }
  return bytes
}

/** The added headers, names lowercased; a TypeError names one that cannot be added. */
function extraHeaders(given: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(given ?? {})) {
    const lower = name.toLowerCase()
    if (!TOKEN.test(name) || FIXED_HEADERS.has(lower)) {
      throw new TypeError(`The header ${JSON.stringify(name)} cannot be added`)
    }
    // The value is never quoted in the error: it may be a key.
    if (/[\r\n\0]/.test(value)) throw new TypeError(`The header ${name} has a line break`)
    headers[lower] = value
  }
  return headers
}

/** The request's headers: added ones first, so none can replace the fetch's own. */
function requestHeaders(
  options: SafeFetchOptions,
  body: Buffer | undefined,
  extra: Readonly<Record<string, string>>,
): Record<string, string> {
  return {
    ...extra,
    'user-agent': options.userAgent,
    accept: options.accept ?? '*/*',
    'accept-encoding': 'gzip, deflate, br',
    ...(body === undefined
      ? {}
      : { 'content-type': 'application/json', 'content-length': String(body.length) }),
  }
}

function sendRequest(
  url: URL,
  addresses: readonly ResolvedAddress[],
  options: SafeFetchOptions,
  signal: AbortSignal,
  body: Buffer | undefined,
  extra: Readonly<Record<string, string>>,
): Promise<IncomingMessage> {
  const lookup = pinnedLookup(addresses)
  const requestOptions: https.RequestOptions = {
    method: body === undefined ? 'GET' : 'POST',
    // A fresh agent: no shared sockets and no proxy settings picked up from the environment.
    agent: false,
    lookup,
    signal,
    // Set explicitly so NODE_OPTIONS or environment variables cannot loosen them.
    rejectUnauthorized: true,
    insecureHTTPParser: false,
    maxHeaderSize: 16 * 1024,
    headers: requestHeaders(options, body, extra),
  }
  return new Promise((resolve, reject) => {
    const request =
      url.protocol === 'https:'
        ? https.request(url, requestOptions, resolve)
        : http.request(url, requestOptions, resolve)
    request.on('error', reject)
    request.end(body)
  })
}

/**
 * The request through the egress proxy: a tunnel to host:port, TLS over it for https (verified,
 * with the name for SNI and the certificate's check), then HTTP/1.1 over that. The socket is the
 * request's alone, so nothing is shared, and no agent can pick up a proxy from the environment.
 */
async function sendThrough(
  upstream: string,
  url: URL,
  host: string,
  port: number,
  options: SafeFetchOptions,
  signal: AbortSignal,
  body: Buffer | undefined,
  extra: Readonly<Record<string, string>>,
): Promise<IncomingMessage> {
  const tunnel = await openTunnel(new URL(upstream), host, port, signal)
  if (!tunnel.ok) throw new UpstreamRefusal(tunnel.code, tunnel.detail)
  const socket =
    url.protocol === 'https:'
      ? tls.connect({
          socket: tunnel.socket,
          host,
          ...(isIP(host) === 0 ? { servername: host } : {}),
          rejectUnauthorized: true,
        })
      : tunnel.socket
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        method: body === undefined ? 'GET' : 'POST',
        host,
        port,
        path: `${url.pathname}${url.search}`,
        // Written as the URL has it: the port only when it is not the scheme's own.
        setHost: false,
        headers: { host: url.host, ...requestHeaders(options, body, extra) },
        createConnection: () => socket,
        signal,
        insecureHTTPParser: false,
        maxHeaderSize: 16 * 1024,
      },
      resolve,
    )
    request.on('error', (error) => {
      socket.destroy()
      reject(error)
    })
    request.end(body)
  })
}

async function readBody(
  res: IncomingMessage,
  maxBytes: number,
  onTooLarge: 'error' | 'truncate',
): Promise<{ body: Uint8Array; truncated: boolean }> {
  const encoding = (res.headers['content-encoding'] ?? '').trim().toLowerCase()
  const declared = Number(res.headers['content-length'] ?? Number.NaN)
  if (onTooLarge === 'error' && declared > maxBytes) {
    res.destroy()
    throw new TooLargeError(`Content-Length ${declared} is over the ${maxBytes}-byte limit`)
  }
  // The cap applies to bytes on the wire and again to decoded bytes, so neither compressed
  // padding nor a decompression bomb can run past it.
  const raw = await collect(res, maxBytes, onTooLarge)
  if (!isEncoded(encoding) || raw.body.length === 0) return raw
  const decoded = await collect(decoder(encoding, raw.body, raw.truncated), maxBytes, onTooLarge)
  return { body: decoded.body, truncated: raw.truncated || decoded.truncated }
}

async function collect(
  stream: Readable,
  maxBytes: number,
  onTooLarge: 'error' | 'truncate',
): Promise<{ body: Buffer; truncated: boolean }> {
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
  }
}

function isEncoded(encoding: string): boolean {
  return encoding !== '' && encoding !== 'identity'
}

/** Decoders chosen the way browsers choose them; a truncated input is decoded leniently. */
function decoder(encoding: string, bytes: Buffer, truncated: boolean): Readable {
  const flush = truncated ? { finishFlush: zlib.constants.Z_SYNC_FLUSH } : {}
  let stream: zlib.Gunzip | zlib.Inflate | zlib.InflateRaw | zlib.BrotliDecompress
  if (encoding === 'gzip' || encoding === 'x-gzip') stream = zlib.createGunzip(flush)
  else if (encoding === 'deflate') {
    // Servers send both zlib-wrapped and raw deflate under this name; browsers accept both.
    stream = hasZlibHeader(bytes) ? zlib.createInflate(flush) : zlib.createInflateRaw(flush)
  } else if (encoding === 'br') {
    stream = zlib.createBrotliDecompress(
      truncated ? { finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH } : {},
    )
  } else throw new DecodeError(`Unsupported Content-Encoding: ${encoding}`)
  stream.end(bytes)
  return stream
}

/** RFC 1950 header: compression method 8 and a check value divisible by 31. */
function hasZlibHeader(bytes: Uint8Array): boolean {
  const first = bytes[0]
  const second = bytes[1]
  if (first === undefined || second === undefined) return false
  return (first & 0x0f) === 8 && ((first << 8) | second) % 31 === 0
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
  if (error instanceof UpstreamRefusal) return egressError(error.refusal, url, error.message)
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
