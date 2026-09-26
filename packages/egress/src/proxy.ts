import { randomBytes, timingSafeEqual } from 'node:crypto'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import net from 'node:net'
import type { Duplex } from 'node:stream'
import type { EgressErrorCode } from './errors'
import { DEFAULT_MAX_BYTES } from './fetch'
import { DEFAULT_POLICY, type EgressPolicy } from './policy'
import { redactUrl } from './redact'
import {
  defaultResolver,
  pinnedLookup,
  resolveEndpoint,
  type ResolvedAddress,
  type Resolver,
} from './resolve'
import { checkUrl } from './url'

/** BUILD-PLAN §11: at most 300 requests per page load. */
export const DEFAULT_MAX_REQUESTS = 300
/** Refusals kept in the log; the rest are counted only. */
export const PROXY_LOG_LIMIT = 100
/** DNS and the TCP connect for one request. */
const CONNECT_TIMEOUT_MS = 10_000
/** A connection without traffic for this long is closed. */
const IDLE_TIMEOUT_MS = 30_000
const MAX_REQUESTS = 10_000
const MAX_TARGET_LENGTH = 300
const MAX_HEADER_SIZE = 16 * 1024

export interface ProxyOptions {
  readonly policy?: EgressPolicy
  readonly resolver?: Resolver
  /** Requests and tunnels let through (BUILD-PLAN §11: 300 per page load). */
  readonly maxRequests?: number
  /** Bytes to and from the network, all requests together (BUILD-PLAN §11: 25 MB). */
  readonly maxBytes?: number
}

export type ProxyRefusalCode = EgressErrorCode | 'bad-request' | 'request-limit'

export interface ProxyRefusal {
  /** The URL of an HTTP request, or the host:port of a tunnel, without credentials. */
  readonly target: string
  readonly code: ProxyRefusalCode
  /** For blocked-address: the refused IP and the range it matched. */
  readonly address?: string
  readonly range?: string
}

export interface ProxyStats {
  /** Requests and tunnels let through. */
  readonly requests: number
  /** Every refusal, including those past the log. */
  readonly refused: number
  /** Requests without the proxy's credentials, such as a browser's own background traffic. */
  readonly unauthenticated: number
  /** The request limit or the byte budget was reached, so the page did not load in full. */
  readonly limited: boolean
  /** Bytes to and from the network. */
  readonly bytes: number
  /** The first PROXY_LOG_LIMIT refusals. */
  readonly refusals: readonly ProxyRefusal[]
}

export interface EgressProxy {
  /** "http://127.0.0.1:<port>" */
  readonly url: string
  readonly username: string
  readonly password: string
  stats(): ProxyStats
  close(): Promise<void>
}

type Admission =
  | { readonly ok: true; readonly addresses: readonly ResolvedAddress[] }
  | { readonly ok: false; readonly code: ProxyRefusalCode }

/** Headers that belong to one connection and are never forwarded (RFC 9110 §7.6.1). */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])
/** host:port, as browsers send it in CONNECT; IPv6 in brackets. */
const AUTHORITY = /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._-]+):\d{1,5}$/

/**
 * An HTTP proxy for one browser render (docs/design/plans/m1.1-browser.md §2). It vets every
 * request and every CONNECT the way safeFetch vets a fetch: URL rules, every DNS answer, then a
 * connection to an address it vetted. It follows no redirects: the browser follows them, and
 * each hop comes back as a new request. It listens on 127.0.0.1 and wants its own credentials.
 *
 * Invalid options (e.g. a NaN limit) throw a TypeError.
 */
