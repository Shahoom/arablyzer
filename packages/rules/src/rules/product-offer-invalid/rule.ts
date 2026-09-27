import type { PageFacts, ScriptElement } from '@arablyzer/collectors'
import { ISO_4217_CURRENCIES } from '../../lib/iso-codes'
import { MAX_JSON_DEPTH, jsonPointer, jsonValueOffsets } from '../../lib/json-positions'
import { documentPosition, jsonLdBlocks, lineAround } from '../../lib/jsonld'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = ['no-price', 'bad-price', 'no-currency', 'bad-currency'] as const
type Message = (typeof MESSAGES)[number]

/** Product and its more specific types in Schema.org 30.1. */
const PRODUCT_TYPES = new Set([
  'Product',
  'DietarySupplement',
  'Drug',
  'IndividualProduct',
  'ProductCollection',
  'ProductGroup',
  'ProductModel',
  'SomeProducts',
  'Vehicle',
  'BusOrCoach',
  'Car',
  'Motorcycle',
  'MotorizedBicycle',
])

/** Types written as full IRIs or compact ones name the same Schema.org type. */
const SCHEMA_PREFIX = /^(?:https?:\/\/schema\.org\/|schema:)/

/** What Schema.org asks of a price: digits 0–9, with a full stop for the decimal point. */
const PLAIN_PRICE = /^(?:\d+(?:\.\d*)?|\.\d+)$/

/** Objects read per page; real product markup has a few hundred. */
const MAX_OBJECTS = 50_000

/** Values longer than this are cut in messages. */
const MAX_SHOWN = 80

type Json = null | boolean | number | string | readonly Json[] | JsonObject
interface JsonObject {
  readonly [key: string]: Json
}

interface Block {
  readonly script: ScriptElement
  /** Its place among the page's JSON-LD blocks, as jsonld-syntax-error numbers them. */
  readonly number: number
  readonly root: Json
}

/** A value in a block, and its JSON Pointer there. */
interface Located<T extends Json = Json> {
  readonly block: Block
  readonly pointer: string
  readonly value: T
}

interface Offer {
  /** The offer where the product gives it, then its other definitions under the same @id. */
  readonly parts: readonly Located<JsonObject>[]
  readonly aggregate: boolean
}

interface Problem {
  readonly message: Message
  readonly at: Located
  readonly values: Readonly<Record<string, string>>
}

export const rule = defineRule({
  id: 'product-offer-invalid',
  version: '1.0.0',
  category: 'schema',
  severity: 'moderate',
  needs: ['html'],
  messages: MESSAGES,
  appliesTo: (page) => productOffers(page).length > 0,
  detect: ({ page }) => {
    const problems = productOffers(page).flatMap(problemsOf)
    const wanted = new Map<Block, Set<string>>()
    for (const { at } of problems) {
      const pointers = wanted.get(at.block) ?? new Set<string>()
      wanted.set(at.block, pointers.add(at.pointer))
    }
    const offsets = new Map(
      [...wanted].map(([block, pointers]) => [
        block,
        jsonValueOffsets(block.script.text, pointers),
      ]),
    )
    return problems.map(({ message, at, values }): DetectorFinding<Message> => {
      const { script, number } = at.block
      const offset = offsets.get(at.block)?.get(at.pointer) ?? 0
      const position = documentPosition(script, offset)
      const snippet = lineAround(script.text, offset)
      return {
        message,
        values: { block: number, line: position.line, ...values },
        selector: script.selector,
        ...(snippet === '' ? {} : { snippet }),
        ...(script.textLocation === null ? {} : { location: position }),
        key: `${number}${at.pointer}`,
      }
    })
  },
})

function problemsOf(offer: Offer): Problem[] {
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

  const problems: Problem[] = []
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

/** JSON-LD blocks that parse; broken ones are jsonld-syntax-error's. */
function parsedBlocks(page: PageFacts): Block[] {
  return jsonLdBlocks(page).flatMap((script, index): Block[] => {
    if (script.text.trim() === '') return []
    try {
      return [{ script, number: index + 1, root: JSON.parse(script.text) as Json }]
    } catch {
      return []
    }
  })
}

/** Every object in the blocks, in document order, down to MAX_JSON_DEPTH. */
function* objectsIn(blocks: readonly Block[]): Generator<Located<JsonObject>> {
  let budget = MAX_OBJECTS
  for (const block of blocks) {
    const stack: { readonly value: Json; readonly pointer: string; readonly depth: number }[] = [
      { value: block.root, pointer: '', depth: 0 },
    ]
    for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
      const { value, pointer, depth } = item
      if (value === null || typeof value !== 'object' || depth >= MAX_JSON_DEPTH) continue
      if (budget-- === 0) return
      if (!isArray(value)) yield { block, pointer, value }
      const children: [string | number, Json][] = isArray(value)
        ? value.map((child, index) => [index, child])
        : Object.entries(value)
      for (let index = children.length - 1; index >= 0; index--) {
        const [step, child] = children[index] ?? []
        if (step === undefined || child === null || typeof child !== 'object') continue
        stack.push({ value: child, pointer: jsonPointer(pointer, step), depth: depth + 1 })
      }
    }
  }
}

/** The values of a property: each item of an array, and the @value of a value object. */
function entries(object: Located<JsonObject>, property: string): Located[] {
  if (!Object.hasOwn(object.value, property)) return []
  const value = object.value[property] ?? null
  const pointer = jsonPointer(object.pointer, property)
  const items = isArray(value)
    ? value.map((item, index) => ({ value: item, pointer: jsonPointer(pointer, index) }))
    : [{ value, pointer }]
  return items.map((item) =>
    isObject(item.value) && Object.hasOwn(item.value, '@value')
      ? {
          block: object.block,
          value: item.value['@value'] ?? null,
          pointer: jsonPointer(item.pointer, '@value'),
        }
      : { block: object.block, ...item },
  )
}

function objects(values: readonly Located[]): Located<JsonObject>[] {
  return values.flatMap((entry) =>
    isObject(entry.value)
      ? [{ block: entry.block, pointer: entry.pointer, value: entry.value }]
      : [],
  )
}

function typesOf(object: JsonObject): string[] {
  const type = object['@type'] ?? null
  return (isArray(type) ? type : [type]).flatMap((item) =>
    typeof item === 'string' ? [item.replace(SCHEMA_PREFIX, '')] : [],
  )
}

function isArray(value: Json): value is readonly Json[] {
  return Array.isArray(value)
}

function isObject(value: Json): value is JsonObject {
  return value !== null && typeof value === 'object' && !isArray(value)
}

function isEmpty(value: Json): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '')
}

/** A value as the message shows it: text as written, anything else as JSON. */
function shown(value: Json): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}…` : text
}
