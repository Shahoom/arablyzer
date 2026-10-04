import { describe, expect, it } from 'vitest'
import { collectOpenPageRank, trendOf } from '../src/open-page-rank'

const history = (...points: [string, number][]) =>
  points.map(([date, score]) => ({ date, open_page_rank: score, estimated: false }))
const row = (extra: Record<string, unknown> = {}) => ({
  domain: 'example.com',
  found: true,
  open_page_rank: 6.12,
  rank: 12345,
  referring_domains: 4321,
  history: history(['2025-06-01', 5.5], ['2026-06-01', 6.12]),
  ...extra,
})
const ok = (...results: unknown[]) => ({ status: 200, body: { as_of: '2026-09-01', results } })

describe('collectOpenPageRank', () => {
  it('reads the score, the place, the referring domains, the trend and the month', () => {
    expect(collectOpenPageRank('example.com', ok(row()))).toEqual({
      outcome: 'found',
      domain: 'example.com',
      score: 6.12,
      position: 12345,
      referringDomains: 4321,
      trend: 'rising',
      asOf: '2026-09-01',
    })
  })

  it('is not found for a domain it does not list, or one the answer leaves out', () => {
    expect(
      collectOpenPageRank('example.com', ok(row({ found: false, open_page_rank: null }))).outcome,
    ).toBe('not-found')
    expect(collectOpenPageRank('example.com', ok(row({ domain: 'other.com' }))).outcome).toBe(
      'not-found',
    )
  })

  it('is a failure, not a score, for a refusal, an error or an answer of another shape', () => {
    expect(collectOpenPageRank('a.com', { status: 401, body: {} })).toMatchObject({
      outcome: 'failed',
      refused: true,
    })
    for (const answer of [
      { status: 500, body: {} },
      { status: null, body: null },
      { status: 200, body: 'x' },
      { status: 200, body: {} },
      ok(row({ open_page_rank: 11 })),
      ok(row({ open_page_rank: 'x' })),
    ]) {
      expect(collectOpenPageRank('example.com', answer).outcome).toBe('failed')
    }
  })

  it('keeps the numbers it does not understand out, not the whole score', () => {
    const facts = collectOpenPageRank(
      'example.com',
      ok(row({ rank: -3, referring_domains: 'many', history: 'x' })),
    )
    expect(facts).toMatchObject({
      outcome: 'found',
      position: null,
      referringDomains: null,
      trend: null,
      asOf: '2026-09-01',
    })
  })
})

describe('trendOf', () => {
  it('compares the latest month with one a year earlier, by a third of a point', () => {
    const at = (from: number, to: number) =>
      trendOf(history(['2025-06-01', from], ['2026-06-01', to]), to)
    expect(at(5, 5.4)).toBe('rising')
    expect(at(5, 5.2)).toBe('stable')
    expect(at(5, 4.6)).toBe('falling')
  })

  it('takes the month nearest a year back that is at least six months back, in any order', () => {
    const points = history(
      ['2026-06-01', 7],
      ['2025-01-01', 1],
      ['2025-09-01', 6],
      ['2025-12-01', 6.9],
    )
    expect(trendOf(points, 7)).toBe('rising')
  })

  it('reads a trend from measured months alone, and has none when the rest is estimated', () => {
    const estimated = [
      { date: '2025-06-01', open_page_rank: 1, estimated: true },
      { date: '2025-09-01', open_page_rank: 5, estimated: false },
      { date: '2026-06-01', open_page_rank: 5.1, estimated: false },
    ]
    expect(trendOf(estimated, 5.1)).toBe('stable')
    expect(trendOf(estimated.slice(0, 1).concat(estimated.slice(2)), 5.1)).toBeNull()
  })

  it('is null with too little history', () => {
    expect(trendOf(history(['2026-05-01', 5], ['2026-06-01', 5]), 5)).toBeNull()
    expect(trendOf([], 5)).toBeNull()
    expect(trendOf(null, 5)).toBeNull()
  })
})
