import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, ldPage } from '../../../test/helpers'
import { rule } from './rule'

const product = (extra: Record<string, unknown>) => ({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'عطر',
  ...extra,
})
const messages = (...blocks: unknown[]) =>
  detectAll(rule, evidenceOf(ldPage(...blocks))).map((finding) => finding.message)

describe('product-required-missing', () => {
  it('fails the wrong fixture: no image and nothing to show beside the name', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'no-image',
      'no-offer',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('asks for a name, an image and one of offers, review and rating', () => {
    expect(messages(product({ name: ' ' }))).toEqual(['no-name', 'no-image', 'no-offer'])
    expect(
      messages(product({ image: 'https://x.example/a.jpg', review: { '@type': 'Review' } })),
    ).toEqual([])
    expect(messages(product({ image: ['https://x.example/a.jpg'], aggregateRating: {} }))).toEqual(
      [],
    )
    expect(messages(product({ image: [], offers: {} }))).toEqual(['no-image'])
  })

  it('reads the products in a @graph, and not the ones named inside lists or offers', () => {
    expect(
      messages({
        '@context': 'https://schema.org',
        '@graph': [{ '@type': 'WebPage', name: 'x' }, product({})],
      }),
    ).toEqual(['no-image', 'no-offer'])
    const list = {
      '@type': 'ItemList',
      itemListElement: [{ '@type': 'ListItem', position: 1, item: product({}) }],
    }
    expect(messages(list)).toEqual([])
    expect(rule.appliesTo(ldPage(list))).toBe(false)
  })

  it('leaves a product that is only a reference to its definition', () => {
    expect(rule.appliesTo(ldPage({ '@type': 'Product', '@id': 'https://x.example/#p' }))).toBe(
      false,
    )
  })

  it('points at the product’s line', () => {
    const [finding] = detectAll(rule, evidenceOf(ldPage(product({}))))
    expect(finding).toMatchObject({ values: { block: 1 }, selector: 'head > script' })
  })

  it('does not apply to a page without a product', () => {
    expect(rule.appliesTo(ldPage({ '@type': 'Organization', name: 'x' }))).toBe(false)
  })
})
