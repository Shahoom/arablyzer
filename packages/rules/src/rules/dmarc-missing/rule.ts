import { defineRule, type DetectorFinding } from '../../rule'

/**
 * RFC 7489 §6.3 and §6.4: a DMARC record's first tag is v, whose value must be exactly DMARC1,
 * in capitals (%x44 %x4d %x41 %x52 %x43 %x31), with spaces or tabs allowed around the "=" and
 * before the ";" that ends the tag. A record whose v tag is anything else is ignored.
 */
const VERSION = /^v[\t ]*=[\t ]*DMARC1[\t ]*(?:;|$)/i

/**
 * The page's domain publishes no DMARC record (RFC 7489): no TXT record at the _dmarc name of its
 * organizational domain starts with the version tag v=DMARC1, so mail servers apply no policy of
 * the domain's to messages that fail SPF and DKIM. More than one ends policy discovery too
 * (§6.6.3), with a message of its own. The record at the organizational domain covers mail from
 * its subdomains (the sp tag, or p, §6.3); a lookup without an answer is not judged.
 */
export const rule = defineRule({
  id: 'dmarc-missing',
  version: '1.0.0',
  category: 'trust',
  severity: 'moderate',
  needs: ['dns'],
  txtName: (domain) => `_dmarc.${domain}`,
  messages: ['missing', 'several'],
  appliesTo: (_page, evidence) => evidence?.dns !== undefined,
  detect: ({ dns }): DetectorFinding<'missing' | 'several'>[] => {
    const lookup = dns?.txt.find((each) => each.name === `_dmarc.${dns.domain}`)
    if (dns === undefined || lookup === undefined || lookup.outcome === 'failed') return []
    const dmarc = lookup.records.filter((record) => isDmarc(record))
    if (dmarc.length === 0) {
      return [{ message: 'missing', values: { domain: dns.domain }, key: dns.domain }]
    }
    if (dmarc.length === 1) return []
    return [
      {
        message: 'several',
        values: { domain: dns.domain, count: dmarc.length },
        snippet: dmarc.join(' | '),
        key: dns.domain,
      },
    ]
  },
})

/** The tag name v in any case (an ABNF string), its value DMARC1 exactly. */
function isDmarc(record: string): boolean {
  const version = VERSION.exec(record)?.[0]
  return version?.includes('DMARC1') === true
}
