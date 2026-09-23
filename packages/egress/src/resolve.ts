import { Resolver as AresResolver, lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { vetEndpoint } from './classify'
import { egressError, type EgressError } from './errors'
import type { EgressPolicy } from './policy'

export interface ResolvedAddress {
  readonly address: string
  readonly family: 4 | 6
}

/** Resolves a host name; `signal` aborts when the fetch is cancelled or times out. */
export type Resolver = (
  hostname: string,
  signal: AbortSignal,
) => Promise<readonly ResolvedAddress[]>

/**
 * The operating system resolver (getaddrinfo). It honours /etc/hosts, which local builds
 * (--allow-private) may need, but it runs on the libuv threadpool and cannot be cancelled.
 */
export const systemResolver: Resolver = async (hostname) => {
  const answers = await lookup(hostname, { all: true, verbatim: true })
  return answers.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }))
}

export interface DnsResolverOptions {
  /** Per-attempt timeout; default 2000 ms. */
  readonly timeoutMs?: number
  /** Attempts per server; default 2. */
  readonly tries?: number
  /** Nameservers ("ip" or "ip:port"); default: the system's configured servers. */
  readonly servers?: readonly string[]
}

/**
 * DNS over c-ares (A and AAAA): it stays off the libuv threadpool, has its own timeout, and is
 * cancelled with the fetch, so a nameserver that never answers cannot stall a worker.
 */
export function createDnsResolver(options: DnsResolverOptions = {}): Resolver {
  return async (hostname, signal) => {
    signal.throwIfAborted()
    const resolver = new AresResolver({
      timeout: options.timeoutMs ?? 2000,
      tries: options.tries ?? 2,
    })
    if (options.servers !== undefined) resolver.setServers([...options.servers])
    const cancel = () => {
      resolver.cancel()
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const [ipv4, ipv6] = await Promise.allSettled([
        resolver.resolve4(hostname),
        resolver.resolve6(hostname),
      ])
      const addresses: ResolvedAddress[] = [
        ...(ipv4.status === 'fulfilled'
          ? ipv4.value.map((address) => ({ address, family: 4 as const }))
          : []),
        ...(ipv6.status === 'fulfilled'
          ? ipv6.value.map((address) => ({ address, family: 6 as const }))
          : []),
      ]
      if (addresses.length > 0) return addresses
      const reason: unknown = ipv4.status === 'rejected' ? ipv4.reason : undefined
      throw reason instanceof Error ? reason : new Error(`No addresses for ${hostname}`)
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  }
}

export const dnsResolver: Resolver = createDnsResolver()

/** c-ares for scans; getaddrinfo only for --allow-private local builds, where hosts files matter. */
export function defaultResolver(policy: EgressPolicy): Resolver {
  return policy.allowPrivate ? systemResolver : dnsResolver
}

export type EndpointCheck =
  | { readonly ok: true; readonly addresses: readonly ResolvedAddress[] }
  | { readonly ok: false; readonly error: EgressError }

/** Resolve the host and vet every answer; one bad answer blocks the whole host (design §1). */
export async function resolveEndpoint(
  url: URL,
  host: string,
  port: number,
  policy: EgressPolicy,
  resolver: Resolver,
  signal: AbortSignal,
): Promise<EndpointCheck> {
  const family = isIP(host)
  let addresses: readonly ResolvedAddress[]
  if (family !== 0) {
    addresses = [{ address: host, family: family === 6 ? 6 : 4 }]
  } else {
    try {
      addresses = await resolver(host, signal)
    } catch (error) {
      return {
        ok: false,
        error: egressError('dns-failed', url.href, `DNS lookup failed: ${describe(error)}`),
      }
    }
    if (addresses.length === 0) {
      return { ok: false, error: egressError('dns-failed', url.href, 'DNS returned no addresses') }
    }
  }
  for (const { address } of addresses) {
    const verdict = vetEndpoint(address, port, policy)
    if (!verdict.allowed) {
      return {
        ok: false,
        error: egressError(verdict.code, url.href, `${address} is not allowed (${verdict.range})`, {
          address,
          range: verdict.range,
        }),
      }
    }
  }
  return { ok: true, addresses }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
