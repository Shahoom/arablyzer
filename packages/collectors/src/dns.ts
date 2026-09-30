import { getDomain } from 'tldts'

/**
 * One name's TXT records, as a lookup answered them (M2.3c). `none`: the name has no TXT
 * records, or does not exist; `failed`: no answer came (a timeout, a server that failed or
 * refused), which says nothing of the records.
 */
export interface TxtLookup {
  /** The name asked for. */
  readonly name: string
  readonly outcome: 'found' | 'none' | 'failed'
  /**
   * Each record's strings joined without spaces (RFC 7208 §3.3), in code unit order, whatever
   * order the resolver gave them in: the same records read the same (txtLookup).
   */
  readonly records: readonly string[]
}

/** DNS records of the page's organizational domain, for the rules that read them. */
export interface DnsFacts {
  /** The organizational domain of the page's host (organizationalDomain). */
  readonly domain: string
  /** One lookup for each name the rules asked for, TXT alone. */
  readonly txt: readonly TxtLookup[]
}

/**
 * A lookup as the rules see it (M2.3c review): a resolver gives a name's records in any order, and
 * a finding that lists them (several SPF records) must read the same on every scan, so the records
 * are sorted by code unit, and the caller's list is left as it is.
 */
export function txtLookup(
  name: string,
  outcome: TxtLookup['outcome'],
  records: readonly string[],
): TxtLookup {
  return { name, outcome, records: [...records].sort(compareCodeUnits) }
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * A host name's organizational domain, as RFC 7489 §3.2 defines it: the name as far as the
 * public suffix list divides it, and one label more. The list's ICANN section is used:
 * `www.shop.example.com.sa` gives `example.com.sa`. Null for an address, for a name that is itself
 * a public suffix, and for a site a platform gives its customers, one under a suffix of the list's
 * private section (`user.github.io`, `shop.myshopify.com`, `x.vercel.app`): the owner of such a
 * site cannot change the zone's DNS, so it has no domain of its own to judge, and none is asked
 * about. The list is the one tldts pins, so the same name gives the same domain until that version
 * changes.
 */
export function organizationalDomain(hostname: string): string | null {
  const name = hostname.toLowerCase().replace(/\.$/, '')
  if (name === '' || name.startsWith('[')) return null
  const domain = getDomain(name)
  if (domain === null) return null
  // With the private section too, a platform's site is a domain of its own: then it is not ours.
  return getDomain(name, { allowPrivateDomains: true }) === domain ? domain : null
}
