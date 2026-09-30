import { describe, expect, it } from 'vitest'
import { resultOf } from '../../src/index'

describe('resultOf', () => {
  it("reads Lighthouse's performance score and lab metrics, rounded", () => {
    expect(
      resultOf({
        categories: { performance: { score: 0.874 } },
        audits: {
          'first-contentful-paint': { numericValue: 1_234.6 },
          'largest-contentful-paint': { numericValue: 2_501.2 },
          'total-blocking-time': { numericValue: 0 },
          'speed-index': { numericValue: 1_900.4 },
          'cumulative-layout-shift': { numericValue: 0.04321 },
        },
      }),
    ).toEqual({
      error: null,
      performance: 87,
      metrics: { fcp: 1_235, lcp: 2_501, tbt: 0, si: 1_900, cls: 0.043 },
    })
  })

  it('gives null for what Lighthouse could not measure, or measured as nonsense', () => {
    expect(
      resultOf({
        categories: { performance: { score: null } },
        audits: {
          'first-contentful-paint': { errorMessage: 'The page did not paint any content.' },
          'largest-contentful-paint': { numericValue: -1 },
          'cumulative-layout-shift': { numericValue: Number.NaN },
        },
      }),
    ).toEqual({
      error: 'The page did not paint any content.',
      performance: null,
      metrics: { fcp: null, lcp: null, tbt: null, si: null, cls: null },
    })
  })
})
