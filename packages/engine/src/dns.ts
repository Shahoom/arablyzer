import {
  organizationalDomain,
  txtLookup,
  type DnsFacts,
  type TxtLookup,
} from '@arablyzer/collectors'
import {
  createDohTxtResolver,
  type EgressPolicy,
  type Resolver,
  type TxtAnswer,
  type TxtResolver,
} from '@arablyzer/egress'
import { isLocalHost, type Rule } from '@arablyzer/rules'
import { budget } from './timeout'

/**
 * The TXT lookups of a scan get this long together, within the scan's own limit; the resolver
 * gives each attempt its own time too (2 s, twice, for each server; 10 s for a DoH request).
 */
export const DNS_TIMEOUT_MS = 10_000

export interface DnsLookup {
  readonly facts: DnsFacts
  /**
   * `dns-unchecked`: a lookup got no answer (a timeout, a resolver that failed or refused). A
   * rule whose lookup did not answer reports an error, never a result.
   */
  readonly notice: 'dns-unchecked' | null
}

export interface DnsContext {
  /** How the scan asks for TXT records (txtResolverFor). */
  readonly txt: TxtResolver
  /** Whether the page's fetch ended on a private address (FetchResult.privateAccess). */
  readonly privateAccess: boolean
  readonly signal?: AbortSignal
}

const NO_ANSWER: TxtAnswer = { outcome: 'failed', records: [] }

export interface DnsPath {
  readonly policy: EgressPolicy
  /** The scan's resolver: its TXT lookups where the process asks DNS itself, and it resolves the DoH resolver's name. */
  readonly resolver: Resolver
  readonly userAgent: string
  /** The DNS-over-HTTPS resolver's URL (ScanOptions.dohUrl). */
  readonly dohUrl?: string
}

/**
 * How a scan asks for the TXT records its DNS rules read, or undefined when it has no way to
 * (M2.3c review). With a DoH resolver named, over HTTPS (RFC 8484) with safeFetch under the scan's
 * policy, so vetted like every request and through the egress proxy where the policy has one:
 * behind that proxy this process resolves no name of its own (M2.1 plan §5b), and this is the
 * only way to ask. Without one, the scan's own resolver (c-ares) asks, where this process asks
 * DNS itself. Behind a proxy with no DoH resolver, or with a resolver that has no TXT lookups,
 * there is no way: the DNS rules are left out of the scan, as rules that need a browser are.
 */
export function txtResolverFor(path: DnsPath): TxtResolver | undefined {
  if (path.dohUrl !== undefined) {
    return createDohTxtResolver({
      url: path.dohUrl,
      userAgent: path.userAgent,
      policy: path.policy,
      resolver: path.resolver,
    })
  }
  return path.policy.upstream === undefined ? path.resolver.txt : undefined
}

/**
 * The TXT records the rules that read DNS ask for (M2.3c), for the page's organizational domain
 * (RFC 7489 §3.2): each name a rule's txtName gives, once, TXT alone, from the resolver the scan
 * asks with (txtResolverFor). A page on a local name, an address, a private address or a public
 * suffix has none to ask for: undefined, and those rules do not apply.
 */
export async function lookupDns(
  pageUrl: string,
  rules: readonly Rule[],
  context: DnsContext,
): Promise<DnsLookup | undefined> {
  const asking = rules.filter((rule) => rule.needs.includes('dns'))
  if (asking.length === 0) return undefined
  const host = new URL(pageUrl).hostname
  if (context.privateAccess || isLocalHost(host)) return undefined
  const domain = organizationalDomain(host)
  if (domain === null) return undefined
  const names = [
    ...new Set(
      asking.flatMap((rule) => (rule.txtName === undefined ? [] : [rule.txtName(domain)])),
    ),
  ]
  const { signal, stop } = budget(DNS_TIMEOUT_MS, context.signal)
  let answers: TxtAnswer[]
  try {
    // A resolver never throws, but one that does gets no answer either: async catches the throw.
    answers = await Promise.all(
      names.map((name) =>
        (async () => context.txt(name, signal))().catch((): TxtAnswer => NO_ANSWER),
      ),
    )
  } finally {
    stop()
  }
  const lookups = names.map((name, index) => lookupOf(name, answers[index] ?? NO_ANSWER))
  return {
    facts: { domain, txt: lookups },
    notice: lookups.some((lookup) => lookup.outcome === 'failed') ? 'dns-unchecked' : null,
  }
}

/** The lookup as the rules see it: its records in an order of their own (txtLookup). */
function lookupOf(name: string, answer: TxtAnswer): TxtLookup {
  return txtLookup(name, answer.outcome, answer.records)
}
