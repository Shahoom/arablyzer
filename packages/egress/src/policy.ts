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

export function createPolicy(overrides: Partial<EgressPolicy> = {}): EgressPolicy {
  const policy: EgressPolicy = { ...DEFAULT_POLICY, ...overrides }
  for (const cidr of policy.denyCidrs) {
    if (!isValidCidr(cidr)) throw new TypeError(`Invalid deny CIDR: ${cidr}`)
  }
  for (const target of policy.allowTargets) {
    if (!ipaddr.isValid(target.address)) {
      throw new TypeError(`Invalid allow target address: ${target.address}`)
    }
  }
  return Object.freeze(policy)
}

function isValidCidr(cidr: string): boolean {
  try {
    ipaddr.parseCIDR(cidr)
    return true
  } catch {
    return false
  }
}
