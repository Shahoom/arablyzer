import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'
import { classifyAddress } from './classify'
import { localInterfaceCidrs, publicInterfaceCidrs, type InterfaceMap } from './interfaces'
import { createPolicy, DEFAULT_POLICY, type EgressPolicy } from './policy'

/** Addresses the server must never reach that it cannot see itself, comma-separated CIDRs. */
export const DENY_CIDRS_VARIABLE = 'ARABLYZER_DENY_CIDRS'
/** Opens private ranges, for scanning local pages in development; refused in production. */
export const ALLOW_PRIVATE_VARIABLE = 'ARABLYZER_ALLOW_PRIVATE'
/** The egress proxy in front of the process, http://host:port (Smokescreen in Compose). */
export const EGRESS_PROXY_VARIABLE = 'ARABLYZER_EGRESS_PROXY'

/**
 * One entry of ARABLYZER_DENY_CIDRS, in the one spelling that every reader of it takes for the
 * same range. ipaddr.js reads `203.0.113/24` as 203.0.0.113/24 and `010.0.0.1` as 8.0.0.1
 * (octal), where the egress proxy (Go's net.ParseCIDR) refuses both, and it takes an IPv6
 * zone (`fe80::1%eth0`); a range that means one thing to the proxy and another to the API would
 * be refused by one and open in the other. So an address is written out in full, IPv4 or IPv6,
 * with a prefix length, and an IPv4 address is written as IPv4, not as `::ffff:a.b.c.d`, which
 * the proxy does not match against an IPv4 address.
 */
export function denyCidr(entry: string): string {
  const invalid = (why: string): never => {
    throw new TypeError(`Invalid deny CIDR: ${entry} (${why})`)
  }
  const slash = entry.indexOf('/')
  if (slash < 0) {
    return invalid(
      'it needs a prefix length: 203.0.113.7/32 for one address, 2001:db8::7/128 for one IPv6 address',
    )
  }
  const address = entry.slice(0, slash)
  const prefix = entry.slice(slash + 1)
  const family = address.includes('%') ? 0 : isIP(address)
  if (family === 0) {
    return invalid(
      'the address is an IPv4 or IPv6 address written out in full, with no zone, brackets, or short, octal or hexadecimal form',
    )
  }
  if (family === 6 && ipaddr.IPv6.parse(address).isIPv4MappedAddress()) {
    return invalid('write an IPv4 address as IPv4: 203.0.113.7/32')
  }
  if (!/^(?:0|[1-9]\d{0,2})$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)) {
    return invalid('the prefix is a whole number, from 0 to 32 for IPv4 and to 128 for IPv6')
  }
  return entry
}

/** ARABLYZER_DENY_CIDRS as a list: comma-separated, each entry checked by denyCidr. */
export function denyCidrsFrom(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((cidr) => cidr.trim())
    .filter((cidr) => cidr !== '')
    .map(denyCidr)
}

export interface DenyCidrsCheck {
  readonly cidrs: readonly string[]
  /** What the list leaves open, for the log at start; the list itself is valid. */
  readonly warnings: readonly string[]
}

/**
 * ARABLYZER_DENY_CIDRS as production needs it: the server's own public address, which none of the
 * server's processes can see behind NAT (BUILD-PLAN §18.3.1), so at least one range, each valid
 * (denyCidr), none of them every address. It warns of what such a list can still leave open: no
 * public range at all, as when only the server's private address was given, which is refused
 * anyway; and no IPv6 range, where the host has an IPv6 address that a name can point at.
 */
export function checkDenyCidrs(value: string | undefined): DenyCidrsCheck {
  const cidrs = denyCidrsFrom(value)
  if (cidrs.length === 0) {
    throw new TypeError(
      `${DENY_CIDRS_VARIABLE} must name the server's own public address, as a CIDR (203.0.113.7/32), and its IPv6 address if it has one (2001:db8::7/128)`,
    )
  }
  const everything = cidrs.find((cidr) => cidr.endsWith('/0'))
  if (everything !== undefined) {
    throw new TypeError(`Invalid deny CIDR: ${everything} (a prefix of 0 refuses every address)`)
  }
  const warnings: string[] = []
  const isPublic = (cidr: string) => {
    const verdict = classifyAddress(cidr.slice(0, cidr.indexOf('/')), DEFAULT_POLICY)
    return verdict.allowed && verdict.kind === 'public'
  }
  if (!cidrs.some(isPublic)) {
    warnings.push(
      `${DENY_CIDRS_VARIABLE} names no public address, so the server's own public address is not refused: name it (203.0.113.7/32)`,
    )
  }
  if (!cidrs.some((cidr) => cidr.includes(':'))) {
    warnings.push(
      `${DENY_CIDRS_VARIABLE} names no IPv6 range: a host with a public IPv6 address should name it too (2001:db8::7/128, or its /64), so that a name that points at it is refused`,
    )
  }
  return { cidrs, warnings }
}

/**
 * The policy of Arablyzer's own servers, the API and the worker (M2.1b): public addresses on
 * ports 80 and 443, never this machine's own addresses, nor those ARABLYZER_DENY_CIDRS names,
 * such as the server's public address behind NAT (CLAUDE.md, BUILD-PLAN §18.3.1). Private,
 * loopback, link-local, CGNAT and metadata ranges are refused as everywhere. In development,
 * ARABLYZER_ALLOW_PRIVATE=1 opens private ranges as the CLI's --allow-private does, and still
 * refuses this machine's public addresses. ARABLYZER_EGRESS_PROXY sends every connection through
 * the egress proxy in front of the process, which resolves names (M2.1 plan §5b).
 */
export function serverPolicy(
  env: Readonly<Record<string, string | undefined>>,
  interfaces?: InterfaceMap,
): EgressPolicy {
  const extra = denyCidrsFrom(env[DENY_CIDRS_VARIABLE])
  const proxy = env[EGRESS_PROXY_VARIABLE]?.trim()
  const upstream = proxy === undefined || proxy === '' ? {} : { upstream: proxy }
  if (env[ALLOW_PRIVATE_VARIABLE]?.trim() === '1') {
    if (env.NODE_ENV === 'production') {
      throw new Error(`${ALLOW_PRIVATE_VARIABLE} opens private addresses: never in production`)
    }
    return createPolicy({
      allowPrivate: true,
      denyCidrs: [...publicInterfaceCidrs(interfaces), ...extra],
      ...upstream,
    })
  }
  return createPolicy({ denyCidrs: [...localInterfaceCidrs(interfaces), ...extra], ...upstream })
}
