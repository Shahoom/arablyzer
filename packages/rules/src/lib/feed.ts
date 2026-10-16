import type { FeedItem } from '@arablyzer/collectors'
import { ISO_4217_CURRENCIES } from './iso-codes'

// What Google Merchant Center's product data specification asks of a feed's attributes, for the
// rules about a feed (M6.1). Each constant is the specification's; a figure of ours is said so.

/** The attributes every product must have, in every country (the specification's "required"). */
export const REQUIRED_ATTRIBUTES: readonly string[] = [
  'id',
  'title',
  'description',
  'link',
  'image_link',
  'price',
  'availability',
]

/** The values of `availability` (the specification writes "in stock" and "in_stock" alike). */
export const AVAILABILITY_VALUES: ReadonlySet<string> = new Set([
  'in_stock',
  'out_of_stock',
  'preorder',
  'backorder',
])

/** The values of `condition`. */
export const CONDITION_VALUES: ReadonlySet<string> = new Set(['new', 'refurbished', 'used'])

/** The longest title and description the specification accepts, in characters. */
export const MAX_TITLE_LENGTH = 150
export const MAX_DESCRIPTION_LENGTH = 5000

/** `In Stock`, `in stock` and `in_stock` are one value. */
export function valueKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}

/** An item's attribute, trimmed; null when it is absent or empty. */
export function attributeOf(item: FeedItem, name: string): string | null {
  const value = item.attributes.get(name)?.trim()
  return value === undefined || value === '' ? null : value
}

/** What an item is called in a message: its id, or its place in the file. */
export function itemLabel(item: FeedItem, index: number): string {
  return attributeOf(item, 'id') ?? `#${String(index + 1)}`
}

const EASTERN_ARABIC_DIGITS = /[٠-٩۰-۹٫٬]/

export type PriceProblem =
  'arabic-digits' | 'separator' | 'currency-missing' | 'currency-unknown' | 'format'

export interface PriceCheck {
  readonly problem: PriceProblem | null
  /** For a price that parses: its amount and currency code. */
  readonly amount: number | null
  readonly currency: string | null
}

/**
 * A price as the specification writes it: the number with a full stop for decimals and no
 * thousands separator, a space, and the currency's ISO 4217 code (`120.00 SAR`).
 */
export function checkPrice(value: string): PriceCheck {
  const bad = (problem: PriceProblem): PriceCheck => ({ problem, amount: null, currency: null })
  const text = value.trim()
  if (EASTERN_ARABIC_DIGITS.test(text)) return bad('arabic-digits')
  if (
    /^\d{1,3}(?:,\d{3})+(?:\.\d+)?\s+\p{L}{3}$/u.test(text) ||
    /^\d+,\d{1,3}\s*\p{L}{3}$/u.test(text)
  ) {
    return bad('separator')
  }
  const match = /^(\d+(?:\.\d+)?)\s+([A-Za-z]{3})$/.exec(text)
  if (match !== null) {
    const currency = (match[2] ?? '').toUpperCase()
    if (!ISO_4217_CURRENCIES.has(currency)) return bad('currency-unknown')
    return { problem: null, amount: Number(match[1]), currency }
  }
  // A number alone, or followed by a name or a sign that is not a code («120 ر.س», «120 ريال», «120 SR»).
  if (/^\d+(?:\.\d+)?$/.test(text) || /^\d+(?:\.\d+)?\s*\S+$/u.test(text)) {
    return bad('currency-missing')
  }
  return bad('format')
}

export type GtinProblem = 'arabic-digits' | 'length' | 'checksum'

/** A GTIN: 8, 12, 13 or 14 digits, the last a check digit of GS1's modulo-10 rule. */
export function checkGtin(value: string): GtinProblem | null {
  const text = value.trim()
  if (EASTERN_ARABIC_DIGITS.test(text)) return 'arabic-digits'
  if (!/^\d+$/.test(text) || ![8, 12, 13, 14].includes(text.length)) return 'length'
  const digits = Array.from(text, Number)
  const check = digits.pop() ?? 0
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check ? null : 'checksum'
}

/** A link the specification accepts: a full http or https address without spaces. */
export function isFeedUrl(value: string): boolean {
  if (/\s/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
