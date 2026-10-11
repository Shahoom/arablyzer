import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, ldPage } from '../../../test/helpers'
import { rule } from './rule'

const item = (position: unknown, name?: unknown, address?: unknown) => ({
  '@type': 'ListItem',
  ...(position === undefined ? {} : { position }),
  ...(name === undefined ? {} : { name }),
  ...(address === undefined ? {} : { item: address }),
})
const list = (...items: unknown[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items,
})
const messages = (...items: unknown[]) =>
  detectAll(rule, evidenceOf(ldPage(list(...items)))).map((finding) => finding.message)

describe('breadcrumb-schema-invalid', () => {
  it('fails the wrong fixture: a position in Eastern Arabic digits, a relative address, a name missing', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'bad-position',
      'item-relative',
      'no-name',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('wants positions 1, 2, 3 in digits 0–9', () => {
    const home = 'https://x.example/'
    expect(messages(item(1, 'a', home), item('2', 'b', `${home}b`), item(3, 'c'))).toEqual([])
    expect(messages(item(1, 'a', home), item(3, 'b', `${home}b`), item(4, 'c'))).toEqual([
      'position-order',
    ])
    expect(messages(item(2, 'a', home), item(1, 'b', `${home}b`))).toEqual(['position-order'])
    expect(messages(item('١', 'a', home), item(2, 'b'))).toEqual(['bad-position'])
    expect(messages(item(undefined, 'a', home), item(2, 'b'))).toEqual(['bad-position'])
    expect(messages(item(0, 'a', home), item(1, 'b'))).toEqual(['bad-position'])
    expect(messages(item(1.5, 'a', home), item(2, 'b'))).toEqual(['bad-position'])
  })

  it('wants a name, which may be the item’s own, and an address in every item but the last', () => {
    const home = 'https://x.example/'
    expect(messages(item(1, 'a', { '@id': home, name: 'a' }), item(2, 'b'))).toEqual([])
    expect(messages(item(1, undefined, { '@id': home, name: 'a' }), item(2, 'b'))).toEqual([])
    expect(messages(item(1, ' ', home), item(2, 'b'))).toEqual(['no-name'])
    expect(messages(item(1, 'a'), item(2, 'b'))).toEqual(['no-item'])
    expect(messages(item(1, 'a', home), item(2, 'b', 'perfumes'))).toEqual(['item-relative'])
    expect(messages(item(1, 'a', home))).toEqual([])
  })

  it('wants items in the list', () => {
    expect(messages()).toEqual(['no-items'])
    expect(
      detectAll(rule, evidenceOf(ldPage({ '@type': 'BreadcrumbList' }))).map((f) => f.message),
    ).toEqual(['no-items'])
  })

  it('reads a breadcrumb inside a WebPage and in a @graph', () => {
    const trail = list(item(1, 'a'), item(2, 'b'))
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'WebPage', breadcrumb: trail }],
    }
    expect(detectAll(rule, evidenceOf(ldPage(graph))).map((finding) => finding.message)).toEqual([
      'no-item',
    ])
  })

  it('does not apply to a page without a breadcrumb', () => {
    expect(rule.appliesTo(ldPage({ '@type': 'Product', name: 'x' }))).toBe(false)
  })
})
