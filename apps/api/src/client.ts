import { createHmac } from 'node:crypto'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import ipaddr from 'ipaddr.js'
import { isFromProxy, PROXY_SECRET_HEADER } from './proxy-secret'

/**
 * Where the visitor's address comes from. `none`: the connection itself. `cloudflare`: the
 * CF-Connecting-IP header, trusted only when Cloudflare is the one way in. `proxy`: the last
 * address in X-Forwarded-For, which the one proxy in front of the API (Caddy) appends, and
 * believed only on a request that carries that proxy's secret (proxy-secret.ts).
 */
export type TrustProxy = 'none' | 'cloudflare' | 'proxy'

export function trustProxyFrom(value: string | undefined): TrustProxy {
  const trust = value?.trim() ?? 'none'
  if (trust === '' || trust === 'none') return 'none'
  if (trust === 'cloudflare' || trust === 'proxy') return trust
  throw new Error(`ARABLYZER_TRUST_PROXY is none, cloudflare or proxy, not ${trust}`)
}

/**
 * The visitor's address, or null when the trusted source has none that is an IP address. With
 * `proxy`, a request without the proxy's secret has none: whoever else can reach the API could
 * write any address in X-Forwarded-For.
 */
export function clientAddress(c: Context, trust: TrustProxy, proxySecret?: string): string | null {
  if (trust === 'proxy' && !isFromProxy(c.req.header(PROXY_SECRET_HEADER), proxySecret)) {
    return null
  }
  const address =
    trust === 'cloudflare'
      ? c.req.header('cf-connecting-ip')
      : trust === 'proxy'
        ? c.req.header('x-forwarded-for')?.split(',').at(-1)
        : getConnInfo(c).remote.address
  const trimmed = address?.trim()
  return trimmed !== undefined && ipaddr.isValid(trimmed) ? trimmed : null
}

/**
 * Who the limit counts: an IPv4 address, or an IPv6 address's /64, since one visitor's network
 * gets a /64 and chooses any address in it. Written one way whatever the spelling: an IPv4
 * address mapped into IPv6 is that IPv4 address, and IPv6 is written compressed.
 */
export function limitSubject(address: string): string {
  const parsed = ipaddr.process(address)
  return parsed.kind() === 'ipv6'
    ? `${ipaddr.IPv6.networkAddressFromCIDR(`${parsed.toString()}/64`).toString()}/64`
    : parsed.toString()
}

/**
 * A key for the visitor's scans that is not their address: an HMAC under a secret and the day,
 * so the limiter's store never holds an address, and keys cannot be linked across days (§14).
 * The day turns at 00:00 UTC, which starts every bucket afresh then.
 */
export function connectionKey(address: string, secret: string, now: Date): string {
  const day = now.toISOString().slice(0, 10)
  return createHmac('sha256', secret)
    .update(`${day}|${limitSubject(address)}`)
    .digest('base64url')
    .slice(0, 32)
}
