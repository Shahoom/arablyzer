import net from 'node:net'
import type { EgressErrorCode } from './errors'

/** How long the egress proxy may take to open a tunnel: its DNS lookup and its connect. */
export const UPSTREAM_CONNECT_TIMEOUT_MS = 10_000
/** The largest answer to a CONNECT that is read: a status line and a few headers. */
const MAX_ANSWER_BYTES = 16 * 1024
/** How much of the proxy's reason is kept, for the logs. */
const MAX_DETAIL = 200

/** The refusals an egress proxy gives, in the codes every other refusal uses. */
export type UpstreamRefusalCode = Extract<
  EgressErrorCode,
  'blocked-address' | 'dns-failed' | 'connect-failed' | 'timeout'
>

export type Tunnel =
  | { readonly ok: true; readonly socket: net.Socket }
  | { readonly ok: false; readonly code: UpstreamRefusalCode; readonly detail: string }

/**
 * A TCP tunnel to host:port through the egress proxy in front of this process (Smokescreen,
 * M2.1 plan §5b): an HTTP CONNECT, answered 200 before a byte goes through. The proxy resolves
 * the name, refuses a refused address or port, and dials; its refusals come back as the codes
 * safeFetch uses. A name is sent as it is: where the proxy runs, DNS is its to ask.
 *
 * Rejects only when the signal ends the wait; every other failure is a refusal.
 */
export function openTunnel(
  upstream: URL,
  host: string,
  port: number,
  signal: AbortSignal,
  timeoutMs = UPSTREAM_CONNECT_TIMEOUT_MS,
): Promise<Tunnel> {
  if (signal.aborted) return Promise.reject(abortReason(signal))
  const authority = net.isIPv6(host) ? `[${host}]:${port}` : `${host}:${port}`
  return new Promise<Tunnel>((resolve, reject) => {
    const socket = net.connect({
      host: upstream.hostname,
      port: upstream.port === '' ? 80 : Number(upstream.port),
    })
    let answer = Buffer.alloc(0)
    let settled = false
    const timer = setTimeout(() => {
      refuse('timeout', `The egress proxy did not answer within ${timeoutMs} ms`)
    }, timeoutMs)
    const cleanUp = () => {
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      socket.off('readable', onReadable)
      socket.off('error', onError)
      socket.off('close', onClose)
    }
    const refuse = (code: UpstreamRefusalCode, detail: string) => {
      if (settled) return
      cleanUp()
      socket.destroy()
      resolve({ ok: false, code, detail: detail.slice(0, MAX_DETAIL) })
    }
    const onAbort = () => {
      if (settled) return
      cleanUp()
      socket.destroy()
      reject(abortReason(signal))
    }
    const onError = (error: Error) => {
      refuse('connect-failed', `The egress proxy could not be reached: ${error.message}`)
    }
    const onClose = () => {
      refuse('connect-failed', 'The egress proxy closed the connection before answering')
    }
    // Read with 'readable', not 'data': once its listener is gone, the socket neither flows nor
    // stays paused, so the TLS or HTTP client that takes it starts it.
    const onReadable = () => {
      for (;;) {
        const chunk = socket.read() as Buffer | null
        if (chunk === null) return
        answer = Buffer.concat([answer, chunk])
        const end = answer.indexOf('\r\n\r\n')
        if (end === -1) {
          if (answer.length > MAX_ANSWER_BYTES) {
            refuse('connect-failed', 'The egress proxy answer is too long')
            return
          }
          continue
        }
        const head = answer.subarray(0, end).toString('latin1')
        const rest = answer.subarray(end + 4)
        const status = /^HTTP\/1\.[01] (\d{3})/.exec(head)?.[1]
        if (status === '200') {
          // The far end of a tunnel waits for the client to speak first, in TLS as in HTTP; bytes
          // before that are not a tunnel's, and TLS, reading the socket's own handle, would
          // never see them.
          if (rest.length > 0 || socket.readableLength > 0) {
            refuse('connect-failed', 'The egress proxy sent data before the tunnel was used')
            return
          }
          cleanUp()
          resolve({ ok: true, socket })
          return
        }
        const reason = headerValue(head, 'x-smokescreen-error') ?? head.split('\r\n')[0] ?? ''
        refuse(refusalOf(Number(status ?? 0), reason), reason)
        return
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })
    socket.on('readable', onReadable)
    socket.on('error', onError)
    socket.on('close', onClose)
    socket.once('connect', () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`)
    })
  })
}

/**
 * Smokescreen's answers (pkg/smokescreen, rejectResponse): 407 for an address or a rule it
 * refuses, 502 for a name it cannot resolve or a host it cannot reach, 504 when the host does not
 * answer in time. Anything else is a failure to connect.
 */
function refusalOf(status: number, reason: string): UpstreamRefusalCode {
  if (status === 407) return 'blocked-address'
  if (status === 504) return 'timeout'
  if (status === 502 && /resolve/i.test(reason)) return 'dns-failed'
  return 'connect-failed'
}

function headerValue(head: string, name: string): string | undefined {
  for (const line of head.split('\r\n').slice(1)) {
    const colon = line.indexOf(':')
    if (colon > 0 && line.slice(0, colon).trim().toLowerCase() === name) {
      return line.slice(colon + 1).trim()
    }
  }
  return undefined
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Aborted')
}
