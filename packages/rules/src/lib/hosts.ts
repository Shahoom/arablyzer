/**
 * Names reserved for local and test use, which no public site has: localhost and .localhost,
 * .test (RFC 6761), .local (RFC 6762), .home.arpa (RFC 8375) and .internal (ICANN, 2024).
 */
const LOCAL_NAMES = /(?:^|\.)(?:localhost|test|local|internal|home\.arpa)$/i

/** IPv4 loopback, private (RFC 1918), shared (RFC 6598) and link-local addresses, as [prefix, bits]. */
const LOCAL_V4: readonly (readonly [string, number])[] = [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10],
  ['169.254.0.0', 16],
]

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function ipv4Value(address: string): number | null {
  const parts = IPV4.exec(address)?.slice(1).map(Number)
  if (parts === undefined || parts.some((part) => part > 255)) return null
  return parts.reduce((total, part) => total * 256 + part, 0)
}

/**
 * A host of local development rather than a public site: a loopback, private or link-local
 * address, or a name reserved for local use. Checks that only public sites need, such as HTTPS,
 * leave these out. `hostname` is a URL's, which the URL parser has already normalized: IPv4 in
 * dotted decimal, IPv6 in brackets.
 */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/\.$/, '').toLowerCase()
  if (host.startsWith('[')) {
    const address = host.slice(1, -1)
    // Loopback, unique local (fc00::/7) and link-local (fe80::/10).
    return address === '::1' || /^f[cd]/.test(address) || /^fe[89ab]/.test(address)
  }
  const value = ipv4Value(host)
  if (value !== null) {
    return LOCAL_V4.some(([prefix, bits]) => {
      const base = ipv4Value(prefix) ?? 0
      const size = 2 ** (32 - bits)
      return Math.floor(value / size) === Math.floor(base / size)
    })
  }
  return LOCAL_NAMES.test(host)
}

/** Whether the host is an IP address rather than a name. */
export function isAddress(hostname: string): boolean {
  return hostname.startsWith('[') || ipv4Value(hostname) !== null
}

/** The URL's host name, or null when it is not a URL. */
export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
