import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, ldPage } from '../../../test/helpers'
import { rule } from './rule'

const product = (availability: unknown) => ({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'عطر',
  offers: { '@type': 'Offer', price: '1', priceCurrency: 'SAR', availability },
})
const found = (availability: unknown) =>
  detectAll(rule, evidenceOf(ldPage(product(availability)))).map((finding) => [
    finding.message,
    finding.values?.availability,
  ])

describe('product-availability-invalid', () => {
  it('fails the wrong fixture: a word of the store’s language is no value', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [finding.message, finding.values?.availability]),
    ).toEqual([['text', 'متوفر']])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    'https://schema.org/InStock',
    'http://schema.org/OutOfStock',
    'schema:PreOrder',
    'BackOrder',
    ' https://schema.org/LimitedAvailability ',
    'https://schema.org/SoldOut',
  ])('accepts %s', (value) => {
    expect(found(value)).toEqual([])
  })

  it.each([
    ['in stock', 'text'],
    ['متوفر', 'text'],
    ['available', 'text'],
    ['https://schema.org/Instock', 'unknown'],
    ['https://schema.org/Available', 'unknown'],
    ['https://schema.org/in-stock', 'unknown'],
  ])('%s → %s', (value, message) => {
    expect(found(value)[0]?.[0]).toBe(message)
  })

  it('does not apply to offers without an availability, nor judge an empty one', () => {
    const page = ldPage(product(undefined))
    expect(rule.appliesTo(page)).toBe(false)
    expect(found('')).toEqual([])
  })

  it('reads an offer given by its @id in another block', () => {
    const page = ldPage(
      { '@type': 'Product', name: 'x', offers: { '@id': 'https://x.example/#o' } },
      {
        '@type': 'Offer',
        '@id': 'https://x.example/#o',
        price: '1',
        priceCurrency: 'SAR',
        availability: 'متوفر',
      },
    )
    expect(detectAll(rule, evidenceOf(page)).map((finding) => finding.message)).toEqual(['text'])
  })
})
