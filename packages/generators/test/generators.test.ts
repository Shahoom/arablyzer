import { collectPage } from '@arablyzer/collectors'
import { evaluatePage } from '@arablyzer/engine'
import { RULES } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import { arabicSlug, hreflangTags, productJsonLd, robotsTest, whatsAppLink } from '../src/index'

/** The rules named, on an Arabic page holding this markup: each must pass. */
function judged(markup: string, ruleIds: readonly string[], head = '') {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>صفحة</title>${head}</head><body><p>مرحبا بكم في متجرنا.</p>${markup}</body></html>`
  const page = collectPage({
    url: 'https://example.com/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(html),
  })
  return evaluatePage(page, { rules: RULES, ruleIds }).results.map((result) => [
    result.id,
    result.status,
  ])
}

describe('whatsAppLink', () => {
  it('writes the number as WhatsApp documents it, whatever was typed, and the rule agrees', () => {
    for (const [number, country] of [
      ['+968 9123 4567', ''],
      ['٠٠٩٦٨٩١٢٣٤٥٦٧', ''],
      ['9123 4567', '968'],
      ['050 123 4567', '966'],
    ] as const) {
      const result = whatsAppLink({
        number,
        country,
        text: 'مرحباً، أريد الاستفسار',
        label: 'راسلنا',
      })
      expect(result.ok, number).toBe(true)
      if (!result.ok) continue
      expect(result.url).toMatch(/^https:\/\/wa\.me\/\d+\?text=/)
      expect(judged(result.html, ['whatsapp-link-format'])).toEqual([
        ['whatsapp-link-format', 'pass'],
      ])
    }
    const oman = whatsAppLink({ number: '9123 4567', country: '968', label: 'x' })
    expect(oman.ok && oman.number).toBe('96891234567')
    const saudi = whatsAppLink({ number: '050 123 4567', country: '966', label: 'x' })
    expect(saudi.ok && saudi.number).toBe('966501234567')
  })

  it('refuses a number it cannot complete without guessing its country', () => {
    expect(whatsAppLink({ number: '9123 4567', label: 'x' })).toEqual({
      ok: false,
      problem: 'not-international',
    })
  })

  it('escapes what the visitor typed', () => {
    const result = whatsAppLink({ number: '+96891234567', label: '<b>"x"</b>' })
    expect(result.ok && result.html).toContain('&lt;b&gt;&quot;x&quot;&lt;/b&gt;')
  })
})

describe('hreflangTags', () => {
  it('writes the set of tags, x-default included, which the rule passes', () => {
    const result = hreflangTags(
      [
        { href: 'https://example.com/', code: 'ar' },
        { href: 'https://example.com/en/', code: 'en' },
        { href: 'https://example.com/sa/', code: 'ar-SA' },
      ],
      'https://example.com/',
    )
    expect(result.problems).toEqual([])
    expect(result.html.split('\n')).toHaveLength(4)
    expect(judged('', ['hreflang-invalid-code'], result.html)).toEqual([
      ['hreflang-invalid-code', 'pass'],
    ])
  })

  it('names the codes Google does not support, with their correction', () => {
    const result = hreflangTags([
      { href: 'https://example.com/uk/', code: 'en-UK' },
      { href: 'https://example.com/ae/', code: 'ar_AE' },
    ])
    expect(result.problems.map((problem) => [problem.row, problem.check.suggestion])).toEqual([
      [0, 'en-GB'],
      [1, 'ar-AE'],
    ])
  })
})

describe('productJsonLd', () => {
  it("writes the price in the currency's own decimals, which the rule passes", () => {
    for (const [price, currency, expected] of [
      ['12.5', 'OMR', '12.500'],
      ['١٢٫٥', 'kwd', '12.500'],
      ['99', 'SAR', '99.00'],
      ['7.25', 'AED', '7.25'],
    ] as const) {
      const result = productJsonLd({
        name: 'دهن عود',
        price,
        currency,
        availability: 'InStock',
      })
      expect(result.ok, `${price} ${currency}`).toBe(true)
      if (!result.ok) continue
      expect(result.json).toContain(`"price": "${expected}"`)
      expect(judged('', ['product-offer-invalid', 'jsonld-syntax-error'], result.html)).toEqual([
        ['jsonld-syntax-error', 'pass'],
        ['product-offer-invalid', 'pass'],
      ])
    }
  })

  it('refuses what is not a price, a currency or a name', () => {
    const base = { name: 'x', price: '1', currency: 'OMR', availability: 'InStock' } as const
    expect(productJsonLd({ ...base, price: '12,5 ر.ع.' })).toEqual({ ok: false, problem: 'price' })
    expect(productJsonLd({ ...base, currency: 'ر.ع.' })).toEqual({ ok: false, problem: 'currency' })
    expect(productJsonLd({ ...base, name: ' ' })).toEqual({ ok: false, problem: 'name' })
  })
})

describe('arabicSlug', () => {
  it('keeps the words, drops what a search or a URL trips on', () => {
    expect(arabicSlug('العُروض الخـاصة: خصم ٥٠٪!')).toEqual({
      slug: 'العروض-الخاصة-خصم-50',
      encoded: encodeURIComponent('العروض-الخاصة-خصم-50'),
    })
    expect(arabicSlug('  Oud & Bakhoor  ').slug).toBe('oud-bakhoor')
  })
})

describe('robotsTest', () => {
  it('judges an address for a crawler as the robots rules do: its own group first, the longest rule, allow on a tie', () => {
    const robots =
      'User-agent: *\nDisallow: /admin/\n\nUser-agent: Googlebot\nDisallow: /\nAllow: /products/\n'
    expect(robotsTest(robots, 'https://example.com/products/oud', 'Googlebot')).toMatchObject({
      allowed: true,
      group: 'specific',
      groups: 2,
    })
    expect(robotsTest(robots, 'https://example.com/about', 'Googlebot')).toMatchObject({
      allowed: false,
      group: 'specific',
      rule: { pattern: '/', line: 5 },
    })
    expect(robotsTest(robots, 'https://example.com/admin/x', 'Bingbot')).toMatchObject({
      allowed: false,
      group: 'global',
    })
  })
})
