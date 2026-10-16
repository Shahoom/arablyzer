import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, ldPage } from '../../../test/helpers'
import { rule } from './rule'

const product = (rating: unknown) => ({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'عطر',
  aggregateRating: { '@type': 'AggregateRating', ...(rating as object) },
})
const messages = (rating: object) =>
  detectAll(rule, evidenceOf(ldPage(product(rating)))).map((finding) => finding.message)

describe('product-rating-invalid', () => {
  it('fails the wrong fixture: a rating in Eastern Arabic digits', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [
        finding.message,
        finding.values?.property,
        finding.values?.value,
      ]),
    ).toEqual([['bad-number', 'ratingValue', '٤٫٥']])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('wants a value, a count and numbers written with digits 0–9', () => {
    expect(messages({ ratingValue: 4.5, reviewCount: 10 })).toEqual([])
    expect(messages({ ratingValue: '4.5', ratingCount: '10' })).toEqual([])
    expect(messages({ reviewCount: 10 })).toEqual(['no-value'])
    expect(messages({ ratingValue: 4 })).toEqual(['no-count'])
    expect(messages({ ratingValue: '4,5', reviewCount: 10 })).toEqual(['bad-number'])
    expect(messages({ ratingValue: 4, reviewCount: '١٢٠' })).toEqual(['bad-number'])
    expect(messages({ ratingValue: 4, reviewCount: 0 })).toEqual(['count-zero'])
  })

  it('judges the value inside the scale, 1 to 5 unless the rating says another', () => {
    expect(messages({ ratingValue: 5.5, reviewCount: 1 })).toEqual(['out-of-range'])
    expect(messages({ ratingValue: 0, reviewCount: 1 })).toEqual(['out-of-range'])
    expect(messages({ ratingValue: 85, bestRating: 100, worstRating: 0, reviewCount: 1 })).toEqual(
      [],
    )
    expect(messages({ ratingValue: 101, bestRating: 100, reviewCount: 1 })).toEqual([
      'out-of-range',
    ])
  })

  it('reads a review’s rating too, which needs no count', () => {
    const page = ldPage({
      '@type': 'Product',
      name: 'x',
      review: { '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: '٥' } },
    })
    expect(detectAll(rule, evidenceOf(page)).map((finding) => finding.message)).toEqual([
      'bad-number',
    ])
  })

  it('does not apply to a page without a product, nor to a product without a rating', () => {
    expect(rule.appliesTo(ldPage({ '@type': 'AggregateRating', ratingValue: 9 }))).toBe(false)
    expect(rule.appliesTo(ldPage({ '@type': 'Product', name: 'x', image: 'y', offers: {} }))).toBe(
      false,
    )
  })
})
