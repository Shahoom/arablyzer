import { defineRule, type DetectorFinding } from '../../rule'

/**
 * RFC 7489 §6.3 and §6.4: a DMARC record's first tag is v, whose value must be exactly DMARC1, in
 * capitals (%x44 %x4d %x41 %x52 %x43 %x31), with spaces or tabs allowed around the "=" and before
 * the ";" that ends the tag. A record whose v tag is anything else is ignored. The tag's name is
 * an ABNF string, so it is read in any case.
 */
const VERSION = /^[vV][\t ]*=[\t ]*DMARC1[\t ]*(?:;|$)/

/**
 * A record that starts as a DMARC one and lacks the ";" after the version tag that §6.4's grammar
 * requires: "v=DMARC1 p=none". The v tag's value is then "DMARC1 p=none", not DMARC1.
 */
const MALFORMED = /^[vV][\t ]*=[\t ]*DMARC1[\t ]+[^\t ;]/

/** RFC 7489 §6.3: the policy is none, quarantine or reject (ABNF strings, so in any case). */
const POLICY = /^(?:none|quarantine|reject)$/i

/** The p tag among a record's tags: its value, or null when there is no p tag. */
function policyOf(record: string): string | null {
  // The first tag is the version; a tag is a name, "=" and a value, spaces allowed around each.
  for (const tag of record.split(';').slice(1)) {
    const match = /^[\t ]*[pP][\t ]*=[\t ]*(.*?)[\t ]*$/.exec(tag)
    if (match !== null) return match[1] ?? ''
  }
  return null
}

type Message = 'missing' | 'several' | 'malformed' | 'no-policy' | 'bad-policy'

/**
 * The page's domain publishes no usable DMARC record (RFC 7489): no TXT record at the _dmarc name
 * of its organizational domain starts with the version tag v=DMARC1, or the one record that does
 * has no valid p tag (none, quarantine or reject, §6.3), so mail servers apply no policy of the
 * domain's to messages that fail SPF and DKIM. A record that starts with v=DMARC1 but has no ";"
 * after it (§6.4), and more than one record (§6.6.3), have messages of their own. The record at the
 * organizational domain covers mail from its subdomains (the sp tag, or p, §6.3); a lookup without
 * an answer is not judged.
 */
export const rule = defineRule({
  id: 'dmarc-missing',
  version: '1.0.0',
  category: 'trust',
  severity: 'moderate',
  needs: ['dns'],
  txtName: (domain) => `_dmarc.${domain}`,
  messages: ['missing', 'several', 'malformed', 'no-policy', 'bad-policy'],
  appliesTo: (_page, evidence) => evidence?.dns !== undefined,
  detect: ({ dns }): DetectorFinding<Message>[] => {
    const lookup = dns?.txt.find((each) => each.name === `_dmarc.${dns.domain}`)
    if (dns === undefined || lookup === undefined || lookup.outcome === 'failed') return []
    const { domain } = dns
    const dmarc = lookup.records.filter((record) => VERSION.test(record))
    const [record, second] = dmarc
    if (record === undefined) {
      const near = lookup.records.find((each) => MALFORMED.test(each))
      return near === undefined
        ? [{ message: 'missing', values: { domain }, key: domain }]
        : [{ message: 'malformed', values: { domain }, snippet: near, key: domain }]
    }
    if (second !== undefined) {
      return [
        {
          message: 'several',
          values: { domain, count: dmarc.length },
          snippet: dmarc.join(' | '),
          key: domain,
        },
      ]
    }
    const policy = policyOf(record)
    if (policy === null) {
      return [{ message: 'no-policy', values: { domain }, snippet: record, key: domain }]
    }
    if (!POLICY.test(policy)) {
      return [
        { message: 'bad-policy', values: { domain, value: policy }, snippet: record, key: domain },
      ]
    }
    return []
  },
})
