import type { LookalikeFound } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'fresh' | 'mail' | 'registered'

const RECORDS = (item: LookalikeFound) =>
  [item.address ? 'A' : '', item.mail ? 'MX' : ''].filter((name) => name !== '').join(', ')

/**
 * Domains one typo or one Arabizi digit away from the scanned domain that someone has registered
 * (docs/design/plans/arabic-native.md §9). The tool generates up to 100 look-alikes (the same name
 * on other suffixes, digits for letters, a letter left out, doubled or swapped, a hyphen), asks DoH
 * for their A and MX records, and Certificate Transparency for the first certificate of the ones
 * that resolve. A finding for each: `fresh` when its first certificate is under 90 days old, `mail`
 * when it has a mail server, else `registered`. Asked only in a tool's scan (needs `lookalikes`).
 * Minor: a look-alike is a risk to look into, not a fault of the page.
 */
export const rule = defineRule({
  id: 'lookalike-domains',
  version: '1.0.0',
  category: 'trust',
  severity: 'minor',
  needs: ['lookalikes'],
  messages: ['fresh', 'mail', 'registered'],
  appliesTo: (_page, evidence) => evidence?.outside?.lookalikes?.outcome === 'checked',
  detect: ({ outside }): DetectorFinding<Message>[] => {
    const facts = outside?.lookalikes
    if (facts?.outcome !== 'checked') return []
    return facts.found.map((item): DetectorFinding<Message> => ({
      message: item.recent ? 'fresh' : item.mail ? 'mail' : 'registered',
      values: {
        domain: item.domain,
        kind: item.kind,
        records: RECORDS(item),
        date: item.firstSeen ?? '',
        original: facts.domain,
      },
      snippet: item.domain,
      key: item.domain,
    }))
  },
})
