import ipaddr from 'ipaddr.js'

/**
 * Where the administrator was, for the audit: an IPv6 address's /48 or an IPv4 address's /24,
 * never the address itself (BUILD-PLAN §14). Null where there is no address.
 */
export function networkOf(address: string | null): string | null {
  if (address === null) return null
  try {
    const parsed = ipaddr.process(address)
    if (parsed instanceof ipaddr.IPv6) {
      return `${ipaddr.IPv6.networkAddressFromCIDR(`${parsed.toString()}/48`).toString()}/48`
    }
    return `${ipaddr.IPv4.networkAddressFromCIDR(`${parsed.toString()}/24`).toString()}/24`
  } catch {
    return null
  }
}
