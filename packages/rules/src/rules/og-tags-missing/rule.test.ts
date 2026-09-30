import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

describe('og-tags-missing', () => {
  it('fires once for each missing tag', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'description',
        values: { tag: 'og:description' },
        selector: 'head',
        key: 'og:description',
      },
      { message: 'image', values: { tag: 'og:image' }, selector: 'head', key: 'og:image' },
    ])
  })

  it('counts an empty tag as missing, and points at it', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong-empty'))).toEqual([
      {
        message: 'image',
        values: { tag: 'og:image' },
        selector: 'head > meta:nth-of-type(6)',
        snippet: '<meta property="og:image" content="" />',
        location: { line: 10, column: 5 },
        key: 'og:image',
      },
    ])
  })

  it.each(['right', 'right-name'])('passes fixture %s', async (name) => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, name))).toEqual([])
  })

  it('reads the property in any letter case', () => {
    const page = htmlPage(
      '<head><meta property="OG:Title" content="ع"><meta property="og:DESCRIPTION" content="و"><meta property="og:image" content="/i.png"></head>',
    )
    expect(detectAll(rule, evidenceOf(page))).toEqual([])
  })
})
