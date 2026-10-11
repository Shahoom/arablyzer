import { describe, expect, it } from 'vitest'
import { checkGtin, checkPrice } from '../../lib/feed'
import { detectAll, fixtureFeed, rssFeed } from '../../../test/helpers'
import { rule } from './rule'

const BASE = `<g:id>1</g:id><title>t</title><description>d</description><link>https://x.example/1</link>
<g:image_link>https://x.example/1.jpg</g:image_link><g:price>1.00 SAR</g:price><g:availability>in_stock</g:availability>`
const messages = (...extra: string[]) =>
  detectAll(rule, rssFeed(...extra.map((item) => BASE + item))).map((finding) => finding.message)

describe('feed-values-invalid', () => {
  it('fails the wrong fixture with each kind of problem once', () => {
    expect(
      detectAll(rule, fixtureFeed(rule.id, 'wrong')).map((finding) => [
        finding.message,
        finding.values?.attribute,
        finding.values?.value,
      ]),
    ).toEqual([
      ['availability', 'availability', 'متوفر'],
      ['price-arabic-digits', 'price', '١٢٠ ر.س'],
      ['link', 'link', '/p/oud-1'],
      ['gtin-checksum', 'gtin', '4006381333932'],
      ['sale-price', 'sale_price', '60 ≥ 45.5 SAR'],
    ])
  })

  it('passes the right fixture', () => {
    expect(detectAll(rule, fixtureFeed(rule.id, 'right'))).toEqual([])
  })

  it('groups the same problem and counts the products', () => {
    const [finding] = detectAll(
      rule,
      rssFeed(
        BASE.replace('in_stock', 'متوفر'),
        BASE.replace('<g:id>1</g:id>', '<g:id>2</g:id>').replace('in_stock', 'متوفر'),
        BASE.replace('<g:id>1</g:id>', '<g:id>3</g:id>').replace('in_stock', 'غير متوفر'),
      ),
    )
    expect(finding).toMatchObject({
      message: 'availability',
      values: { value: 'متوفر', count: 2, id: '1' },
    })
    expect(detectAll(rule, rssFeed(BASE, BASE)).length).toBe(0)
  })

  it('takes the specification’s spellings of availability and condition', () => {
    expect(
      messages(
        '<g:condition>New</g:condition>',
        '<g:condition>used</g:condition>',
        '<g:condition>refurbished</g:condition>',
      ),
    ).toEqual([])
    expect(messages('<g:condition>جديد</g:condition>')).toEqual(['condition'])
    for (const value of ['In Stock', 'out of stock', 'PREORDER', 'backorder']) {
      expect(detectAll(rule, rssFeed(BASE.replace('in_stock', value)))).toEqual([])
    }
    expect(detectAll(rule, rssFeed(BASE.replace('in_stock', 'available')))).toHaveLength(1)
  })

  it('judges sale prices only in the price’s currency', () => {
    expect(messages('<g:sale_price>0.50 SAR</g:sale_price>')).toEqual([])
    expect(messages('<g:sale_price>1.00 SAR</g:sale_price>')).toEqual(['sale-price'])
    expect(messages('<g:sale_price>5.00 AED</g:sale_price>')).toEqual([])
  })

  it('judges link and image_link as full http or https addresses', () => {
    expect(messages('')).toEqual([])
    expect(
      detectAll(rule, rssFeed(BASE.replace('https://x.example/1.jpg', 'x.example/1.jpg'))),
    ).toHaveLength(1)
    expect(
      detectAll(rule, rssFeed(BASE.replace('https://x.example/1<', 'ftp://x.example/1<'))),
    ).toHaveLength(1)
    expect(
      detectAll(rule, rssFeed(BASE.replace('https://x.example/1<', 'https://x.example/a b<'))),
    ).toHaveLength(1)
  })
})

describe('checkPrice', () => {
  it.each([
    ['120.00 SAR', null],
    ['12.500 OMR', null],
    ['5 egp', null],
    ['١٢٠.٠٠ SAR', 'arabic-digits'],
    ['120٫50 SAR', 'arabic-digits'],
    ['1,200.00 SAR', 'separator'],
    ['120,50 SAR', 'separator'],
    ['120', 'currency-missing'],
    ['120 ر.س', 'currency-missing'],
    ['120 SR', 'currency-missing'],
    ['120.00SAR', 'currency-missing'],
    ['120 ABC', 'currency-unknown'],
    ['SAR 120', 'format'],
    ['free', 'format'],
  ])('%j → %s', (value, problem) => {
    expect(checkPrice(value).problem).toBe(problem)
  })

  it('gives the amount and currency of a price that reads', () => {
    expect(checkPrice('45.500 omr')).toEqual({ problem: null, amount: 45.5, currency: 'OMR' })
  })
})

describe('checkGtin', () => {
  it.each([
    ['4006381333931', null],
    ['036000291452', null],
    ['96385074', null],
    ['04006381333931', null],
    ['4006381333932', 'checksum'],
    ['123456789', 'length'],
    ['400638133393X', 'length'],
    ['٤٠٠٦٣٨١٣٣٣٩٣١', 'arabic-digits'],
  ])('%j → %s', (value, problem) => {
    expect(checkGtin(value)).toBe(problem)
  })
})
