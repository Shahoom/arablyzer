import { describe, expect, it } from 'vitest'
import { THREE_DECIMAL_CURRENCIES } from '../../lib/iso-codes'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { CURRENCIES, rule } from './rule'

const page = (body: string) => htmlPage(`<html lang="ar"><body>${body}</body></html>`)
const detect = (body: string) => detectAll(rule, evidenceOf(page(body)))
const prices = (body: string) =>
  detect(body).map((finding) => [finding.message, finding.values?.price, finding.values?.fixed])

describe('price-decimals', () => {
  it('fires once per currency, at the first price, when prices in rials have two decimals', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'two-decimals',
        values: { price: '12.50 ر.ع.', fixed: '12.500 ر.ع.', currency: 'OMR', count: 3 },
        selector: 'body > main > ul > li:nth-of-type(1) > span > bdi',
        location: { line: 18 },
        key: 'OMR',
      },
    ])
  })

  it('reads Arabic-Indic digits and the Arabic decimal separator', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-arabic-digits'))).toEqual([
      {
        message: 'one-decimal',
        values: { price: '٣٫٥ د.ك.', fixed: '٣٫٥٠٠ د.ك.', currency: 'KWD', count: 1 },
        selector: 'body > main > p:nth-of-type(2)',
        location: { line: 16 },
        key: 'KWD',
      },
    ])
  })

  it('passes three decimals, whole prices, other currencies and numbers that are not prices', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('knows only currencies that ISO 4217 gives three decimals', () => {
    expect(CURRENCIES.map(({ code }) => code)).toEqual(['OMR', 'KWD', 'BHD'])
    for (const { code } of CURRENCIES) expect(THREE_DECIMAL_CURRENCIES.has(code)).toBe(true)
  })

  it('reads the markers before and after the number', () => {
    for (const [body, price, fixed] of [
      ['<p>OMR 12.50</p>', 'OMR 12.50', 'OMR 12.500'],
      ['<p>12.5 OMR</p>', '12.5 OMR', '12.500 OMR'],
      ['<p>R.O. 3.75</p>', 'R.O. 3.75', 'R.O. 3.750'],
      ['<p>السعر 3.75 RO</p>', '3.75 RO', '3.750 RO'],
      ['<p>KD 1.25</p>', 'KD 1.25', 'KD 1.250'],
      ['<p>K.D 1.25</p>', 'K.D 1.25', 'K.D 1.250'],
      ['<p>وKWD 1.25</p>', 'KWD 1.25', 'KWD 1.250'],
      ['<p>BD 0.5</p>', 'BD 0.5', 'BD 0.500'],
      ['<p>2.25BHD</p>', '2.25BHD', '2.250BHD'],
      ['<p>ر.ع 7.5</p>', 'ر.ع 7.5', 'ر.ع 7.500'],
      ['<p>7.50 ر. ع.</p>', '7.50 ر. ع.', '7.500 ر. ع.'],
      ['<p>9.99 د.ب</p>', '9.99 د.ب', '9.990 د.ب'],
      ['<p>بسعر 20.5 ريال عماني فقط</p>', '20.5 ريال عماني', '20.500 ريال عماني'],
      ['<p>20.50 ريالاً عمانياً</p>', '20.50 ريالاً عمانياً', '20.500 ريالاً عمانياً'],
      ['<p>1.25 دينار كويتي</p>', '1.25 دينار كويتي', '1.250 دينار كويتي'],
      ['<p>3.50 دنانير بحرينية</p>', '3.50 دنانير بحرينية', '3.500 دنانير بحرينية'],
      ['<p>1,250.50 KD</p>', '1,250.50 KD', '1,250.500 KD'],
      ['<p>١٬٢٥٠٫٥ ر.ع.</p>', '١٬٢٥٠٫٥ ر.ع.', '١٬٢٥٠٫٥٠٠ ر.ع.'],
    ] as const) {
      expect(prices(body), body).toMatchObject([[expect.any(String), price, fixed]])
    }
  })

  it('joins a number and its currency split across inline elements, but not across blocks', () => {
    expect(prices('<p><span>12.50</span> <span>ر.ع.</span></p>')).toEqual([
      ['two-decimals', '12.50 ر.ع.', '12.500 ر.ع.'],
    ])
    expect(prices('<p><b>KD</b><i>3.5</i></p>')).toEqual([['one-decimal', 'KD3.5', 'KD3.500']])
    expect(detect('<div>12.50</div><div>ر.ع.</div>')).toEqual([])
    expect(detect('<p>12.50<br>ر.ع.</p>')).toEqual([])
  })

  it('leaves out words that only contain the markers, and ambiguous or missing currencies', () => {
    for (const body of [
      '<p>PRO 12.50</p>',
      '<p>12.50 ROM</p>',
      '<p>12.50 KDE</p>',
      '<p>12.50 ريال</p>',
      '<p>12.50 دينار</p>',
      '<p>12.50 دينار أردني</p>',
      '<p>د. بشير 12.50</p>',
      '<p>12.50 د. كمال</p>',
      '<p>12.50 SAR</p>',
      '<p>الخصم 12.5% على 20 ر.ع.</p>',
      '<p>12,50 ر.ع.</p>',
      '<p>1.250.50 ر.ع.</p>',
      '<p>OMR 12.500 و15 OMR</p>',
      '<code>12.50 OMR</code>',
    ]) {
      expect(detect(body), body).toEqual([])
    }
  })

  it('counts every such price in a currency, and reports each currency on its own', () => {
    const findings = detect('<p>OMR 1.5، OMR 2.500، KD 3.25، OMR 4.25</p><p>KD 5.5</p>')
    expect(findings.map((finding) => [finding.key, finding.values])).toEqual([
      ['OMR', { price: 'OMR 1.5', fixed: 'OMR 1.500', currency: 'OMR', count: 2 }],
      ['KWD', { price: 'KD 3.25', fixed: 'KD 3.250', currency: 'KWD', count: 2 }],
    ])
  })

  it('applies to pages with a price in one of these currencies', () => {
    expect(rule.appliesTo(page('<p>15 ر.ع.</p>'))).toBe(true)
    expect(rule.appliesTo(page('<p>Price: OMR 15.000</p>'))).toBe(true)
    expect(rule.appliesTo(page('<p>12.50 ريال سعودي</p>'))).toBe(false)
    expect(rule.appliesTo(page('<p>متجر</p>'))).toBe(false)
  })

  // Independent review, 2026-09-27.
  it('leaves out amounts in thousands, millions or billions, as on bank and news pages', () => {
    for (const body of [
      '<p>The bank reported a net profit of KD 12.5 million for the quarter.</p>',
      '<p>Total assets reached BD 1.2 billion.</p>',
      '<p>The project cost RO 3.5 million, or RO 3.5m, and RO 1.25bn in total.</p>',
      '<p>بلغ صافي الربح د.ك 2.5 مليون، والأصول 1.2 مليار دينار كويتي.</p>',
      '<p>ارتفعت الودائع إلى 12.5 ألف ر.ع.</p>',
    ]) {
      expect(detect(body), body).toEqual([])
    }
    expect(prices('<p>KD 12.5 مليوناً</p>')).toEqual([])
    expect(prices('<p>KD 12.5 for millions of customers</p>')).toHaveLength(1)
  })

  it('stays linear on a long line of prices split by inline elements', () => {
    // Timed without the parse, which is linear and not the rule's.
    const evidence = evidenceOf(page(`<p>${'<b>1.5 KD</b> '.repeat(40_000)}</p>`))
    const start = performance.now()
    const findings = detectAll(rule, evidence)
    expect(performance.now() - start).toBeLessThan(3000)
    expect(findings).toMatchObject([{ values: { count: 40_000 } }])
  }, 30_000)
})
