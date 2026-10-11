import type { FeedItem } from '@arablyzer/collectors'
import {
  AVAILABILITY_VALUES,
  attributeOf,
  CONDITION_VALUES,
  checkGtin,
  checkPrice,
  isFeedUrl,
  itemLabel,
  valueKey,
} from '../../lib/feed'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = [
  'availability',
  'condition',
  'price-arabic-digits',
  'price-separator',
  'price-currency-missing',
  'price-currency-unknown',
  'price-format',
  'sale-price',
  'link',
  'gtin-arabic-digits',
  'gtin-length',
  'gtin-checksum',
] as const
type Message = (typeof MESSAGES)[number]

interface Problem {
  readonly message: Message
  /** What tells problems of one message apart: the value, or the attribute. */
  readonly key: string
  readonly attribute: string
  readonly value: string
}

/**
 * M6.1: the values of a feed's attributes as Merchant Center's specification writes them:
 * availability and condition from its lists (not «متوفر»), a price as a number with a full stop
 * and a space and the currency's ISO code, a sale price below the price, links as full http(s)
 * addresses, and a GTIN of the right length with its check digit. Problems are grouped: one
 * finding for each kind of problem and value, with how many products have it and the first.
 */
export const rule = defineRule({
  id: 'feed-values-invalid',
  version: '1.0.0',
  category: 'commerce',
  severity: 'serious',
  needs: ['feed'],
  messages: MESSAGES,
  appliesTo: (_page, evidence) => evidence?.feed?.kind === 'feed',
  detect: ({ feed }): DetectorFinding<Message>[] => {
    if (feed?.kind !== 'feed') return []
    const groups = new Map<
      string,
      { problem: Problem; count: number; first: { item: FeedItem; index: number } }
    >()
    feed.items.forEach((item, index) => {
      for (const problem of problemsOf(item)) {
        const key = `${problem.message}\n${problem.key}`
        const group = groups.get(key)
        if (group === undefined) groups.set(key, { problem, count: 1, first: { item, index } })
        else group.count++
      }
    })
    return [...groups.values()].map(({ problem, count, first }) => ({
      message: problem.message,
      values: {
        attribute: problem.attribute,
        value: problem.value,
        count,
        id: itemLabel(first.item, first.index),
      },
      snippet: `${problem.attribute}: ${problem.value}`.slice(0, 200),
      location: { line: first.item.line },
      key: `${problem.message}:${problem.key}`,
    }))
  },
})

function problemsOf(item: FeedItem): Problem[] {
  const problems: Problem[] = []
  const add = (message: Message, attribute: string, value: string, key = value) =>
    problems.push({ message, key, attribute, value })

  const availability = attributeOf(item, 'availability')
  if (availability !== null && !AVAILABILITY_VALUES.has(valueKey(availability))) {
    add('availability', 'availability', availability)
  }
  const condition = attributeOf(item, 'condition')
  if (condition !== null && !CONDITION_VALUES.has(valueKey(condition))) {
    add('condition', 'condition', condition)
  }

  const priced = new Map<string, { amount: number; currency: string } | null>()
  for (const attribute of ['price', 'sale_price']) {
    const value = attributeOf(item, attribute)
    if (value === null) continue
    const check = checkPrice(value)
    if (check.problem === null) {
      priced.set(attribute, { amount: check.amount ?? 0, currency: check.currency ?? '' })
      continue
    }
    priced.set(attribute, null)
    // The kind of problem tells them apart, not each price: a feed's prices are all different.
    add(`price-${check.problem}`, attribute, value, `${attribute}:${check.problem}`)
  }
  const price = priced.get('price')
  const sale = priced.get('sale_price')
  if (price && sale?.currency === price.currency && sale.amount >= price.amount) {
    add(
      'sale-price',
      'sale_price',
      `${String(sale.amount)} ≥ ${String(price.amount)} ${price.currency}`,
      'sale',
    )
  }

  for (const attribute of ['link', 'image_link']) {
    const value = attributeOf(item, attribute)
    if (value !== null && !isFeedUrl(value)) add('link', attribute, value, attribute)
  }

  const gtin = attributeOf(item, 'gtin')
  if (gtin !== null) {
    const problem = checkGtin(gtin)
    if (problem !== null) add(`gtin-${problem}`, 'gtin', gtin, problem)
  }
  return problems
}
