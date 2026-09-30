import os from 'node:os'

/**
 * This machine's own interface addresses as single-host deny CIDRs. On a machine with a public
 * IP on its interface (a VPS, a self-hosted CI runner), a redirect to that IP would otherwise
 * reach local services; the CLI denies these in its default mode.
 */
export function localInterfaceCidrs(): string[] {
  const cidrs = new Set<string>()
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      const address = entry.address.split('%')[0] ?? entry.address
      cidrs.add(`${address}/${entry.family === 'IPv6' ? 128 : 32}`)
    }
  }
  return [...cidrs].sort()
}
