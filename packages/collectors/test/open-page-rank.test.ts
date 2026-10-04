import { describe, expect, it } from 'vitest'
import { collectOpenPageRank } from '../src/open-page-rank'

const row = (extra: Record<string, unknown> = {}) => ({
  status_code: 200,
  error: '',
  page_rank_integer: 6,
  page_rank_decimal: 6.12,
  rank: '12345',
  domain: 'example.com',
  ...extra,
})
const ok = (...rows: unknown[]) => ({ status: 200, body: { status_code: 200, response: rows } })

describe('collectOpenPageRank', () => {
  it('reads the rank, its decimals and the domain’s place', () => {
    expect(collectOpenPageRank('example.com', ok(row()))).toEqual({
      outcome: 'found',
      domain: 'example.com',
      rank: 6,
      decimal: 6.12,
      position: 12345,
    })
  })

  it('is not found for a domain it does not list, and keeps the place null when it gives none', () => {
    expect(collectOpenPageRank('example.com', ok(row({ status_code: 404 }))).outcome).toBe(
      'not-found',
    )
    expect(collectOpenPageRank('example.com', ok(row({ rank: '' }))).position).toBeNull()
  })

  it('is a failure, not a rank, for a refusal, an error or an answer of another shape', () => {
    expect(collectOpenPageRank('a.com', { status: 403, body: {} })).toMatchObject({
      outcome: 'failed',
      refused: true,
    })
    for (const answer of [
      { status: 500, body: {} },
      { status: null, body: null },
      { status: 200, body: 'x' },
      ok(),
      ok(row({ page_rank_integer: 11 })),
      ok(row({ page_rank_integer: 'x' })),
    ]) {
      expect(collectOpenPageRank('example.com', answer).outcome).toBe('failed')
    }
  })
})
