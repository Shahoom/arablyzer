import { entries, isEmpty, placeProblems, shown, type Problem } from '../../lib/jsonld-objects'
import { productOffers } from '../../lib/product-offers'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = ['text', 'unknown'] as const
type Message = (typeof MESSAGES)[number]

/** Schema.org's ItemAvailability values (schema.org 30.1). */
const AVAILABILITY = new Set([
  'BackOrder',
  'Discontinued',
  'InStock',
  'InStoreOnly',
  'LimitedAvailability',
  'MadeToOrder',
  'OnlineOnly',
  'OutOfStock',
  'PreOrder',
  'PreSale',
  'Reserved',
  'SoldOut',
])

/** `https://schema.org/InStock`, `http://schema.org/InStock`, `schema:InStock` or `InStock`. */
const SCHEMA_VALUE = /^(?:https?:\/\/schema\.org\/|schema:)?([A-Za-z]+)$/

/**
 * M6.1: an offer's `availability` is one of Schema.org's ItemAvailability values, written as its
 * address (`https://schema.org/InStock`). A word in the store's language («متوفر», “in stock”)
 * is no value; an address under schema.org that is not on the list is a misspelling.
 */
export const rule = defineRule({
  id: 'product-availability-invalid',
  version: '1.0.0',
  category: 'schema',
  severity: 'moderate',
  needs: ['html'],
  messages: MESSAGES,
  appliesTo: (page) =>
    productOffers(page).some((offer) =>
      offer.parts.some((part) => entries(part, 'availability').length > 0),
    ),
  detect: ({ page }) =>
    placeProblems(
      productOffers(page).flatMap((offer): Problem<Message>[] =>
        offer.parts.flatMap((part) =>
          entries(part, 'availability').flatMap((entry): Problem<Message>[] => {
            if (isEmpty(entry.value) || typeof entry.value !== 'string') return []
            const value = entry.value.trim()
            const name = SCHEMA_VALUE.exec(value)?.[1]
            if (name !== undefined && AVAILABILITY.has(name)) return []
            const message = /^https?:\/\/schema\.org\/|^schema:/.test(value) ? 'unknown' : 'text'
            return [{ message, at: entry, values: { availability: shown(value) } }]
          }),
        ),
      ),
    ).map((finding): DetectorFinding<Message> => finding),
})
