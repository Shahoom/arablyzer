import { describe, expect, it } from 'vitest'
import { collectCrux } from '../src/crux'

/** A CrUX API record as records:queryRecord returns it, with CLS's p75 as a string. */
function record(key: Record<string, string>, p75: { lcp?: number; inp?: number; cls?: string }) {
  const metric = (value: number | string | undefined) =>
    value === undefined ? undefined : { histogram: [], percentiles: { p75: value } }
  return {
    record: {
      key: { formFactor: 'PHONE', ...key },
      metrics: {
        largest_contentful_paint: metric(p75.lcp),
        interaction_to_next_paint: metric(p75.inp),
        cumulative_layout_shift: metric(p75.cls),
      },
      collectionPeriod: {
        firstDate: { year: 2026, month: 8, day: 30 },
        lastDate: { year: 2026, month: 9, day: 26 },
      },
    },
  }
}

const NOT_FOUND = {
  status: 404,
  body: { error: { code: 404, message: 'chrome ux report data not found', status: 'NOT_FOUND' } },
}

describe('collectCrux', () => {
  it("reads the page's 75th percentiles on phones and the period they cover", () => {
    const answer = record({ url: 'https://shop.example/ar' }, { lcp: 4_512, inp: 180, cls: '0.31' })
    expect(collectCrux({ url: { status: 200, body: answer } })).toEqual({
      outcome: 'found',
      scope: 'url',
      key: 'https://shop.example/ar',
      period: { first: '2026-08-30', last: '2026-09-26' },
      lcp: 4_512,
      inp: 180,
      cls: 0.31,
    })
  })

  it("falls back to the origin's data when the page has none", () => {
    const origin = record({ origin: 'https://shop.example' }, { lcp: 2_100 })
    expect(collectCrux({ url: NOT_FOUND, origin: { status: 200, body: origin } })).toMatchObject({
      outcome: 'found',
      scope: 'origin',
      key: 'https://shop.example',
      lcp: 2_100,
      inp: null,
      cls: null,
    })
  })

  it('says when neither the page nor its origin has data', () => {
    expect(collectCrux({ url: NOT_FOUND, origin: NOT_FOUND })).toEqual({
      outcome: 'not-found',
      scope: null,
      key: null,
      period: null,
      lcp: null,
      inp: null,
      cls: null,
    })
  })

  it('fails on an error, no answer, or an answer that is not what the API returns', () => {
    const failed = { outcome: 'failed', scope: null, lcp: null }
    expect(collectCrux({ url: { status: 429, body: {} } })).toMatchObject(failed)
    expect(collectCrux({ url: { status: null, body: null } })).toMatchObject(failed)
    expect(collectCrux({ url: NOT_FOUND, origin: { status: 403, body: {} } })).toMatchObject(failed)
    for (const body of [null, 'text', { record: { metrics: 'none' } }]) {
      expect(collectCrux({ url: { status: 200, body } })).toMatchObject(failed)
    }
    // A value that is not a size: negative, or not a number.
    const bad = record({ url: 'https://shop.example/' }, { lcp: -5, cls: 'much' })
    expect(collectCrux({ url: { status: 200, body: bad } })).toMatchObject({ lcp: null, cls: null })
  })
})
