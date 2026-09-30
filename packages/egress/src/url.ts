import { isIP } from 'node:net'
import { egressError, type EgressError, type EgressErrorCode } from './errors'
import type { EgressPolicy } from './policy'
import { redactUrl } from './redact'

/** BUILD-PLAN §11. */
export const MAX_URL_LENGTH = 2048

export type UrlCheck =
  | { readonly ok: true; readonly url: URL; readonly host: string; readonly port: number }
  | { readonly ok: false; readonly error: EgressError }

/** Checks that need no DNS: scheme, length, credentials, port, and always-internal host names. */
export function checkUrl(input: string, policy: EgressPolicy): UrlCheck {
  const raw = input.trim()
  if (raw.length > MAX_URL_LENGTH) {
    return reject('url-too-long', raw, `URL is longer than ${MAX_URL_LENGTH} characters`)
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return reject('invalid-url', raw, 'Not an absolute URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return reject(
      'unsupported-scheme',
      url.href,
      `Only http and https are scanned, not ${url.protocol}`,
    )
  }
  if (url.href.length > MAX_URL_LENGTH) {
    return reject('url-too-long', url.href, `URL is longer than ${MAX_URL_LENGTH} characters`)
  }
  if (url.username !== '' || url.password !== '') {
    url.username = ''
    url.password = ''
    return reject(
      'credentials-in-url',
      url.href,
      'URLs with a user name or password are not scanned',
    )
  }
  const port = url.port === '' ? (url.protocol === 'https:' ? 443 : 80) : Number(url.port)
  if (!mayAllowPort(port, policy)) {
    return reject('port-not-allowed', url.href, `Port ${port} is not allowed`)
  }
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname
  if (isIP(host) === 0 && !policy.allowPrivate && isInternalName(host)) {
    return reject('blocked-host', url.href, `${host} is an internal host name`)
  }
  return { ok: true, url, host, port }
}

function mayAllowPort(port: number, policy: EgressPolicy): boolean {
  return (
    policy.allowedPorts.includes(port) ||
    policy.allowPrivate ||
    policy.allowTargets.some((target) => target.port === port)
  )
}

/** localhost names (RFC 6761) and single-label names (Docker services, intranets) are never public. */
function isInternalName(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, '')
  return name === 'localhost' || name.endsWith('.localhost') || !name.includes('.')
}

function reject(code: EgressErrorCode, url: string, message: string): UrlCheck {
  return { ok: false, error: egressError(code, redactUrl(url).slice(0, 200), message) }
}
