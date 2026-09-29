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
  /** Each record's strings joined without spaces (RFC 7208 §3.3). */
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
 * A host name's organizational domain, as RFC 7489 §3.2 defines it: the longest public suffix
 * the name ends with, by the Public Suffix List (its ICANN and private parts, which DMARC's
 * implementations read whole), and one label more. `www.shop.example.com.sa` gives
 * `example.com.sa`, and a site a platform gives, such as `user.github.io`, keeps its own. Null for
 * an address, and for a name that is itself a public suffix. The list is the one tldts pins, so
 * the same name gives the same domain until that version changes.
 */
export function organizationalDomain(hostname: string): string | null {
  const name = hostname.toLowerCase().replace(/\.$/, '')
  if (name === '' || name.startsWith('[')) return null
  return getDomain(name, { allowPrivateDomains: true })
}
