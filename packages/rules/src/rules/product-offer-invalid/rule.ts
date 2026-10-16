import { ISO_4217_CURRENCIES } from '../../lib/iso-codes'
import {
  entries,
  isEmpty,
  objects,
  placeProblems,
  shown,
  type Located,
  type Problem,
} from '../../lib/jsonld-objects'
import { productOffers, type Offer } from '../../lib/product-offers'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = ['no-price', 'bad-price', 'no-currency', 'bad-currency'] as const
type Message = (typeof MESSAGES)[number]

/** What Schema.org asks of a price: digits 0–9, with a full stop for the decimal point. */
const PLAIN_PRICE = /^(?:\d+(?:\.\d*)?|\.\d+)$/

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
