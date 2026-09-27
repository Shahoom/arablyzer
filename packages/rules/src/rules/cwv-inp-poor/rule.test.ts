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

describe('cwv-inp-poor', () => {
  it('fires when a quarter of real visits on phones answers taps after over 500 ms', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      {
        message: 'url',
        values: { value: 650, limit: 500, ...PERIOD },
        key: 'url',
      },
    ])
  })

  it("passes within Google's limit, which is not itself poor", async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
    expect(detectAll(rule, withCrux(crux({ inp: 500 })))).toEqual([])
  })

  it("says whose data it is: the page's, or its whole site's", () => {
    expect(detectAll(rule, withCrux(crux({ scope: 'origin', inp: 501 })))).toMatchObject([
      { message: 'origin', values: { value: 501 } },
    ])
  })

  it('applies only when CrUX has the value, for the page or its site', () => {
    expect(applies(rule, page)).toBe(false)
    expect(applies(rule, withCrux(crux({ inp: null })))).toBe(false)
    const none = crux({ outcome: 'not-found', scope: null, key: null, period: null })
    expect(applies(rule, withCrux({ ...none, lcp: null, inp: null, cls: null }))).toBe(false)
    expect(applies(rule, withCrux(crux()))).toBe(true)
  })
})
