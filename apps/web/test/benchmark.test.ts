import { describe, expect, it } from 'vitest'
import {
  BENCHMARK,
  bandOf,
  buildBenchmark,
  parseBenchmark,
  percentilesOf,
} from '../src/lib/benchmark'

/** A BigQuery list of 101 values, as `bq --format=json` gives them: strings, 0 to 100 times `step`. */
const list = (step: number) => Array.from({ length: 101 }, (_, i) => String(i * step))
// Test numbers, made up for the test: no benchmark of real numbers is committed yet.
const PAGES_ROW = { pages: '1200', weight: list(30_000), requests: list(1), font: list(2_000) }
const CRUX_ROW = { origins: '800', lcp: list(40), cls: list(0.005) }
const META = { generatedAt: '2026-10-04', crawl: '2026-09-01', cruxMonth: '202609' }

describe('the committed benchmark', () => {
  it('has no numbers until the owner has run the script, and says so by being null', () => {
    expect(BENCHMARK).toBeNull()
  })
})

describe('buildBenchmark', () => {
  it('takes the quartiles and the ninetieth percentile out of the queries’ lists', () => {
    const benchmark = buildBenchmark(PAGES_ROW, CRUX_ROW, META)
    expect(benchmark?.pages).toBe(1200)
    expect(benchmark?.origins).toBe(800)
    expect(benchmark?.metrics.requests).toEqual({ p25: 25, p50: 50, p75: 75, p90: 90 })
    expect(benchmark?.metrics.weight.p50).toBe(1_500_000)
    expect(benchmark?.metrics.cls.p90).toBeCloseTo(0.45)
  })

  it('is null for rows that are not what the queries return', () => {
    expect(buildBenchmark(null, CRUX_ROW, META)).toBeNull()
    expect(buildBenchmark({ ...PAGES_ROW, weight: list(1).slice(1) }, CRUX_ROW, META)).toBeNull()
    expect(buildBenchmark({ ...PAGES_ROW, pages: 'many' }, CRUX_ROW, META)).toBeNull()
    expect(buildBenchmark(PAGES_ROW, { ...CRUX_ROW, lcp: undefined }, META)).toBeNull()
    expect(percentilesOf(Array(101).fill('x'))).toBeNull()
  })

  it('round-trips through the file’s reader, and the reader refuses what is off', () => {
    const benchmark = buildBenchmark(PAGES_ROW, CRUX_ROW, META)
    expect(parseBenchmark(JSON.parse(JSON.stringify(benchmark)))).toEqual(benchmark)
    expect(parseBenchmark({ schemaVersion: 1, status: 'none' })).toBeNull()
    expect(parseBenchmark({ ...benchmark, schemaVersion: 2 })).toBeNull()
    expect(parseBenchmark({ ...benchmark, crawl: 'September' })).toBeNull()
    const backwards = {
      ...benchmark,
      metrics: { ...benchmark?.metrics, lcp: { p25: 9, p50: 1, p75: 2, p90: 3 } },
    }
    expect(parseBenchmark(backwards)).toBeNull()
    expect(parseBenchmark(null)).toBeNull()
  })
})

describe('bandOf', () => {
  const at = { p25: 10, p50: 20, p75: 30, p90: 40 }
  it('puts a value in its quarter, lower being better, a percentile itself in the better one', () => {
    expect([5, 10, 15, 20, 25, 30, 35, 100].map((value) => bandOf(value, at))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3,
    ])
  })
})
