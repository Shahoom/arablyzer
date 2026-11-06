import {
  entries,
  objects,
  objectsIn,
  parsedBlocks,
  PRODUCT_TYPES,
  typesOf,
  type Json,
  type JsonObject,
  type Located,
} from '../../lib/jsonld-objects'
import { topObjects } from '../../lib/product-offers'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'price' | 'rating' | 'breadcrumb' | 'telephone'

const toWestern = (text: string): string =>
  text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))

/**
 * Every number the page's text can mean, whatever its digits and separators: each token read with
 * all its separators dropped («1,250» as 1250) and with its last separator as the decimal mark
 * («1,250» as 1.25, «12.500» as 12.5). A price of 12.500 and a text of «12,500» meet either way.
 */
function numbersIn(text: string): Set<number> {
  const found = new Set<number>()
  const western = toWestern(text).replace(/٫/g, '.').replace(/٬/g, ',')
  for (const token of western.match(/\d+(?:[.,]\d+)*/g) ?? []) {
    found.add(Number(token.replace(/[.,]/g, '')))
    const last = Math.max(token.lastIndexOf('.'), token.lastIndexOf(','))
    if (last !== -1) {
      found.add(Number(`${token.slice(0, last).replace(/[.,]/g, '')}.${token.slice(last + 1)}`))
    }
  }
  return found
}

const near = (numbers: ReadonlySet<number>, value: number): boolean =>
  [...numbers].some((number) => Math.abs(number - value) < 0.005)

const asNumber = (value: Json): number | null => {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(toWestern(value).trim())
        : NaN
  return Number.isFinite(number) ? number : null
}
const asText = (value: Json): string => (typeof value === 'string' ? value : '')
const plain = (text: string): string => text.replace(/\s+/g, '').toLowerCase()

/**
 * M10.2: structured data that says what the page does not. The price a Product's offer gives, the
 * rating it gives (its value or its count), the names of a breadcrumb trail, and the telephone of
 * an organisation or a business, each looked for in the text a visitor reads. Google asks that
 * markup describe what is visible: a price in the markup that the page does not show, or a rating
 * nobody can see, is markup for content that is not there. Digits are read in either script, so a
 * page that shows «١٢٠ ر.س» matches the markup's 120. One finding for each kind.
 */
export const rule = defineRule({
  id: 'markup-content-mismatch',
  version: '1.0.0',
  category: 'schema',
  severity: 'moderate',
  needs: ['html', 'text'],
  messages: ['price', 'rating', 'breadcrumb', 'telephone'],
  appliesTo: (page) =>
    page.text !== null &&
    (topObjects(page, PRODUCT_TYPES).length > 0 ||
      [...objectsIn(parsedBlocks(page))].some(
        (object) => typesOf(object.value).includes('BreadcrumbList') || 'telephone' in object.value,
      )),
  detect: ({ page }): DetectorFinding<Message>[] => {
    const text = (page.text?.segments ?? []).map((segment) => segment.text).join(' ')
    const numbers = numbersIn(text)
    const compact = plain(text)
    const digits = toWestern(text).replace(/\D/g, '')
    const findings: DetectorFinding<Message>[] = []

    const products = topObjects(page, PRODUCT_TYPES)
    for (const product of products) {
      const prices = objects(entries(product, 'offers')).flatMap((offer): number[] => {
        const price =
          asNumber(entries(offer, 'price')[0]?.value ?? null) ??
          asNumber(entries(offer, 'lowPrice')[0]?.value ?? null)
        return price === null || price <= 0 ? [] : [price]
      })
      const first = prices[0]
      if (first !== undefined && !prices.some((price) => near(numbers, price))) {
        findings.push({
          message: 'price',
          values: {
            price: first,
            name: asText(entries(product, 'name')[0]?.value ?? null).slice(0, 60),
          },
          key: 'price',
        })
        break
      }
    }
    for (const product of products) {
      const rating = objects(entries(product, 'aggregateRating'))[0]
      if (rating === undefined) continue
      const value = asNumber(entries(rating, 'ratingValue')[0]?.value ?? null)
      const count = asNumber(
        entries(rating, 'reviewCount')[0]?.value ??
          entries(rating, 'ratingCount')[0]?.value ??
          null,
      )
      const seen =
        (value !== null && near(numbers, value)) || (count !== null && near(numbers, count))
      if ((value !== null || count !== null) && !seen) {
        findings.push({
          message: 'rating',
          values: { value: value ?? '', count: count ?? '' },
          key: 'rating',
        })
        break
      }
    }

    const all: Located<JsonObject>[] = [...objectsIn(parsedBlocks(page))]
    const names: string[] = []
    for (const trail of all.filter((object) => typesOf(object.value).includes('BreadcrumbList'))) {
      for (const item of objects(entries(trail, 'itemListElement'))) {
        const name = asText(entries(item, 'name')[0]?.value ?? null).trim()
        if (name !== '') names.push(name)
      }
    }
    const missing = names.filter((name) => !compact.includes(plain(name)))
    if (missing.length > 0) {
      findings.push({
        message: 'breadcrumb',
        values: { count: missing.length, name: (missing[0] ?? '').slice(0, 60) },
        key: 'breadcrumb',
      })
    }

    for (const object of all) {
      const telephone = asText(entries(object, 'telephone')[0]?.value ?? null)
      const wanted = toWestern(telephone).replace(/\D/g, '').slice(-8)
      if (wanted.length === 8 && !digits.includes(wanted)) {
        findings.push({
          message: 'telephone',
          values: { telephone: telephone.trim().slice(0, 40) },
          key: 'telephone',
        })
        break
      }
    }
    return findings
  },
})
