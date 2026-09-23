import ipaddr from 'ipaddr.js'

/** An exact address:port pair a test may reach (a local fixture server). */
export interface EgressTarget {
  readonly address: string
  readonly port: number
}

export interface EgressPolicy {
  /** Ports allowed on public addresses (BUILD-PLAN §13: 80 and 443). */
  readonly allowedPorts: readonly number[]
  /**
   * `--allow-private`: open private, loopback, CGNAT and unique-local ranges on any port.
   * Never opens link-local or metadata addresses.
   */
  readonly allowPrivate: boolean
  /** Extra CIDRs blocked in every mode, e.g. the host server's own public IP (CLAUDE.md). */
  readonly denyCidrs: readonly string[]
  /** Exact test targets allowed despite the rules above. Programmatic only; never a CLI flag. */
  readonly allowTargets: readonly EgressTarget[]
}

export const DEFAULT_POLICY: EgressPolicy = Object.freeze({
  allowedPorts: Object.freeze([80, 443]),
  allowPrivate: false,
  denyCidrs: Object.freeze([]),
  allowTargets: Object.freeze([]),
})

/** Validates every field and returns frozen copies, so later changes to the inputs cannot loosen it. */
export function createPolicy(overrides: Partial<EgressPolicy> = {}): EgressPolicy {
  const merged: EgressPolicy = { ...DEFAULT_POLICY, ...overrides }
  return Object.freeze({
    allowedPorts: Object.freeze(merged.allowedPorts.map(validPort)),
    allowPrivate: merged.allowPrivate,
    denyCidrs: Object.freeze(merged.denyCidrs.map(normalizeDenyCidr)),
    allowTargets: Object.freeze(merged.allowTargets.map(validTestTarget)),
  })
}

function validPort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError(`Invalid port: ${port}`)
  }
  return port
}

/** IPv4-mapped IPv6 CIDRs are rewritten as IPv4, so they also match plain IPv4 addresses. */
function normalizeDenyCidr(cidr: string): string {
  let parsed: [ipaddr.IPv4 | ipaddr.IPv6, number]
  try {
    parsed = ipaddr.parseCIDR(cidr)
  } catch {
    throw new TypeError(`Invalid deny CIDR: ${cidr}`)
  }
  const [network, bits] = parsed
  if (network instanceof ipaddr.IPv6 && network.isIPv4MappedAddress()) {
    if (bits < 96) {
      throw new TypeError(
        `Invalid deny CIDR: ${cidr} (IPv4-mapped ranges need a /96 or longer prefix)`,
      )
    }
    return `${network.toIPv4Address().toString()}/${bits - 96}`
  }
  return `${network.toString()}/${bits}`
}

/** Test targets are local fixture servers: loopback only, so the escape hatch cannot reach anything else. */
function validTestTarget(target: EgressTarget): EgressTarget {
  if (!ipaddr.isValid(target.address) || ipaddr.process(target.address).range() !== 'loopback') {
    throw new TypeError(`allowTargets accepts loopback addresses only, not ${target.address}`)
  }
  if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535) {
    throw new TypeError(`Invalid allowTargets port: ${target.port}`)
  }
  return Object.freeze({ address: target.address, port: target.port })
}
