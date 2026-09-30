import type { CruxFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const PERIOD = { first: '2026-08-30', last: '2026-09-26' }
const page = evidenceOf(htmlPage('<p>نص عربي</p>'))
const crux = (overrides: Partial<CruxFacts> = {}): CruxFacts => ({
  outcome: 'found',
  scope: 'url',
  key: 'https://shop.example/',
  period: PERIOD,
  lcp: 2_100,
  inp: 180,
  cls: 0.05,
  ...overrides,
})
const withCrux = (facts: CruxFacts) => ({ ...page, crux: facts })

describe('cwv-lcp-poor', () => {
  it('fires when a quarter of real visits on phones waits over 4 s', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      {
        message: 'url',
        values: { value: 5.2, limit: 4, ...PERIOD },
        key: 'url',
      },
    ])
  })

  it("passes within Google's limit, which is not itself poor", async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
    expect(detectAll(rule, withCrux(crux({ lcp: 4000 })))).toEqual([])
  })

  it("says whose data it is: the page's, or its whole site's", () => {
    expect(detectAll(rule, withCrux(crux({ scope: 'origin', lcp: 4_001 })))).toMatchObject([
      { message: 'origin' },
    ])
  })

  it('shows seconds down to a tenth, and exactly where a tenth would be the limit (M1.3b review)', () => {
    const shown = (lcp: number) => detectAll(rule, withCrux(crux({ lcp })))[0]?.values?.value
    expect(shown(4_960)).toBe(4.9)
    expect(shown(5_200)).toBe(5.2)
    expect(shown(4_001)).toBe(4.001)
    expect(shown(4_099)).toBe(4.099)
  })

  it('applies only when CrUX has the value, for the page or its site', () => {
    expect(applies(rule, page)).toBe(false)
    expect(applies(rule, withCrux(crux({ lcp: null })))).toBe(false)
    const none = crux({ outcome: 'not-found', scope: null, key: null, period: null })
    expect(applies(rule, withCrux({ ...none, lcp: null, inp: null, cls: null }))).toBe(false)
    expect(applies(rule, withCrux(crux()))).toBe(true)
  })
})
