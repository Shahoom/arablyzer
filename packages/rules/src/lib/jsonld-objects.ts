import type { PageFacts, ScriptElement } from '@arablyzer/collectors'
import { MAX_JSON_DEPTH, jsonPointer, jsonValueOffsets } from './json-positions'
import { jsonLdBlocks, textPlacer, type TextPlacer } from './jsonld'

// The JSON-LD of a page as the rules about its markup read it: the blocks that parse, every object
// in them, a property's values with the place of each, and the findings that point at a value.
// product-offer-invalid was the first to need it; the rules for ratings, availability, breadcrumbs
// and local businesses share it.

export type Json = null | boolean | number | string | readonly Json[] | JsonObject
export interface JsonObject {
  readonly [key: string]: Json
}

export interface Block {
  readonly script: ScriptElement
  /** Its place among the page's JSON-LD blocks, as jsonld-syntax-error numbers them. */
  readonly number: number
  readonly root: Json
}

/** A value in a block, and its JSON Pointer there. */
export interface Located<T extends Json = Json> {
  readonly block: Block
  readonly pointer: string
  readonly value: T
}

/** Types written as full IRIs or compact ones name the same Schema.org type. */
const SCHEMA_PREFIX = /^(?:https?:\/\/schema\.org\/|schema:)/

/** Objects read per page; real markup has a few hundred. */
const MAX_OBJECTS = 50_000

/** Values longer than this are cut in messages. */
const MAX_SHOWN = 80

/** Product and its more specific types in Schema.org 30.1. */
export const PRODUCT_TYPES: ReadonlySet<string> = new Set([
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

/** JSON-LD blocks that parse; broken ones are jsonld-syntax-error's. */
export function parsedBlocks(page: PageFacts): Block[] {
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
export function* objectsIn(blocks: readonly Block[]): Generator<Located<JsonObject>> {
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
export function entries(object: Located<JsonObject>, property: string): Located[] {
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

export function objects(values: readonly Located[]): Located<JsonObject>[] {
  return values.flatMap((entry) =>
    isObject(entry.value)
      ? [{ block: entry.block, pointer: entry.pointer, value: entry.value }]
      : [],
  )
}

/** The Schema.org types an object has, without the prefix. */
export function typesOf(object: JsonObject): string[] {
  const type = object['@type'] ?? null
  return (isArray(type) ? type : [type]).flatMap((item) =>
    typeof item === 'string' ? [item.replace(SCHEMA_PREFIX, '')] : [],
  )
}

export function isArray(value: Json): value is readonly Json[] {
  return Array.isArray(value)
}

export function isObject(value: Json): value is JsonObject {
  return value !== null && typeof value === 'object' && !isArray(value)
}

export function isEmpty(value: Json): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '')
}

/** A value as the message shows it: text as written, anything else as JSON. */
export function shown(value: Json): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}…` : text
}

/** Every object of the page's JSON-LD that has one of these types. */
export function objectsOfTypes(page: PageFacts, types: ReadonlySet<string>): Located<JsonObject>[] {
  const found: Located<JsonObject>[] = []
  for (const object of objectsIn(parsedBlocks(page))) {
    if (typesOf(object.value).some((type) => types.has(type))) found.push(object)
  }
  return found
}

/** A problem with a value in a block: the message, the value, and what fills the message. */
export interface Problem<M extends string> {
  readonly message: M
  readonly at: Located
  readonly values: Readonly<Record<string, string | number>>
}

/** What a rule's detect returns for a problem: it points at the value's line in the page. */
export interface PlacedFinding<M extends string> {
  readonly message: M
  readonly values: Readonly<Record<string, string | number>>
  readonly selector: string
  readonly snippet?: string
  readonly location?: { readonly line: number; readonly column: number }
  readonly key: string
}

/**
 * The findings for problems found in JSON-LD values, each pointing at its value's line. Each block
 * is read once for all its problems: a block can have thousands.
 */
export function placeProblems<M extends string>(
  problems: readonly Problem<M>[],
): PlacedFinding<M>[] {
  const wanted = new Map<Block, Set<string>>()
  for (const { at } of problems) {
    const pointers = wanted.get(at.block) ?? new Set<string>()
    wanted.set(at.block, pointers.add(at.pointer))
  }
  const placed = new Map<Block, { offsets: Map<string, number>; placer: TextPlacer }>()
  const placeOf = (block: Block) => {
    let place = placed.get(block)
    if (place === undefined) {
      const offsets = jsonValueOffsets(block.script.text, wanted.get(block) ?? new Set())
      place = { offsets, placer: textPlacer(block.script) }
      placed.set(block, place)
    }
    return place
  }
  return problems.map(({ message, at, values }): PlacedFinding<M> => {
    const { script, number } = at.block
    const place = placeOf(at.block)
    const offset = place.offsets.get(at.pointer) ?? 0
    const position = place.placer.position(offset)
    const snippet = place.placer.line(offset)
    return {
      message,
      values: { block: number, line: position.line, ...values },
      selector: script.selector,
      ...(snippet === '' ? {} : { snippet }),
      ...(script.textLocation === null ? {} : { location: position }),
      key: `${number}${at.pointer}`,
    }
  })
}
