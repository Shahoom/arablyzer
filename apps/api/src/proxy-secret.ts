import { createHash, timingSafeEqual } from 'node:crypto'

/** The header the site's server sets on every request it forwards to the API (infra/Caddyfile). */
export const PROXY_SECRET_HEADER = 'x-arablyzer-proxy-secret'

const digest = (value: string) => createHash('sha256').update(value).digest()

/**
 * Whether a request came through the site's server, which holds the secret and puts it in
 * PROXY_SECRET_HEADER. Anything else that reaches the API's port (another container, or a
 * process on the host, which reaches the bridge) does not have it, so the address it names in
 * X-Forwarded-For is nobody's word. The digests are compared, so that neither the length of the
 * secret nor where a guess differs shows in the time it takes.
 */
export function isFromProxy(given: string | undefined, secret: string | undefined): boolean {
  if (given === undefined || secret === undefined || secret === '') return false
  return timingSafeEqual(digest(given), digest(secret))
}
