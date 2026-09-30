import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

describe('title-missing', () => {
  it('fires when the page has no <title>', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([{ message: 'missing', selector: 'head' }])
  })

  it('fires when the <title> holds only spaces', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-empty'))).toEqual([
      {
        message: 'empty',
        selector: 'head > title',
        snippet: '<title>',
        location: { line: 6, column: 5 },
      },
    ])
  })

  it('passes a page with a title', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('reads the HTML <title>, not the title of an SVG image', () => {
    const page = htmlPage('<body><svg><title>شعار</title></svg><p>نص</p></body>')
    expect(detectAll(rule, evidenceOf(page))).toEqual([{ message: 'missing', selector: 'head' }])
  })
})
