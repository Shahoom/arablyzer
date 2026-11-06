import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const ld = (...blocks: unknown[]) =>
  blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join('')
const product = (offer: object, extra: object = {}) => ({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'عطر',
  image: 'https://a.example/x.jpg',
  offers: { '@type': 'Offer', priceCurrency: 'SAR', ...offer },
  ...extra,
})
const page = (body: string, ...blocks: unknown[]) =>
  htmlPage(`<html lang="ar"><head>${ld(...blocks)}</head><body>${body}</body></html>`)
const found = (body: string, ...blocks: unknown[]) =>
  detectAll(rule, evidenceOf(page(body, ...blocks))).map((finding) => finding.message)

describe('markup-content-mismatch', () => {
  it('fails the wrong fixture: a price, a rating, a trail and a telephone the page does not show', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'price',
      'rating',
      'breadcrumb',
      'telephone',
    ])
  })

  it('passes the right fixture: all four shown, in Eastern digits', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  describe('the price', () => {
    it.each([
      ['<p>120.00 SAR</p>', 120],
      ['<p>١٢٠ ر.س</p>', 120],
      ['<p>SAR 120</p>', 120],
      ['<p>1,250.50 SAR</p>', 1250.5],
      ['<p>١٬٢٥٠٫٥٠</p>', 1250.5],
      ['<p>1.250,50</p>', 1250.5],
      ['<p>12,500 OMR</p>', 12.5],
      ['<p>12.500 OMR</p>', 12.5],
    ])('%s shows the price %d', (body, price) => {
      expect(found(body, product({ price: String(price) }))).toEqual([])
    })

    it('names a price the page does not show, or shows as another number', () => {
      expect(found('<p>110 SAR</p>', product({ price: '120.00' }))).toEqual(['price'])
      expect(found('<p>السعر عند الطلب</p>', product({ price: 120 }))).toEqual(['price'])
    })

    it('leaves a product with no price or a price of zero', () => {
      expect(found('<p>x</p>', product({}))).toEqual([])
      expect(found('<p>x</p>', product({ price: '0' }))).toEqual([])
    })

    it('reads lowPrice of an aggregate offer', () => {
      expect(
        found(
          '<p>99 SAR</p>',
          product({ '@type': 'AggregateOffer', lowPrice: '99', highPrice: '150' }),
        ),
      ).toEqual([])
      expect(found('<p>7 SAR</p>', product({ '@type': 'AggregateOffer', lowPrice: '99' }))).toEqual(
        ['price'],
      )
    })
  })

  describe('the rating', () => {
    const rated = (ratingValue: string, reviewCount: string) =>
      product(
        { price: '10' },
        { aggregateRating: { '@type': 'AggregateRating', ratingValue, reviewCount } },
      )
    it('passes when the value or the count is shown', () => {
      expect(found('<p>10 SAR ٤٫٥ من ٥</p>', rated('4.5', '128'))).toEqual([])
      expect(found('<p>10 SAR (١٢٨ تقييماً)</p>', rated('4.5', '128'))).toEqual([])
    })
    it('names a rating nowhere on the page', () => {
      expect(found('<p>10 SAR</p>', rated('4.5', '128'))).toEqual(['rating'])
    })
  })

  describe('the breadcrumb', () => {
    const trail = (...names: string[]) => ({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: names.map((name, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name,
      })),
    })
    it('passes names that stand on the page, whatever the spacing', () => {
      expect(found('<nav>الرئيسية  /  العطور</nav>', trail('الرئيسية', 'العطور'))).toEqual([])
    })
    it('counts the names the page does not show', () => {
      const [finding] = detectAll(
        rule,
        evidenceOf(page('<nav>الرئيسية</nav>', trail('الرئيسية', 'العطور', 'عود'))),
      )
      expect([finding?.message, finding?.values?.count, finding?.values?.name]).toEqual([
        'breadcrumb',
        2,
        'العطور',
      ])
    })
  })

  describe('the telephone', () => {
    const org = (telephone: string) => ({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'x',
      telephone,
    })
    it('matches the last eight digits, in any script and spacing', () => {
      expect(found('<p>٠٥٠ ١٢٣ ٤٥٦٧</p>', org('+966501234567'))).toEqual([])
      expect(found('<p>+966 50 123 4567</p>', org('+966501234567'))).toEqual([])
      expect(found('<p>0501234567</p>', org('+966 50 123 4567'))).toEqual([])
    })
    it('names a telephone the page does not show, and leaves one too short to judge', () => {
      expect(found('<p>0509876543</p>', org('+966501234567'))).toEqual(['telephone'])
      expect(found('<p>x</p>', org('1234'))).toEqual([])
    })
  })

  it('does not apply to a page with none of these', () => {
    expect(rule.appliesTo(page('<p>x</p>'))).toBe(false)
    expect(rule.appliesTo(htmlPage('<html><body><p>x</p></body></html>'))).toBe(false)
  })
})
