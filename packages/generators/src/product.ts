import { ISO_4217_CURRENCIES } from '@arablyzer/rules/iso-codes'

// The product structured data generator (M2.3b): a Product with one Offer, the price in the
// digits 0–9 with the currency's own decimals (three for the Omani rial, the Kuwaiti and
// Bahraini dinars), and the currency's ISO 4217 code, as the product-offer-invalid rule asks.

export interface ProductInput {
  readonly name: string
  readonly description?: string
  readonly image?: string
  readonly url?: string
  readonly sku?: string
  readonly brand?: string
  /** As typed: Arabic digits and the Arabic decimal mark are read too. */
  readonly price: string
  /** ISO 4217: OMR, SAR, AED, KWD, BHD, QAR… */
  readonly currency: string
  readonly availability: 'InStock' | 'OutOfStock' | 'PreOrder'
}

export type ProductResult =
  | { readonly ok: true; readonly json: string; readonly html: string }
  | { readonly ok: false; readonly problem: 'price' | 'currency' | 'name' }

/** A price as typed, Western digits and a full stop, or null when it is not one number. */
function readPrice(typed: string): number | null {
  const text = typed
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace('٫', '.')
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null
}

export function productJsonLd(input: ProductInput): ProductResult {
  const name = input.name.trim()
  if (name === '') return { ok: false, problem: 'name' }
  const currency = input.currency.trim().toUpperCase()
  if (!ISO_4217_CURRENCIES.has(currency)) return { ok: false, problem: 'currency' }
  const price = readPrice(input.price)
  if (price === null) return { ok: false, problem: 'price' }
  // The currency's minor unit, as the platform's own data gives it (CLDR's, from ISO 4217).
  const decimals =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  const optional = (key: string, value: string | undefined) =>
    value === undefined || value.trim() === '' ? {} : { [key]: value.trim() }
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    ...optional('description', input.description),
    ...optional('image', input.image),
    ...optional('sku', input.sku),
    ...(input.brand === undefined || input.brand.trim() === ''
      ? {}
      : { brand: { '@type': 'Brand', name: input.brand.trim() } }),
    offers: {
      '@type': 'Offer',
      price: price.toFixed(decimals),
      priceCurrency: currency,
      availability: `https://schema.org/${input.availability}`,
      ...optional('url', input.url),
    },
  }
  const json = JSON.stringify(data, null, 2)
  // "<" as \u003c, so the data can never end the script element.
  const html = `<script type="application/ld+json">\n${json.replaceAll('<', '\\u003c')}\n</script>`
  return { ok: true, json, html }
}
