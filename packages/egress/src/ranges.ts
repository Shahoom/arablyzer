/**
 * Address ranges Arablyzer never connects to. Sources: the IANA IPv4 and IPv6 Special-Purpose
 * Address Registries, plus multicast and reserved space (BUILD-PLAN §13, CLAUDE.md "Security").
 *
 * `privateUse: true` ranges are opened only by `allowPrivate` (the CLI's --allow-private, for local
 * builds). All other ranges stay blocked in every mode, including link-local (cloud metadata).
 */
export interface SpecialRange {
  readonly cidr: string
  readonly name: string
  readonly privateUse: boolean
}

export const IPV4_RANGES: readonly SpecialRange[] = [
  { cidr: '0.0.0.0/8', name: 'this-network', privateUse: false },
  { cidr: '10.0.0.0/8', name: 'private-10', privateUse: true },
  { cidr: '100.64.0.0/10', name: 'shared-cgnat', privateUse: true },
  { cidr: '100.100.100.200/32', name: 'metadata-alibaba', privateUse: false },
  { cidr: '127.0.0.0/8', name: 'loopback', privateUse: true },
  { cidr: '169.254.0.0/16', name: 'link-local', privateUse: false },
  { cidr: '172.16.0.0/12', name: 'private-172', privateUse: true },
  { cidr: '192.0.0.0/24', name: 'ietf-protocol-assignments', privateUse: false },
  { cidr: '192.0.2.0/24', name: 'documentation', privateUse: false },
  { cidr: '192.88.99.0/24', name: 'deprecated-6to4-relay', privateUse: false },
  { cidr: '192.168.0.0/16', name: 'private-192', privateUse: true },
  { cidr: '198.18.0.0/15', name: 'benchmarking', privateUse: false },
  { cidr: '198.51.100.0/24', name: 'documentation', privateUse: false },
  { cidr: '203.0.113.0/24', name: 'documentation', privateUse: false },
  { cidr: '224.0.0.0/4', name: 'multicast', privateUse: false },
  { cidr: '240.0.0.0/4', name: 'reserved', privateUse: false },
]

export const IPV6_RANGES: readonly SpecialRange[] = [
  { cidr: '::/128', name: 'unspecified', privateUse: false },
  { cidr: '::1/128', name: 'loopback', privateUse: true },
  { cidr: '64:ff9b:1::/48', name: 'nat64-local-use', privateUse: false },
  { cidr: '100::/64', name: 'discard-only', privateUse: false },
  { cidr: '2001::/23', name: 'ietf-protocol-assignments', privateUse: false },
  { cidr: '2001:db8::/32', name: 'documentation', privateUse: false },
  { cidr: '3fff::/20', name: 'documentation', privateUse: false },
  { cidr: 'fc00::/7', name: 'unique-local', privateUse: true },
  { cidr: 'fd00:ec2::254/128', name: 'metadata-aws', privateUse: false },
  { cidr: 'fe80::/10', name: 'link-local', privateUse: false },
  { cidr: 'fec0::/10', name: 'deprecated-site-local', privateUse: false },
  { cidr: 'ff00::/8', name: 'multicast', privateUse: false },
]

/** IPv6 outside global unicast is never public. */
export const IPV6_GLOBAL_UNICAST = '2000::/3'

/** Prefixes that carry an IPv4 address inside IPv6; the IPv4 inside is vetted too. */
export const NAT64_WELL_KNOWN = '64:ff9b::/96'
export const SIX_TO_FOUR = '2002::/16'
