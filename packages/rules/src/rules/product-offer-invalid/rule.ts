import type { PageFacts } from '@arablyzer/collectors'
import { ISO_4217_CURRENCIES } from '../../lib/iso-codes'
import {
  PRODUCT_TYPES,
  entries,
  isEmpty,
  objects,
  objectsIn,
  parsedBlocks,
  placeProblems,
  shown,
  typesOf,
  type JsonObject,
  type Located,
  type Problem,
} from '../../lib/jsonld-objects'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = ['no-price', 'bad-price', 'no-currency', 'bad-currency'] as const
type Message = (typeof MESSAGES)[number]

/** What Schema.org asks of a price: digits 0–9, with a full stop for the decimal point. */
const PLAIN_PRICE = /^(?:\d+(?:\.\d*)?|\.\d+)$/

interface Offer {
  /** The offer where the product gives it, then its other definitions under the same @id. */
  readonly parts: readonly Located<JsonObject>[]
  readonly aggregate: boolean
}

export const rule = defineRule({
  id: 'product-offer-invalid',
  version: '1.0.0',
  category: 'schema',
  severity: 'moderate',
  needs: ['html'],
  messages: MESSAGES,
  appliesTo: (page) => productOffers(page).length > 0,
  detect: ({ page }) =>
    placeProblems(productOffers(page).flatMap(problemsOf)).map(
      (finding): DetectorFinding<Message> => finding,
    ),
})

function problemsOf(offer: Offer): Problem<Message>[] {
  const [first] = offer.parts
  if (first === undefined) return []
  const required = offer.aggregate ? 'lowPrice' : 'price'
  const prices: { readonly property: string; readonly entry: Located }[] = []
  const currencies: Located[] = []
  for (const part of offer.parts) {
    for (const property of offer.aggregate ? ['lowPrice', 'highPrice'] : ['price']) {
      prices.push(...entries(part, property).map((entry) => ({ property, entry })))
    }
    currencies.push(...entries(part, 'priceCurrency'))
    if (offer.aggregate) continue
    for (const specification of objects(entries(part, 'priceSpecification'))) {
      prices.push(...entries(specification, 'price').map((entry) => ({ property: 'price', entry })))
      currencies.push(...entries(specification, 'priceCurrency'))
    }
  }

  const problems: Problem<Message>[] = []
  const given = prices.filter(({ entry }) => !isEmpty(entry.value))
  if (!given.some(({ property }) => property === required)) {
    problems.push({ message: 'no-price', at: first, values: { property: required } })
  }
  for (const { property, entry } of given) {
    const price = shown(entry.value)
    if (!PLAIN_PRICE.test(price.trim())) {
      problems.push({ message: 'bad-price', at: entry, values: { property, price } })
    }
  }
  const currenciesGiven = currencies.filter((entry) => !isEmpty(entry.value))
  if (currenciesGiven.length === 0) problems.push({ message: 'no-currency', at: first, values: {} })
  for (const entry of currenciesGiven) {
    const code = typeof entry.value === 'string' ? entry.value.trim().toUpperCase() : ''
    if (!ISO_4217_CURRENCIES.has(code)) {
      problems.push({
        message: 'bad-currency',
        at: entry,
        values: { currency: shown(entry.value) },
      })
    }
  }
  return problems
}

/**
 * The offers of every product in the page's JSON-LD, each once. In JSON-LD, objects with the same
 * @id are one object, so an offer with an @id is read from every object with that @id on the
 * page, in any block; an offer given only by an @id that no object on the page has is skipped, as
 * there is nothing to check.
 */
function productOffers(page: PageFacts): Offer[] {
  const definitions = new Map<string, Located<JsonObject>[]>()
  const products: Located<JsonObject>[] = []
  for (const object of objectsIn(parsedBlocks(page))) {
    const id = object.value['@id']
    if (typeof id === 'string' && Object.keys(object.value).length > 1) {
      const defined = definitions.get(id)
      if (defined === undefined) definitions.set(id, [object])
      else defined.push(object)
    }
    if (typesOf(object.value).some((type) => PRODUCT_TYPES.has(type))) products.push(object)
  }

  const offers: Offer[] = []
  const seen = new Set<string>()
  for (const given of products.flatMap((product) => objects(entries(product, 'offers')))) {
    const id = given.value['@id']
    const reference = Object.keys(given.value).length === 1
    const parts =
      typeof id === 'string' ? (definitions.get(id) ?? (reference ? [] : [given])) : [given]
    const [first] = parts
    if (first === undefined) continue
    const key = typeof id === 'string' ? `@id ${id}` : `${first.block.number}${first.pointer}`
    if (seen.has(key)) continue
    seen.add(key)
    const types = parts.flatMap((part) => typesOf(part.value))
    if (types.includes('Demand') && !types.includes('Offer') && !types.includes('AggregateOffer')) {
      continue
    }
    offers.push({ parts, aggregate: types.includes('AggregateOffer') })
  }
  return offers
}
