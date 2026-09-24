import { MAX_URL_LENGTH } from '@arablyzer/egress'
import type { JsonValue } from '@arablyzer/report-schema'

/**
 * Detector output can carry page content of any size (an href, a lang attribute, a list of
 * canonical links), so the engine bounds it before it reaches a report.
 */

/** Long enough for any URL Arablyzer fetches, so URLs in values and evidence stay whole. */
export const MAX_VALUE_LENGTH = MAX_URL_LENGTH
/** Items kept per list or object in finding values. */
export const MAX_VALUE_ITEMS = 20
/** Selectors keep their end, the most specific part. */
export const MAX_SELECTOR_LENGTH = 300

/** Cuts text to at most `max` characters, ending in "…", without splitting a surrogate pair. */
export function boundText(text: string, max = MAX_VALUE_LENGTH): string {
  if (text.length <= max) return text
  let end = max - 1
  if (isHighSurrogate(text.charCodeAt(end - 1))) end--
  return `${text.slice(0, end)}…`
}

export function boundValue(value: JsonValue): JsonValue {
  if (typeof value === 'string') return boundText(value)
  if (Array.isArray(value)) return value.slice(0, MAX_VALUE_ITEMS).map(boundValue)
  if (value !== null && typeof value === 'object') return boundValues(value)
  return value
}

export function boundValues(
  values: Readonly<Record<string, JsonValue>>,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(values)
      .slice(0, MAX_VALUE_ITEMS)
      .map(([key, value]) => [key, boundValue(value)]),
  )
}

/** "… > div > a": the tail of a long selector, cut at a combinator when there is one. */
export function boundSelector(selector: string): string {
  if (selector.length <= MAX_SELECTOR_LENGTH) return selector
  let tail = selector.slice(selector.length - (MAX_SELECTOR_LENGTH - 1))
  const combinator = tail.indexOf(' > ')
  if (combinator !== -1) tail = tail.slice(combinator)
  else if (isLowSurrogate(tail.charCodeAt(0))) tail = tail.slice(1)
  return `…${tail}`
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff
}
