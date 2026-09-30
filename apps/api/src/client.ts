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
 * How much of an IPv6 address is one visitor's: a /48, which a provider routes to one customer,
 * who then has 65,536 /64s of their own, and chooses any address in any of them. Counting the
 * /64 gave a customer that many visitors (security review, issue #30).
 */
const VISITOR_PREFIX = 48
/**
 * How much is one network's: a /32, the least a registry gives a provider, and 65,536 /48s. The
 * network has a limit of its own (packages/plans, `perNetwork`), so a provider's allocation is
 * not that many visitors either.
 */
const NETWORK_PREFIX = 32

/** An IPv6 address's network of this many bits, written as `2001:db8::/32`. */
function prefixOf(address: ipaddr.IPv6, bits: number): string {
  return `${ipaddr.IPv6.networkAddressFromCIDR(`${address.toString()}/${String(bits)}`).toString()}/${String(bits)}`
}

/**
 * Who the limit counts: an IPv4 address, or an IPv6 address's /48, since one visitor's network
 * gets at least that and chooses any address in it. Written one way whatever the spelling: an IPv4
 * address mapped into IPv6 is that IPv4 address, and IPv6 is written compressed.
 */
export function limitSubject(address: string): string {
  const parsed = ipaddr.process(address)
  return parsed instanceof ipaddr.IPv6 ? prefixOf(parsed, VISITOR_PREFIX) : parsed.toString()
}

/** The network an IPv6 visitor is in, its /32; none for an IPv4 address. */
export function networkSubject(address: string): string | null {
  const parsed = ipaddr.process(address)
  return parsed instanceof ipaddr.IPv6 ? prefixOf(parsed, NETWORK_PREFIX) : null
}

/** A key that is not what it counts: an HMAC under a secret and the day, cut to 32 characters. */
function keyOf(subject: string, secret: string, now: Date): string {
  const day = now.toISOString().slice(0, 10)
  return createHmac('sha256', secret).update(`${day}|${subject}`).digest('base64url').slice(0, 32)
}

/**
 * A key for the visitor's scans that is not their address: an HMAC under a secret and the day,
 * so the limiter's store never holds an address, and keys cannot be linked across days (§14).
 * The day turns at 00:00 UTC, which starts every bucket afresh then.
 */
export function connectionKey(address: string, secret: string, now: Date): string {
  return keyOf(limitSubject(address), secret, now)
}

/**
 * The same for the network an IPv6 visitor is in, whose scans are counted together: null for an
 * IPv4 address, which is in none. Its subject ends in /32 and a visitor's in /48 or is an IPv4
 * address, so a network's key is never a visitor's.
 */
export function networkKey(address: string, secret: string, now: Date): string | null {
  const subject = networkSubject(address)
  return subject === null ? null : keyOf(subject, secret, now)
}
