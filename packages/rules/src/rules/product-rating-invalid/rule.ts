import {
  entries,
  isEmpty,
  objectsIn,
  parsedBlocks,
  placeProblems,
  shown,
  typesOf,
  type JsonObject,
  type Located,
  type Problem,
} from '../../lib/jsonld-objects'
import { topProducts } from '../../lib/product-offers'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = ['no-value', 'no-count', 'bad-number', 'out-of-range', 'count-zero'] as const
type Message = (typeof MESSAGES)[number]

/** A number as Schema.org asks: digits 0–9, a full stop for the decimal point. */
const PLAIN_NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/

/** Schema.org's defaults when a rating gives no scale. */
const DEFAULT_WORST = 1
const DEFAULT_BEST = 5

/**
 * M6.1: the rating numbers of a product's markup: `ratingValue` is there, a number written with
 * digits 0–9 and a full stop (not «٤٫٥»), inside the scale (1 to 5 unless `worstRating` and
 * `bestRating` say another); an aggregate rating counts its reviews (`reviewCount` or
 * `ratingCount`) and counts at least one.
 */
export const rule = defineRule({
  id: 'product-rating-invalid',
  version: '1.0.0',
  category: 'schema',
  severity: 'moderate',
  needs: ['html'],
  messages: MESSAGES,
  appliesTo: (page) => ratings(page).length > 0,
  detect: ({ page }) =>
    placeProblems(ratings(page).flatMap(problemsOf)).map(
      (finding): DetectorFinding<Message> => finding,
    ),
})

interface Rating {
  readonly object: Located<JsonObject>
  readonly aggregate: boolean
}

/** The ratings of a page that describes a product: Rating and AggregateRating objects. */
function ratings(page: Parameters<typeof topProducts>[0]): Rating[] {
  if (topProducts(page).length === 0) return []
  return [...objectsIn(parsedBlocks(page))].flatMap((object): Rating[] => {
    const types = typesOf(object.value)
    if (types.includes('AggregateRating')) return [{ object, aggregate: true }]
    if (types.includes('Rating')) return [{ object, aggregate: false }]
    return []
  })
}

function numberOf(entry: Located | undefined): number | null | 'bad' {
  if (entry === undefined || isEmpty(entry.value)) return null
  if (typeof entry.value === 'number') return entry.value
  if (typeof entry.value === 'string' && PLAIN_NUMBER.test(entry.value.trim())) {
    return Number(entry.value.trim())
  }
  return 'bad'
}

function problemsOf({ object, aggregate }: Rating): Problem<Message>[] {
  const problems: Problem<Message>[] = []
  const first = (property: string) => entries(object, property).find((e) => !isEmpty(e.value))
  const valueEntry = first('ratingValue')
  if (valueEntry === undefined) {
    problems.push({ message: 'no-value', at: object, values: {} })
  }
  const numbers = new Map<string, number | null>()
  for (const property of [
    'ratingValue',
    'bestRating',
    'worstRating',
    'reviewCount',
    'ratingCount',
  ]) {
    const entry = first(property)
    const number = numberOf(entry)
    if (number === 'bad' && entry !== undefined) {
      problems.push({
        message: 'bad-number',
        at: entry,
        values: { property, value: shown(entry.value) },
      })
      numbers.set(property, null)
    } else {
      numbers.set(property, number === 'bad' ? null : number)
    }
  }
  const value = numbers.get('ratingValue') ?? null
  const best = numbers.get('bestRating') ?? DEFAULT_BEST
  const worst = numbers.get('worstRating') ?? DEFAULT_WORST
  if (value !== null && valueEntry !== undefined && (value < worst || value > best)) {
    problems.push({
      message: 'out-of-range',
      at: valueEntry,
      values: { value, worst, best },
    })
  }
  if (aggregate) {
    const count = first('reviewCount') ?? first('ratingCount')
    if (count === undefined) {
      problems.push({ message: 'no-count', at: object, values: {} })
    } else {
      const number = numberOf(count)
      if (typeof number === 'number' && number < 1) {
        problems.push({ message: 'count-zero', at: count, values: { value: number } })
      }
    }
  }
  return problems
}
