import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

describe('meta-description-missing', () => {
  it('fires when the page has no description', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([{ message: 'missing', selector: 'head' }])
  })

  it('fires on an empty description, in any letter case, and points at it', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-empty'))).toEqual([
      {
        message: 'empty',
        selector: 'head > meta:nth-of-type(3)',
        snippet: '<meta name="Description" content=" " />',
        location: { line: 7, column: 5 },
      },
    ])
  })

  it('passes a page with a description', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('passes when any of several description tags has text', () => {
    const page = htmlPage(
      '<head><meta name="description" content=""><meta name="description" content="وصف"></head>',
    )
    expect(detectAll(rule, evidenceOf(page))).toEqual([])
  })
})