export async function startProxy(options: ProxyOptions = {}): Promise<EgressProxy> {
  checkLimit('maxRequests', options.maxRequests, 1, MAX_REQUESTS)
  checkLimit('maxBytes', options.maxBytes, 1, DEFAULT_MAX_BYTES)
  const policy = options.policy ?? DEFAULT_POLICY
  const resolver = options.resolver ?? defaultResolver(policy)
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const username = 'arablyzer'
  const password = randomBytes(24).toString('base64url')
  const expected = Buffer.from(`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`)
  const closing = new AbortController()
  const sockets = new Set<Duplex>()
  const refusals: ProxyRefusal[] = []
  let requests = 0
  let pending = 0
  let refused = 0
  let unauthenticated = 0
  let limited = false
  let bytes = 0

  const track = (socket: Duplex) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  }

  const refuse = (target: string, code: ProxyRefusalCode, address?: string, range?: string) => {
    refused += 1
    if (code === 'request-limit' || code === 'too-large') limited = true
    if (refusals.length < PROXY_LOG_LIMIT) {
      refusals.push({
        target: redactUrl(target).slice(0, MAX_TARGET_LENGTH),
        code,
        ...(address === undefined ? {} : { address }),
        ...(range === undefined ? {} : { range }),
      })
    }
  }

  /**
   * Counts bytes to and from the network; false once the budget is spent (logged once). Uploads
   * count too, or a page could send out unbounded data through a scan (M1.1 review).
   */
  const counted = (length: number, target: string): boolean => {
    const before = bytes
    bytes += length
    if (bytes <= maxBytes) return true
    if (before <= maxBytes) refuse(target, 'too-large')
    return false
  }

  const authorized = (req: IncomingMessage): boolean => {
    const given = Buffer.from(req.headers['proxy-authorization'] ?? '')
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  /** The request limit, the byte budget, then DNS and every answer vetted. */
  const admit = async (
    target: string,
    url: URL,
    host: string,
    port: number,
  ): Promise<Admission> => {
    if (requests + pending >= maxRequests) {
      refuse(target, 'request-limit')
      return { ok: false, code: 'request-limit' }
    }
    if (bytes > maxBytes) {
      refuse(target, 'too-large')
      return { ok: false, code: 'too-large' }
    }
    pending += 1
    try {
      const signal = AbortSignal.any([AbortSignal.timeout(CONNECT_TIMEOUT_MS), closing.signal])
      const endpoint = await untilAborted(
        resolveEndpoint(url, host, port, policy, resolver, signal),
        signal,
      )
      if (!endpoint.ok) {
        const { code, address, range } = endpoint.error
        refuse(target, code, address, range)
        return { ok: false, code }
      }
      requests += 1
      return { ok: true, addresses: endpoint.addresses }
    } catch {
      refuse(target, 'timeout')
      return { ok: false, code: 'timeout' }
    } finally {
      pending -= 1
    }
  }

  const onRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!authorized(req)) {
      unauthenticated += 1
      res.writeHead(407, { 'proxy-authenticate': 'Basic realm="arablyzer"', 'content-length': '0' })
      res.end()
      return
    }
    const target = req.url ?? ''
    // Absolute-form http: only; origin-form means a client talking to the proxy as a web server,
    // and browsers send https through CONNECT.
    if (!/^http:\/\//i.test(target)) {
      refuse(target, 'bad-request')
      answer(res, 'bad-request')
      return
    }
    const checked = checkUrl(target, policy)
    if (!checked.ok) {
      refuse(target, checked.error.code)
      answer(res, checked.error.code)
      return
    }
    const { url, host, port } = checked
    const admission = await admit(url.href, url, host, port)
    if (!admission.ok) {
      answer(res, admission.code)
      return
    }
    forward(req, res, url, admission.addresses)
  }

  const forward = (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    addresses: readonly ResolvedAddress[],
  ) => {
    let cut = false
    const upstream = http.request(
      url,
      {
        method: req.method ?? 'GET',
        // RFC 9112 §3.2.2: the Host of an absolute-form request comes from its URL.
        headers: [...endToEnd(req.rawHeaders, 'host'), 'Host', url.host],
        setHost: false,
        agent: false,
        lookup: pinnedLookup(addresses),
        signal: closing.signal,
        insecureHTTPParser: false,
        maxHeaderSize: MAX_HEADER_SIZE,
      },
      (incoming) => {
        const status = incoming.statusCode ?? 0
        if (status < 100 || status > 599) {
          incoming.destroy()
          refuse(url.href, 'invalid-status')
          answer(res, 'invalid-status')
          return
        }
        try {
          // The server's reason phrase stays behind: browsers ignore it, and Node refuses to write
          // one with control characters, which would throw here and end the process (M1.1 review).
          res.writeHead(status, endToEnd(incoming.rawHeaders))
        } catch {
          incoming.destroy()
          refuse(url.href, 'invalid-status')
          answer(res, 'invalid-status')
          return
        }
        // Counted before it is passed on, so nothing past the budget reaches the browser.
        incoming.on('data', (chunk: Buffer) => {
          if (!counted(chunk.length, url.href)) {
            cut = true
            incoming.destroy()
            res.destroy()
            return
          }
          if (!res.write(chunk)) incoming.pause()
        })
        res.on('drain', () => incoming.resume())
        incoming.on('end', () => res.end())
        incoming.on('error', () => res.destroy())
      },
    )
    upstream.on('socket', (socket) => {
      track(socket)
      socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy())
    })
    // A request forwarded here never asks to upgrade (browsers tunnel WebSockets through CONNECT),
    // so a 101 is a server misbehaving; unanswered, it held the request until the idle timeout.
    upstream.on('upgrade', (_response, socket) => {
      socket.destroy()
      refuse(url.href, 'invalid-status')
      answer(res, 'invalid-status')
    })
    upstream.on('error', () => {
      if (cut || closing.signal.aborted) return
      if (res.headersSent) {
        res.destroy()
        return
      }
      refuse(url.href, 'connect-failed')
      answer(res, 'connect-failed')
    })
    res.on('close', () => upstream.destroy())
    // The request body, counted before it goes out, as responses are before they come in.
    req.on('data', (chunk: Buffer) => {
      if (!counted(chunk.length, url.href)) {
        cut = true
        req.destroy()
        upstream.destroy()
        res.destroy()
        return
      }
      if (!upstream.write(chunk)) req.pause()
    })
    upstream.on('drain', () => req.resume())
    req.on('end', () => upstream.end())
  }

  const onConnect = async (req: IncomingMessage, client: Duplex, head: Buffer): Promise<void> => {
    client.on('error', () => client.destroy())
    if (!authorized(req)) {
      unauthenticated += 1
      client.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\n' +
          'Proxy-Authenticate: Basic realm="arablyzer"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
      )
      return
    }
    const authority = req.url ?? ''
    if (!AUTHORITY.test(authority)) {
      refuse(authority, 'bad-request')
      answerSocket(client, 'bad-request')
      return
    }
    const checked = checkUrl(`https://${authority}/`, policy)
    if (!checked.ok) {
      refuse(authority, checked.error.code)
      answerSocket(client, checked.error.code)
      return
    }
    const admission = await admit(authority, checked.url, checked.host, checked.port)
    if (!admission.ok) {
      answerSocket(client, admission.code)
      return
    }
    let open = false
    const upstream = net.connect({
      host: checked.host,
      port: checked.port,
      lookup: pinnedLookup(admission.addresses),
    })
    track(upstream)
    upstream.setTimeout(CONNECT_TIMEOUT_MS)
    upstream.once('connect', () => {
      open = true
      upstream.setTimeout(IDLE_TIMEOUT_MS)
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      // Both directions count against the byte budget, each chunk before it is passed on.
      const relay = (from: Duplex, to: Duplex) => {
        from.on('data', (chunk: Buffer) => {
          if (!counted(chunk.length, authority)) {
            upstream.destroy()
            client.destroy()
            return
          }
          if (!to.write(chunk)) from.pause()
        })
        to.on('drain', () => from.resume())
        from.on('end', () => to.end())
      }
      if (head.length > 0) {
        if (!counted(head.length, authority)) {
          upstream.destroy()
          client.destroy()
          return
        }
        upstream.write(head)
      }
      relay(upstream, client)
      relay(client, upstream)
    })
    upstream.on('timeout', () => {
      if (!open) {
        refuse(authority, 'timeout')
        answerSocket(client, 'timeout')
      }
      upstream.destroy()
    })
    upstream.on('error', () => {
      if (open || closing.signal.aborted) {
        client.destroy()
        return
      }
      refuse(authority, 'connect-failed')
      answerSocket(client, 'connect-failed')
    })
    upstream.on('close', () => {
      if (open) client.destroy()
    })
    client.on('close', () => upstream.destroy())
  }

  const server = http.createServer({ insecureHTTPParser: false, maxHeaderSize: MAX_HEADER_SIZE })
  server.on('connection', (socket: net.Socket) => {
    track(socket)
    socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy())
  })
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    onRequest(req, res).catch(() => {
      if (res.headersSent) res.destroy()
      else answer(res, 'connect-failed')
    })
  })
  server.on('connect', (req: IncomingMessage, client: Duplex, head: Buffer) => {
    onConnect(req, client, head).catch(() => client.destroy())
  })
  // WebSockets go through CONNECT; an upgrade in absolute form is refused.
  server.on('upgrade', (req: IncomingMessage, client: Duplex) => {
    refuse(req.url ?? '', 'bad-request')
    answerSocket(client, 'bad-request')
  })
  server.on('clientError', (_error, socket: Duplex) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
    else socket.destroy()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('The proxy has no port')

  return {
    url: `http://127.0.0.1:${address.port}`,
    username,
    password,
    stats: () => ({
      requests,
      refused,
      unauthenticated,
      limited,
      bytes,
      refusals: [...refusals],
    }),
    close: () =>
      new Promise<void>((resolve) => {
        closing.abort()
        server.close(() => {
          resolve()
        })
        for (const socket of sockets) socket.destroy()
      }),
  }
}

