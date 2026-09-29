import { organizationalDomain, type DnsFacts, type TxtLookup } from '@arablyzer/collectors'
import type { EgressPolicy, Resolver, TxtAnswer } from '@arablyzer/egress'
import { isLocalHost, type Rule } from '@arablyzer/rules'

/**
 * The TXT lookups of a scan get this long together, within the scan's own limit; the resolver
 * gives each attempt its own time too (2 s, twice, for each server).
 */
export const DNS_TIMEOUT_MS = 10_000

export interface DnsLookup {
  readonly facts: DnsFacts
  /**
   * `dns-unavailable`: this process asks no DNS of its own (behind an egress proxy, which
   * resolves every name), or its resolver has no TXT lookups; `dns-unchecked`: a lookup got no
   * answer. Either way, a rule whose lookup did not answer reports an error, never a result.
   */
  readonly notice: 'dns-unavailable' | 'dns-unchecked' | null
}

export interface DnsContext {
  readonly policy: EgressPolicy
  readonly resolver: Resolver
  /** Whether the page's fetch ended on a private address (FetchResult.privateAccess). */
  readonly privateAccess: boolean
  readonly signal?: AbortSignal
}

const NO_ANSWER: TxtAnswer = { outcome: 'failed', records: [] }

/**
 * The TXT records the rules that read DNS ask for (M2.3c), for the page's organizational domain
 * (RFC 7489 §3.2): each name a rule's txtName gives, once, TXT alone, from the resolver the scan
 * resolves names with. A page on a local name, an address, a private address or a public suffix
 * has none to ask for: undefined, and those rules do not apply. Behind an egress proxy, names are
 * the proxy's to resolve and this process may have no DNS at all (M2.1 plan §5b), so it asks none.
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
  const txt = context.policy.upstream === undefined ? context.resolver.txt : undefined
  if (txt === undefined) {
    return {
      facts: { domain, txt: names.map((name) => lookupOf(name, NO_ANSWER)) },
      notice: 'dns-unavailable',
    }
  }
  const signal = AbortSignal.any([
    AbortSignal.timeout(DNS_TIMEOUT_MS),
    ...(context.signal === undefined ? [] : [context.signal]),
  ])
  const answers = await Promise.all(
    names.map((name) => txt(name, signal).catch((): TxtAnswer => NO_ANSWER)),
  )
  const lookups = names.map((name, index) => lookupOf(name, answers[index] ?? NO_ANSWER))
  return {
    facts: { domain, txt: lookups },
    notice: lookups.some((lookup) => lookup.outcome === 'failed') ? 'dns-unchecked' : null,
  }
}

function lookupOf(name: string, answer: TxtAnswer): TxtLookup {
  return { name, outcome: answer.outcome, records: [...answer.records] }
}
