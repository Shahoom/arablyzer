import type { PageFacts } from '@arablyzer/collectors'
import {
  PRODUCT_TYPES,
  entries,
  objects,
  objectsIn,
  parsedBlocks,
  typesOf,
  type JsonObject,
  type Located,
} from './jsonld-objects'

export interface Offer {
  /** The offer where the product gives it, then its other definitions under the same @id. */
  readonly parts: readonly Located<JsonObject>[]
  readonly aggregate: boolean
}

/**
 * The offers of every product in the page's JSON-LD, each once. In JSON-LD, objects with the same
 * @id are one object, so an offer with an @id is read from every object with that @id on the
 * page, in any block; an offer given only by an @id that no object on the page has is skipped, as
 * there is nothing to check.
 */
export function productOffers(page: PageFacts): Offer[] {
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

/** A pointer that is the top of a block: the root object, or an item of its @graph or its array. */
const TOP_LEVEL = /^(?:|\/@graph\/\d+|\/\d+)$/

/**
 * The products a page describes of itself: Product objects at the top of a JSON-LD block, or in
 * its @graph. Products inside lists and offers (a carousel's items, `itemOffered`) are other
 * pages' products named in passing, and are left to the rules about what they hold.
 */
export function topProducts(page: PageFacts): Located<JsonObject>[] {
  return topObjects(page, PRODUCT_TYPES)
}

/** The objects of these types at the top of the page's JSON-LD blocks, or in their @graph. */
export function topObjects(page: PageFacts, types: ReadonlySet<string>): Located<JsonObject>[] {
  return [...objectsIn(parsedBlocks(page))].filter(
    (object) =>
      TOP_LEVEL.test(object.pointer) &&
      typesOf(object.value).some((type) => types.has(type)) &&
      // A reference to an object defined elsewhere says nothing of its own.
      Object.keys(object.value).length > 2,
  )
}
