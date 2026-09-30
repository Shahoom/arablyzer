import type { SiteConfig } from './config'

/** A TXT lookup's answer, in egress's TxtAnswer shape: egress's tests depend on this package. */
export interface FixtureTxtAnswer {
  readonly outcome: 'found' | 'none'
  readonly records: readonly string[]
}

/**
 * What a site's own names answer when a domain that sends no mail publishes what it should
 * (M3AAWG, Protecting Parked Domains, 2015): no host may send its mail, and a receiver should
 * reject what claims to come from it.
 */
export const NO_MAIL_SPF = 'v=spf1 -all'
export const NO_MAIL_DMARC = 'v=DMARC1; p=reject'

/**
 * The TXT records DNS gives a fixture site's name (M2.3c): its site.json `txt`, where a name left
 * out has none. A site without `txt` answers, for each of its names and each name they are under,
 * as a domain that sends no mail should (NO_MAIL_SPF, and NO_MAIL_DMARC at `_dmarc.`), so the DNS
 * rules pass on every site that does not say otherwise; any other name has none. Nothing asks
 * real DNS.
 */
export function fixtureTxt(site: SiteConfig, name: string): FixtureTxtAnswer {
  const asked = name.toLowerCase().replace(/\.$/, '')
  if (site.txt !== undefined) return answer(site.txt[asked] ?? [])
  const names = site.host === undefined ? [] : [site.host, ...(site.aliases ?? [])]
  const own = (domain: string) =>
    names.some((host) => host === domain || host.endsWith(`.${domain}`))
  if (asked.startsWith('_dmarc.')) {
    return answer(own(asked.slice('_dmarc.'.length)) ? [NO_MAIL_DMARC] : [])
  }
  return answer(own(asked) ? [NO_MAIL_SPF] : [])
}

function answer(records: readonly string[]): FixtureTxtAnswer {
  return { outcome: records.length === 0 ? 'none' : 'found', records }
}
