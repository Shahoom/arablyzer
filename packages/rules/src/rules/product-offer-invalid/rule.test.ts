import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (...blocks: unknown[]) =>
  htmlPage(
    `<html lang="ar"><head>${blocks
      .map(
        (block) =>
          `<script type="application/ld+json">${typeof block === 'string' ? block : JSON.stringify(block)}</script>`,
      )
      .join('')}</head><body><p>متجر</p></body></html>`,
  )
const detect = (...blocks: unknown[]) => detectAll(rule, evidenceOf(page(...blocks)))
const product = (offers: unknown, type: unknown = 'Product') => ({
  '@context': 'https://schema.org',
  '@type': type,
  name: 'عطر العود الملكي',
  offers,
})
const offer = (fields: Record<string, unknown>) => ({ '@type': 'Offer', ...fields })
const messages = (...blocks: unknown[]) =>
  detect(...blocks).map((finding) => [finding.message, finding.values])

describe('product-offer-invalid', () => {
  it('fires on a price in Arabic-Indic digits and a currency written as a symbol', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'bad-price',
        values: { block: 1, line: 19, property: 'price', price: '١٢٫٥٠٠' },
        selector: 'head > script',
        snippet: '"price": "١٢٫٥٠٠",',
        location: { line: 19, column: 20 },
        key: '1/offers/price',
      },
      {
        message: 'bad-currency',
        values: { block: 1, line: 20, currency: 'ر.ع.' },
        selector: 'head > script',
        snippet: '"priceCurrency": "ر.ع.",',
        location: { line: 20, column: 28 },
        key: '1/offers/priceCurrency',
      },
    ])
  })

  it('fires on an AggregateOffer with no lowPrice and no currency, at the offer', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong-missing')
    const at = {
      selector: 'head > script',
      snippet: '"offers": {',
      location: { line: 17, column: 19 },
      key: '1/offers',
    }
    expect(detectAll(rule, evidence)).toEqual([
      { message: 'no-price', values: { block: 1, line: 17, property: 'lowPrice' }, ...at },
      { message: 'no-currency', values: { block: 1, line: 17 }, ...at },
    ])
  })

  it('passes offers by reference in @graph, AggregateOffer lowPrice and priceSpecification', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('takes numbers and strings of digits with a full stop, and nothing else', () => {
    for (const price of [12.5, 0, '12.500', ' 45 ', '0.750', { '@value': '3.250' }]) {
      expect(messages(product(offer({ price, priceCurrency: 'OMR' })))).toEqual([])
    }
    for (const [price, shown] of [
      ['1,250.000', '1,250.000'],
      ['12,5', '12,5'],
      ['12.500 OMR', '12.500 OMR'],
      ['ر.ع. 12.500', 'ر.ع. 12.500'],
      ['۱۲.۵', '۱۲.۵'],
      [-5, '-5'],
      [true, 'true'],
    ] as const) {
      expect(messages(product(offer({ price, priceCurrency: 'OMR' })))).toEqual([
        ['bad-price', { block: 1, line: 1, property: 'price', price: shown }],
      ])
    }
  })

  it('counts an empty or null price as no price', () => {
    for (const price of ['', '  ', null, []]) {
      expect(messages(product(offer({ price, priceCurrency: 'SAR' })))).toEqual([
        ['no-price', { block: 1, line: 1, property: 'price' }],
      ])
    }
  })

  it('takes ISO 4217 codes in any letter case, and flags symbols, abbreviations and tickers', () => {
    for (const priceCurrency of ['OMR', 'kwd', ' BHD ', ['SAR'], { '@value': 'AED' }]) {
      expect(messages(product(offer({ price: 10, priceCurrency })))).toEqual([])
    }
    for (const currency of ['RO', 'KD', 'SR', 'ريال', '$', 'BTC', 'OMR SAR']) {
      expect(messages(product(offer({ price: 10, priceCurrency: currency })))).toEqual([
        ['bad-currency', { block: 1, line: 1, currency }],
      ])
    }
    expect(messages(product(offer({ price: 10 })))).toEqual([
      ['no-currency', { block: 1, line: 1 }],
    ])
  })

  it('reads price and currency from priceSpecification, and checks every one of them', () => {
    const specs = [
      { '@type': 'UnitPriceSpecification', price: 10, priceCurrency: 'QAR' },
      { '@type': 'UnitPriceSpecification', priceType: 'StrikethroughPrice', price: '12,00' },
    ]
    const [finding] = detect(product(offer({ priceSpecification: specs })))
    expect(finding).toMatchObject({
      message: 'bad-price',
      values: { property: 'price', price: '12,00' },
      key: '1/offers/priceSpecification/1/price',
    })
    expect(detect(product(offer({ priceSpecification: specs.slice(0, 1) })))).toEqual([])
  })

  it('checks lowPrice and highPrice of an AggregateOffer, not price', () => {
    const aggregate = (fields: Record<string, unknown>) =>
      product({ '@type': 'AggregateOffer', priceCurrency: 'OMR', ...fields })
    expect(messages(aggregate({ lowPrice: '8.500', highPrice: '25.000' }))).toEqual([])
    expect(messages(aggregate({ price: '8.500' }))).toEqual([
      ['no-price', { block: 1, line: 1, property: 'lowPrice' }],
    ])
    expect(messages(aggregate({ lowPrice: 8.5, highPrice: '25,000' }))).toEqual([
      ['bad-price', { block: 1, line: 1, property: 'highPrice', price: '25,000' }],
    ])
  })

  it('finds products by type anywhere in the block: subtypes, full IRIs, @graph, lists', () => {
    const bad = offer({ price: '١٠', priceCurrency: 'OMR' })
    for (const type of [
      'Car',
      'https://schema.org/Product',
      'schema:ProductGroup',
      ['Thing', 'Product'],
    ]) {
      expect(detect(product(bad, type))).toHaveLength(1)
    }
    expect(
      detect({ '@graph': [{ '@type': 'ItemList', itemListElement: [{ item: product(bad) }] }] }),
    ).toMatchObject([{ key: '1/@graph/0/itemListElement/0/item/offers/price' }])
    expect(detect(product(bad, 'Service'))).toEqual([])
    expect(detect(product(bad, 'product'))).toEqual([])
  })

  it('checks each offer in a list, and leaves out Demand and offers that are not objects', () => {
    const offers = [
      offer({ price: 10, priceCurrency: 'OMR' }),
      offer({ price: 12 }),
      { '@type': 'Demand' },
      'https://www.example.com/offer',
    ]
    expect(detect(product(offers)).map((finding) => [finding.message, finding.key])).toEqual([
      ['no-currency', '1/offers/1'],
    ])
  })

  it('follows @id references across blocks, and skips those it cannot resolve', () => {
    const findings = detect(product({ '@id': '#offer' }), {
      '@context': 'https://schema.org',
      ...offer({ '@id': '#offer', price: '5 ر.ع.', priceCurrency: 'OMR' }),
    })
    expect(findings).toMatchObject([
      { message: 'bad-price', values: { block: 2, property: 'price' }, key: '2/price' },
    ])
    expect(detect(product({ '@id': '#elsewhere' }))).toEqual([])
    expect(rule.appliesTo(page(product({ '@id': '#elsewhere' })))).toBe(false)
  })

  it('reports an offer shared by two products once', () => {
    const shared = { '@id': '#offer' }
    const findings = detect({
      '@context': 'https://schema.org',
      '@graph': [
        product(shared),
        { ...product(shared), name: 'دهن عود' },
        offer({ '@id': '#offer', price: 7 }),
      ],
    })
    expect(findings.map((finding) => [finding.message, finding.key])).toEqual([
      ['no-currency', '1/@graph/2'],
    ])
  })

  it('numbers blocks among all JSON-LD blocks and skips blocks that do not parse', () => {
    const findings = detect(
      '{"@type": "Product",}',
      '',
      product(offer({ price: 1, priceCurrency: 'RO' })),
    )
    expect(findings).toMatchObject([{ message: 'bad-currency', values: { block: 3 } }])
  })

  it('applies only to pages with a product offer', () => {
    expect(rule.appliesTo(page(product(offer({ price: 1, priceCurrency: 'OMR' }))))).toBe(true)
    expect(rule.appliesTo(page({ '@type': 'Product', name: 'x', aggregateRating: {} }))).toBe(false)
    expect(rule.appliesTo(page(product([])))).toBe(false)
    expect(rule.appliesTo(page({ '@type': 'Event', offers: offer({ price: 'free' }) }))).toBe(false)
    expect(rule.appliesTo(htmlPage('<p>متجر</p>'))).toBe(false)
  })

  // Independent review, 2026-09-27.
  it('stays linear in the number of problems in one block', () => {
    const offers = Array.from({ length: 16_000 }, () => '{"@type":"Offer"}').join(',\n')
    const block = `{"@context":"https://schema.org","@type":"Product","name":"x","offers":[\n${offers}\n]}`
    const start = performance.now()
    const findings = detect(block)
    expect(findings).toHaveLength(32_000)
    expect(findings.at(-1)).toMatchObject({
      location: { line: 16_001 },
      snippet: '{"@type":"Offer"}',
    })
    expect(performance.now() - start).toBeLessThan(3000)
  })
})
