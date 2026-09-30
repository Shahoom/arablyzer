import os from 'node:os'
import { classifyAddress } from './classify'
import { DEFAULT_POLICY } from './policy'

/** The shape of os.networkInterfaces() that matters here; tests pass their own. */
export type InterfaceMap = Readonly<
  Record<string, readonly { readonly address: string; readonly family: string }[] | undefined>
>

/**
 * This machine's own interface addresses as single-host deny CIDRs. On a machine with a public
 * IP on its interface (a VPS, a self-hosted CI runner), a redirect to that IP would otherwise
 * reach local services; the CLI denies these in its default mode.
 */
export function localInterfaceCidrs(interfaces: InterfaceMap = os.networkInterfaces()): string[] {
  const cidrs = new Set<string>()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      const address = entry.address.split('%')[0] ?? entry.address
      cidrs.add(`${address}/${entry.family === 'IPv6' ? 128 : 32}`)
    }
  }
  return [...cidrs].sort()
}

/**
 * The public ones among them, which the CLI still denies under --allow-private. That mode opens
 * private ranges for local builds, and a chain that starts on a public site loses it; without
 * this, the machine's own public IP would count as just another public site on ports 80 and 443.
 */
export function publicInterfaceCidrs(interfaces: InterfaceMap = os.networkInterfaces()): string[] {
  return localInterfaceCidrs(interfaces).filter((cidr) => {
    const verdict = classifyAddress(cidr.slice(0, cidr.lastIndexOf('/')), DEFAULT_POLICY)
    return verdict.allowed && verdict.kind === 'public'
  })
}
