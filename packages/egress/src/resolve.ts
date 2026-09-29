import { Resolver as AresResolver, lookup } from 'node:dns/promises'
import { isIP, type LookupFunction } from 'node:net'
import { vetEndpoint } from './classify'
import { egressError, type EgressError } from './errors'
import type { EgressPolicy } from './policy'

export interface ResolvedAddress {
  readonly address: string
  readonly family: 4 | 6
}

/**
 * A name's TXT records, each record's strings joined without spaces, as RFC 7208 §3.3 reads
 * them. `none`: the name has no TXT records, or does not exist (NXDOMAIN), which RFC 7208 §4.3
 * reads as no records too. `failed`: no answer: the lookup timed out, the server failed or
 * refused, or the lookup was cancelled. A failure is never read as `none`.
 */
export interface TxtAnswer {
  readonly outcome: 'found' | 'none' | 'failed'
  readonly records: readonly string[]
}

/** Asks for one name's TXT records, and no other type or name; never throws. */
export type TxtResolver = (name: string, signal: AbortSignal) => Promise<TxtAnswer>

/** Resolves a host name; `signal` aborts when the fetch is cancelled or times out. */
export type Resolver = ((
  hostname: string,
  signal: AbortSignal,
) => Promise<readonly ResolvedAddress[]>) & {
  /**
   * The same resolver's TXT lookups, where it has them: what the rules that read DNS records ask
   * for (M2.3c). A resolver without them can check no such rule.
   */
  readonly txt?: TxtResolver
}

export interface DnsResolverOptions {
  /** Per-attempt timeout; default 2000 ms. */
  readonly timeoutMs?: number
  /** Attempts per server; default 2. */
  readonly tries?: number
  /** Nameservers ("ip" or "ip:port"); default: the system's configured servers. */
  readonly servers?: readonly string[]
}

/** A c-ares resolver of its own for one lookup, so cancelling it cancels nothing else. */
function aresResolver(options: DnsResolverOptions): AresResolver {
  const resolver = new AresResolver({
    timeout: options.timeoutMs ?? 2000,
    tries: options.tries ?? 2,
  })
  if (options.servers !== undefined) resolver.setServers([...options.servers])
  return resolver
}

/** c-ares's codes for a name that does not exist (NXDOMAIN) and for an answer without records. */
const NO_RECORDS: ReadonlySet<string> = new Set(['ENOTFOUND', 'ENODATA'])
const NONE: TxtAnswer = Object.freeze({ outcome: 'none', records: Object.freeze([]) })
const FAILED: TxtAnswer = Object.freeze({ outcome: 'failed', records: Object.freeze([]) })

/**
 * TXT lookups over c-ares, with createDnsResolver's options and its timeout and cancellation: one
 * question, TXT, for the name given. A DNS message bounds the answer (64 KiB).
 */
export function createTxtResolver(options: DnsResolverOptions = {}): TxtResolver {
  return async (name, signal) => {
    if (signal.aborted) return FAILED
    const resolver = aresResolver(options)
    const cancel = () => {
      resolver.cancel()
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const records = await resolver.resolveTxt(name)
      if (records.length === 0) return NONE
      return { outcome: 'found', records: records.map((strings) => strings.join('')) }
    } catch (error) {
      return NO_RECORDS.has(errorCode(error)) ? NONE : FAILED
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  }
}

/**
 * The operating system resolver (getaddrinfo). It honours /etc/hosts, which local builds
 * (--allow-private) may need, but it runs on the libuv threadpool and cannot be cancelled. Its
 * TXT lookups are c-ares's, with the system's servers: getaddrinfo has none.
 */
export const systemResolver: Resolver = Object.assign(
  async (hostname: string): Promise<readonly ResolvedAddress[]> => {
    const answers = await lookup(hostname, { all: true, verbatim: true })
    return answers.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }))
  },
  { txt: createTxtResolver() },
)

/**
 * DNS over c-ares (A and AAAA): it stays off the libuv threadpool, has its own timeout, and is
 * cancelled with the fetch, so a nameserver that never answers cannot stall a worker. Its TXT
 * lookups (createTxtResolver) ask the same servers the same way.
 */
export function createDnsResolver(options: DnsResolverOptions = {}): Resolver {
  const resolve = async (
    hostname: string,
    signal: AbortSignal,
  ): Promise<readonly ResolvedAddress[]> => {
    signal.throwIfAborted()
    const resolver = aresResolver(options)
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
  return Object.assign(resolve, { txt: createTxtResolver(options) })
}

export const dnsResolver: Resolver = createDnsResolver()

/** c-ares for scans; getaddrinfo only for --allow-private local builds, where hosts files matter. */
export function defaultResolver(policy: EgressPolicy): Resolver {
  return policy.allowPrivate ? systemResolver : dnsResolver
}

export type EndpointCheck =
  | {
      readonly ok: true
      readonly addresses: readonly ResolvedAddress[]
      /** Every address is private (opened only by --allow-private). */
      readonly private: boolean
    }
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
  let allPrivate = true
  for (const { address } of addresses) {
    const verdict = vetEndpoint(address, port, policy)
    if (verdict.allowed) allPrivate &&= verdict.kind === 'private'
    else {
      return {
        ok: false,
        error: egressError(verdict.code, url.href, `${address} is not allowed (${verdict.range})`, {
          address,
          range: verdict.range,
        }),
      }
    }
  }
  return { ok: true, addresses, private: allPrivate }
}

/**
 * A lookup that hands Node only the vetted answers, so a connection cannot be re-resolved
 * elsewhere between the check and the connect.
 */
export function pinnedLookup(addresses: readonly ResolvedAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all === true) {
      callback(
        null,
        addresses.map(({ address, family }) => ({ address, family })),
      )
      return
    }
    const [first] = addresses
    if (first === undefined) {
      callback(new Error('No vetted address'), '', 0)
      return
    }
    callback(null, first.address, first.family)
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : ''
  }
  return ''
}
