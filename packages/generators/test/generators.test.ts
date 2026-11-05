import { collectPage } from '@arablyzer/collectors'
import { evaluatePage } from '@arablyzer/engine'
import { RULES } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import { isAllCaps, PROMOTION } from '@arablyzer/rules/feed-title'
import {
  arabicSlug,
  fixProductTitle,
  hreflangTags,
  productJsonLd,
  robotsTest,
  whatsAppLink,
} from '../src/index'

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

  it('keeps a full international number typed without + while a country is chosen', () => {
    const typed = whatsAppLink({ number: '968 9123 4567', country: '968', label: 'x' })
    expect(typed.ok && typed.number).toBe('96891234567')
    // The chosen country still comes first when both readings are numbers.
    const local = whatsAppLink({ number: '501234567', country: '966', label: 'x' })
    expect(local.ok && local.number).toBe('966501234567')
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
      truncated: false,
    })
    expect(arabicSlug('  Oud & Bakhoor  ').slug).toBe('oud-bakhoor')
  })

  it('stops at a whole word before the rule’s length, and says so', () => {
    const title = Array.from({ length: 40 }, () => 'قهوة').join(' ')
    const result = arabicSlug(title)
    expect(result.truncated).toBe(true)
    expect(result.slug).toBe(Array.from({ length: 20 }, () => 'قهوة').join('-'))
    expect(Array.from(result.slug).length).toBeLessThanOrEqual(100)
    // One word longer than the limit is cut where it is rather than left out.
    expect(Array.from(arabicSlug('ق'.repeat(150)).slug)).toHaveLength(100)
    expect(arabicSlug('a'.repeat(100)).truncated).toBe(false)
  })

  it('writes what the url-slug-invalid rule passes, for any title', () => {
    for (const title of [
      'العُروض الخـاصة: خصم ٥٠٪!',
      'قَهوة_عربية  2026',
      'Oud & Bakhoor (New)',
      'مرحبا   بكم -- في  متجرنا',
      Array.from({ length: 60 }, () => 'عطر').join(' '),
    ]) {
      const { encoded } = arabicSlug(title)
      const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>صفحة</title><link rel="canonical" href="https://example.com/products/${encoded}"></head><body><p>مرحبا</p></body></html>`
      const page = collectPage({
        url: 'https://example.com/',
        status: 200,
        headers: [['content-type', 'text/html; charset=utf-8']],
        body: new TextEncoder().encode(html),
      })
      expect(
        evaluatePage(page, { rules: RULES, ruleIds: ['url-slug-invalid'] }).results.map(
          (result) => result.status,
        ),
        title,
      ).toEqual(['pass'])
    }
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

describe('fixProductTitle', () => {
  it('cuts an offer off the end of a title, with the words that join it', () => {
    expect(fixProductTitle('مســك أبيض 20 مل شحن مجاني وخصم ٣٠٪ لفترة محدودة')).toEqual({
      title: 'مسك أبيض 20 مل',
      changes: ['tatweel', 'promotion'],
    })
    expect(fixProductTitle('عطر العود الملكي - خصم 30% - 50 مل').title).toBe('عطر العود الملكي')
  })

  it('removes an offer at the start, and keeps the rest', () => {
    expect(fixProductTitle('خصم خاص عطر العود').title).toBe('خاص عطر العود')
    expect(fixProductTitle('FREE SHIPPING Royal Oud 50ml').title).toBe('Royal Oud 50ml')
  })

  it('writes capitals as words, keeping a size as one unit', () => {
    expect(fixProductTitle('ROYAL OUD PERFUME 50ML')).toEqual({
      title: 'Royal Oud Perfume 50ml',
      changes: ['caps'],
    })
  })

  it('collapses spaces, and stops a long title at a whole word', () => {
    expect(fixProductTitle('  عطر   العود ')).toEqual({ title: 'عطر العود', changes: ['spaces'] })
    const long = fixProductTitle(Array.from({ length: 60 }, () => 'عطر').join(' '))
    expect(Array.from(long.title).length).toBeLessThanOrEqual(150)
    expect(long.changes).toEqual(['long'])
    expect(long.title.endsWith('عطر')).toBe(true)
  })

  it('leaves a clean title alone, and what it writes passes the feed-text-quality rule', () => {
    expect(fixProductTitle('عطر العود الملكي 50 مل')).toEqual({
      title: 'عطر العود الملكي 50 مل',
      changes: [],
    })
    for (const title of [
      'ROYAL OUD PERFUME 50ML',
      'مســك أبيض شحن مجاني وخصم ٣٠٪ لفترة محدودة',
      'SALE Oud - 30% off',
    ]) {
      const fixed = fixProductTitle(title).title
      expect(PROMOTION.test(fixed), fixed).toBe(false)
      expect(isAllCaps(fixed), fixed).toBe(false)
    }
  })
})
