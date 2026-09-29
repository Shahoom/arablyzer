import { defineRule, type DetectorFinding } from '../../rule'

/**
 * RFC 7208 §4.5: an SPF record begins with a version section of exactly "v=spf1", which a
 * space or the record's end closes ("v=spf10" is not one). ABNF strings, and so the version, are
 * read without regard to case (RFC 5234 §2.3).
 */
const VERSION = /^v=spf1(?: |$)/i

/**
 * The page's domain publishes no SPF record (RFC 7208): no TXT record at its organizational
 * domain begins with v=spf1, so receiving servers cannot tell which servers may send its mail.
 * More than one is an error receivers read as none (§4.5, permerror), with its own message. A
 * domain whose lookup got no answer is not judged: the engine reports an error.
 */
export const rule = defineRule({
  id: 'spf-missing',
  version: '1.0.0',
  category: 'trust',
  severity: 'moderate',
  needs: ['dns'],
  txtName: (domain) => domain,
  messages: ['missing', 'several'],
  appliesTo: (_page, evidence) => evidence?.dns !== undefined,
  detect: ({ dns }): DetectorFinding<'missing' | 'several'>[] => {
    const lookup = dns?.txt.find((each) => each.name === dns.domain)
    if (dns === undefined || lookup === undefined || lookup.outcome === 'failed') return []
    const spf = lookup.records.filter((record) => VERSION.test(record))
    if (spf.length === 0) {
      return [{ message: 'missing', values: { domain: dns.domain }, key: dns.domain }]
    }
    if (spf.length === 1) return []
    return [
      {
        message: 'several',
        values: { domain: dns.domain, count: spf.length },
        snippet: spf.join(' | '),
        key: dns.domain,
      },
    ]
  },
})
