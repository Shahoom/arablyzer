import { readFile } from 'node:fs/promises'
import { networkIsolated } from '@arablyzer/browser/engines'
import { classifyAddress, DEFAULT_POLICY, dnsResolver, type Resolver } from '@arablyzer/egress'

// ARABLYZER_NETWORK_ISOLATED lets WebKit run, and WebKit sends its WebRTC traffic around the egress
// proxy (packages/browser/src/engines.ts). That is safe only where the container's network
// reaches the egress proxy and nothing else, and it is Compose's word, not the image's, that it
// does. So the scanner asks the container itself, at start: its routes, and its DNS.

/** Two names that always resolve on the internet, and that no part of the stack is named. */
const OUTSIDE_NAMES: readonly string[] = ['example.com', 'example.org']
/** Longer than Docker's resolver takes to say no (it answered SERVFAIL at once), and no longer. */
const DNS_TIMEOUT_MS = 5_000

const ROUTE_TABLE = '/proc/net/route'
const ROUTE_TABLE_V6 = '/proc/net/ipv6_route'
/** The route flags of <linux/route.h> that matter here. */
const RTF_UP = 0x1
const RTF_REJECT = 0x200

/** A dotted IPv4 address from the byte-swapped hexadecimal /proc/net/route writes. */
function dotted(hex: string): string {
  if (!/^[0-9A-Fa-f]{8}$/.test(hex)) return hex
  return [6, 4, 2, 0].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join('.')
}

/**
 * The default routes in /proc/net/route, as a description of each: a route to every address,
 * that is up. Its columns are Iface, Destination, Gateway, Flags, RefCnt, Use, Metric, Mask.
 */
export function defaultRoutes(table: string): string[] {
  const found: string[] = []
  for (const line of table.split('\n').slice(1)) {
    const [iface, destination, gateway, flags, , , , mask] = line.trim().split(/\s+/)
    if (iface === undefined || destination === undefined || gateway === undefined) continue
    if (destination !== '00000000' || mask !== '00000000') continue
    if ((Number.parseInt(flags ?? '', 16) & RTF_UP) === 0) continue
    found.push(gateway === '00000000' ? iface : `${iface} via ${dotted(gateway)}`)
  }
  return found
}

/**
 * The same for /proc/net/ipv6_route: Destination and its prefix length, Source and its length,
 * Next hop, Metric, RefCnt, Use, Flags, Iface. The kernel keeps a `reject` default route on the
 * loopback interface, which leads nowhere: it is not a way out.
 */
export function defaultRoutesV6(table: string): string[] {
  const found: string[] = []
  for (const line of table.split('\n')) {
    const columns = line.trim().split(/\s+/)
    const [destination, length, , , nextHop, , , , flags, iface] = columns
    if (iface === undefined || iface === 'lo') continue
    if (!/^0{32}$/.test(destination ?? '') || Number.parseInt(length ?? '', 16) !== 0) continue
    const bits = Number.parseInt(flags ?? '', 16)
    if ((bits & RTF_UP) === 0 || (bits & RTF_REJECT) !== 0) continue
    found.push(/^0{32}$/.test(nextHop ?? '') ? iface : `${iface} via ${nextHop ?? '?'}`)
  }
  return found
}

export interface IsolationProbe {
  /** The kernel's IPv4 routes (/proc/net/route); throws when they cannot be read. */
  readonly routes: () => Promise<string>
  /** Its IPv6 routes; null on a kernel without IPv6. */
  readonly routesV6: () => Promise<string | null>
  /** How a name is asked for, which is the only way the check reaches out. */
  readonly resolver: Resolver
  readonly names: readonly string[]
  readonly dnsTimeoutMs: number
}

export const SYSTEM_PROBE: IsolationProbe = {
  routes: () => readFile(ROUTE_TABLE, 'utf8'),
  routesV6: async () => {
    try {
      return await readFile(ROUTE_TABLE_V6, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  },
  resolver: dnsResolver,
  names: OUTSIDE_NAMES,
  dnsTimeoutMs: DNS_TIMEOUT_MS,
}

/** The public addresses a name resolves to here; none when it does not resolve, or is not asked. */
async function outsideAnswers(name: string, probe: IsolationProbe): Promise<string[]> {
  const signal = AbortSignal.timeout(probe.dnsTimeoutMs)
  const stopped = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(new Error('timeout'))
    })
  })
  try {
    const answers = await Promise.race([probe.resolver(name, signal), stopped])
    return answers
      .filter(({ address }) => {
        const verdict = classifyAddress(address, DEFAULT_POLICY)
        return verdict.allowed && verdict.kind === 'public'
      })
      .map(({ address }) => address)
  } catch {
    // No answer is what an isolated network gives: SERVFAIL, or no server to ask.
    return []
  }
}

/**
 * What shows this container's network reaches beyond the egress proxy, in words for the log; none
 * when it does not: no default route, in IPv4 or IPv6, and no outside name that resolves. A
 * table the kernel will not show counts against it, since the network cannot be shown to be
 * closed.
 */
export async function isolationProblems(probe: IsolationProbe = SYSTEM_PROBE): Promise<string[]> {
  const problems: string[] = []
  try {
    for (const route of defaultRoutes(await probe.routes())) {
      problems.push(`it has a default route (${route}), so its packets can leave`)
    }
    for (const route of defaultRoutesV6((await probe.routesV6()) ?? '')) {
      problems.push(`it has an IPv6 default route (${route}), so its packets can leave`)
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    problems.push(`its routes cannot be read (${reason}), so its network cannot be shown closed`)
  }
  const answered = await Promise.all(
    probe.names.map(async (name) => [name, await outsideAnswers(name, probe)] as const),
  )
  for (const [name, addresses] of answered) {
    if (addresses.length > 0) {
      problems.push(`${name} resolves (${addresses.join(', ')}), so it can ask outside DNS`)
    }
  }
  return problems
}

/**
 * Where ARABLYZER_NETWORK_ISOLATED is set, throws unless the container's network is closed: the
 * scanner then does not start at all, rather than running WebKit on a network that lets its
 * traffic out. Where it is not set, WebKit does not run (packages/browser), and nothing is asked.
 */
export async function assertIsolated(
  env: Readonly<Record<string, string | undefined>>,
  probe: IsolationProbe = SYSTEM_PROBE,
): Promise<void> {
  if (!networkIsolated(env)) return
  const problems = await isolationProblems(probe)
  if (problems.length === 0) return
  throw new Error(
    `ARABLYZER_NETWORK_ISOLATED is set, but this container's network is not isolated: ${problems.join('; ')}. ` +
      'Compose puts the scanner on internal networks alone (infra/compose.yaml); WebKit sends traffic around the egress proxy where the network lets it.',
  )
}
