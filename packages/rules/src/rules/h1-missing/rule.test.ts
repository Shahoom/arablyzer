import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

describe('h1-missing', () => {
  it('fires when the page has no <h1>', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([{ message: 'missing', selector: 'body' }])
  })

  it('fires when every <h1> is empty, and points at the first', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-empty'))).toEqual([
      {
        message: 'empty',
        selector: 'body > main > h1',
        snippet: '<h1>',
        location: { line: 15, column: 7 },
      },
    ])
  })

  it.each(['right', 'right-logo'])('passes fixture %s', async (name) => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, name))).toEqual([])
  })

  it('does not mind several <h1> elements', () => {
    const page = htmlPage('<body><h1>المتجر</h1><h1>العروض</h1></body>')
    expect(detectAll(rule, evidenceOf(page))).toEqual([])
  })
})
