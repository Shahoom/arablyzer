import { localInterfaceCidrs, publicInterfaceCidrs, type InterfaceMap } from './interfaces'
import { createPolicy, type EgressPolicy } from './policy'

/** Addresses the server must never reach that it cannot see itself, comma-separated CIDRs. */
export const DENY_CIDRS_VARIABLE = 'ARABLYZER_DENY_CIDRS'
/** Opens private ranges, for scanning local pages in development; refused in production. */
export const ALLOW_PRIVATE_VARIABLE = 'ARABLYZER_ALLOW_PRIVATE'

/**
 * The policy of Arablyzer's own servers, the API and the worker (M2.1b): public addresses on
 * ports 80 and 443, never this machine's own addresses, nor those ARABLYZER_DENY_CIDRS names,
 * such as the server's public address behind NAT (CLAUDE.md, BUILD-PLAN §18.3.1). Private,
 * loopback, link-local, CGNAT and metadata ranges are refused as everywhere. In development,
 * ARABLYZER_ALLOW_PRIVATE=1 opens private ranges as the CLI's --allow-private does, and still
 * refuses this machine's public addresses.
 */
export function serverPolicy(
  env: Readonly<Record<string, string | undefined>>,
  interfaces?: InterfaceMap,
): EgressPolicy {
  const extra = (env[DENY_CIDRS_VARIABLE] ?? '')
    .split(',')
    .map((cidr) => cidr.trim())
    .filter((cidr) => cidr !== '')
  if (env[ALLOW_PRIVATE_VARIABLE]?.trim() === '1') {
    if (env.NODE_ENV === 'production') {
      throw new Error(`${ALLOW_PRIVATE_VARIABLE} opens private addresses: never in production`)
    }
    return createPolicy({
      allowPrivate: true,
      denyCidrs: [...publicInterfaceCidrs(interfaces), ...extra],
    })
  }
  return createPolicy({ denyCidrs: [...localInterfaceCidrs(interfaces), ...extra] })
}
