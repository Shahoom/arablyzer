import ipaddr from 'ipaddr.js'
import type { EgressPolicy } from './policy'
import {
  IPV4_RANGES,
  IPV6_GLOBAL_UNICAST,
  IPV6_RANGES,
  NAT64_WELL_KNOWN,
  SIX_TO_FOUR,
  type SpecialRange,
} from './ranges'

type Address = ipaddr.IPv4 | ipaddr.IPv6

export type AddressVerdict =
  | { readonly allowed: true; readonly address: string; readonly kind: 'public' | 'private' }
  | { readonly allowed: false; readonly address: string; readonly range: string }

export type EndpointVerdict =
  | { readonly allowed: true; readonly kind: 'public' | 'private' | 'test-target' }
  | {
      readonly allowed: false
      readonly code: 'blocked-address' | 'port-not-allowed'
      readonly range: string
    }

const parsedCidrs = new Map<string, [Address, number]>()

function inRange(address: Address, cidr: string): boolean {
  let parsed = parsedCidrs.get(cidr)
  if (parsed === undefined) {
    parsed = ipaddr.parseCIDR(cidr)
    parsedCidrs.set(cidr, parsed)
  }
  const [network, bits] = parsed
  if (address instanceof ipaddr.IPv4 && network instanceof ipaddr.IPv4) {
    return address.match(network, bits)
  }
  if (address instanceof ipaddr.IPv6 && network instanceof ipaddr.IPv6) {
    return address.match(network, bits)
  }
  return false
}

/**
 * `::a.b.c.d` is the deprecated IPv4-compatible form (resolvers print it for such AAAA answers).
 * ipaddr.js reads it as IPv4-mapped, so it is caught here, before parsing.
 */
const IPV4_COMPATIBLE = /^::(?:\d{1,3}\.){3}\d{1,3}$/

/** Classify one IP address under a policy. Ports are checked separately by `vetEndpoint`. */
export function classifyAddress(address: string, policy: EgressPolicy): AddressVerdict {
  if (IPV4_COMPATIBLE.test(address)) {
    return { allowed: false, address, range: 'not-global-unicast' }
  }
  let parsed: Address
  try {
    parsed = ipaddr.parse(address)
  } catch {
    return { allowed: false, address, range: 'invalid-address' }
  }
  return classify(parsed, address, policy)
}

function classify(address: Address, original: string, policy: EgressPolicy): AddressVerdict {
  if (policy.denyCidrs.some((cidr) => inRange(address, cidr))) {
    return { allowed: false, address: original, range: 'configured-deny' }
  }
  if (address instanceof ipaddr.IPv4) {
    return (
      matchRanges(address, original, IPV4_RANGES, policy) ?? {
        allowed: true,
        address: original,
        kind: 'public',
      }
    )
  }
  const embedded = embeddedIPv4(address)
  if (embedded !== null) {
    const inner = classify(embedded.ipv4, original, policy)
    // Mapped and NAT64 addresses are the IPv4 inside; a 6to4 address must also pass as IPv6.
    if (!inner.allowed || embedded.via !== '6to4') return inner
  }
  const special = matchRanges(address, original, IPV6_RANGES, policy)
  if (special !== null) return special
  if (!inRange(address, IPV6_GLOBAL_UNICAST)) {
    return { allowed: false, address: original, range: 'not-global-unicast' }
  }
  return { allowed: true, address: original, kind: 'public' }
}

function matchRanges(
  address: Address,
  original: string,
  ranges: readonly SpecialRange[],
  policy: EgressPolicy,
): AddressVerdict | null {
  const matches = ranges.filter((range) => inRange(address, range.cidr))
  const hard = matches.find((range) => !range.privateUse)
  if (hard !== undefined) return { allowed: false, address: original, range: hard.name }
  const soft = matches[0]
  if (soft === undefined) return null
  return policy.allowPrivate
    ? { allowed: true, address: original, kind: 'private' }
    : { allowed: false, address: original, range: soft.name }
}

function embeddedIPv4(
  address: ipaddr.IPv6,
): { via: 'mapped' | 'nat64' | '6to4'; ipv4: ipaddr.IPv4 } | null {
  if (address.isIPv4MappedAddress()) return { via: 'mapped', ipv4: address.toIPv4Address() }
  const bytes = address.toByteArray()
  if (inRange(address, NAT64_WELL_KNOWN)) {
    return { via: 'nat64', ipv4: new ipaddr.IPv4(bytes.slice(12, 16)) }
  }
  if (inRange(address, SIX_TO_FOUR)) {
    return { via: '6to4', ipv4: new ipaddr.IPv4(bytes.slice(2, 6)) }
  }
  return null
}

/** Vet one address:port pair: configured denies, then exact test targets, ranges, public ports. */
export function vetEndpoint(address: string, port: number, policy: EgressPolicy): EndpointVerdict {
  const verdict = classifyAddress(address, policy)
  if (!verdict.allowed && verdict.range === 'configured-deny') {
    return { allowed: false, code: 'blocked-address', range: verdict.range }
  }
  if (isTestTarget(address, port, policy)) return { allowed: true, kind: 'test-target' }
  if (!verdict.allowed) return { allowed: false, code: 'blocked-address', range: verdict.range }
  if (verdict.kind === 'public' && !policy.allowedPorts.includes(port)) {
    return { allowed: false, code: 'port-not-allowed', range: `port-${port}` }
  }
  return { allowed: true, kind: verdict.kind }
}

function isTestTarget(address: string, port: number, policy: EgressPolicy): boolean {
  if (policy.allowTargets.length === 0 || !ipaddr.isValid(address)) return false
  const normalized = ipaddr.process(address).toNormalizedString()
  return policy.allowTargets.some(
    (target) =>
      target.port === port && ipaddr.process(target.address).toNormalizedString() === normalized,
  )
}
