import { attributeOf, itemLabel, REQUIRED_ATTRIBUTES } from '../../lib/feed'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'missing' | 'duplicate-id'

/**
 * M6.1: Google Merchant Center's required attributes for every product (id, title, description,
 * link, image_link, price, availability), and an id used by two products. One finding for each
 * attribute that some products lack, with how many and the first of them.
 */
export const rule = defineRule({
  id: 'feed-required-missing',
  version: '1.0.0',
  category: 'commerce',
  severity: 'serious',
  needs: ['feed'],
  messages: ['missing', 'duplicate-id'],
  appliesTo: (_page, evidence) => evidence?.feed?.kind === 'feed',
  detect: ({ feed }): DetectorFinding<Message>[] => {
    if (feed?.kind !== 'feed') return []
    const total = `${String(feed.items.length)}${feed.more ? '+' : ''}`
    const findings: DetectorFinding<Message>[] = []
    for (const attribute of REQUIRED_ATTRIBUTES) {
      const lacking = feed.items.flatMap((item, index) =>
        attributeOf(item, attribute) === null ? [{ item, index }] : [],
      )
      const [first] = lacking
      if (first === undefined) continue
      findings.push({
        message: 'missing',
        values: {
          attribute,
          count: lacking.length,
          total,
          id: itemLabel(first.item, first.index),
        },
        location: { line: first.item.line },
        key: attribute,
      })
    }
    const seen = new Map<string, number[]>()
    feed.items.forEach((item, index) => {
      const id = attributeOf(item, 'id')
      if (id !== null) seen.set(id, [...(seen.get(id) ?? []), index])
    })
    for (const [id, indexes] of seen) {
      const second = indexes[1]
      if (second === undefined) continue
      findings.push({
        message: 'duplicate-id',
        values: { id, count: indexes.length },
        location: { line: feed.items[second]?.line ?? 1 },
        key: id,
      })
    }
    return findings
  },
})