/** Refusals that are the network's fault are gateway errors; the rest are the policy's. */
function statusOf(code: ProxyRefusalCode): readonly [number, string] {
  switch (code) {
    case 'bad-request':
    case 'invalid-url':
      return [400, 'Bad Request']
    case 'dns-failed':
    case 'connect-failed':
    case 'invalid-status':
      return [502, 'Bad Gateway']
    case 'timeout':
      return [504, 'Gateway Timeout']
    default:
      return [403, 'Forbidden']
  }
}

function answer(res: ServerResponse, code: ProxyRefusalCode): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  const [status] = statusOf(code)
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'x-arablyzer-refused': code,
  })
  res.end(`Refused by the Arablyzer egress proxy: ${code}\n`)
}

function answerSocket(socket: Duplex, code: ProxyRefusalCode): void {
  const [status, reason] = statusOf(code)
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\nX-Arablyzer-Refused: ${code}\r\n` +
      'Content-Length: 0\r\nConnection: close\r\n\r\n',
  )
}

/** rawHeaders without hop-by-hop headers, those the Connection header names, and `drop`. */
function endToEnd(raw: readonly string[], drop?: string): string[] {
  const named = new Set<string>()
  for (let i = 0; i + 1 < raw.length; i += 2) {
    if (raw[i]?.toLowerCase() !== 'connection') continue
    for (const token of (raw[i + 1] ?? '').split(',')) named.add(token.trim().toLowerCase())
  }
  const kept: string[] = []
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const name = raw[i]
    const value = raw[i + 1]
    if (name === undefined || value === undefined) continue
    const lower = name.toLowerCase()
    if (HOP_BY_HOP.has(lower) || named.has(lower) || lower === drop) continue
    kept.push(name, value)
  }
  return kept
}

function checkLimit(name: string, value: number | undefined, min: number, max: number): void {
  if (value === undefined) return
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(
      `${name} must be a whole number from ${min} to ${max}, got ${String(value)}`,
    )
  }
}

/** A resolver that ignores its signal (getaddrinfo) still cannot hold a request past it. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('Aborted'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new Error('Aborted'))
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
