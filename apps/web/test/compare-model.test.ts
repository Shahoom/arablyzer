import type { AccountScan } from '@arablyzer/api-contract/codes'
import { describe, expect, it } from 'vitest'
import {
  compareHref,
  isCrawlComparison,
  isScanComparison,
  isSiteHistory,
  previousScanOf,
  readQuery,
  shortDay,
  signed,
  toneOf,
} from '../src/islands/compare-model'

const A = 'A'.repeat(22)
const B = 'B'.repeat(22)

describe('the link to a comparison and the query that opens it', () => {
  it('goes to the page of the language, with the two ids in the query', () => {
    expect(compareHref('en', 'scan', A, B)).toBe(
      `/en/account/compare?type=scan&base=${A}&head=${B}`,
    )
    expect(compareHref('ar', 'crawl', A, B)).toBe(`/account/compare?type=crawl&base=${A}&head=${B}`)
  })

  it('reads it back, and refuses anything that is not a type and two different ids', () => {
    expect(readQuery(`?type=scan&base=${A}&head=${B}`)).toEqual({ type: 'scan', base: A, head: B })
    expect(readQuery(`?type=crawl&base=${A}&head=${B}`)?.type).toBe('crawl')
    for (const bad of [
      '',
      `?base=${A}&head=${B}`,
      `?type=report&base=${A}&head=${B}`,
      `?type=scan&base=${A}&head=${A}`,
      `?type=scan&base=short&head=${B}`,
      `?type=scan&base=${A}&head=${B}x`,
      `?type=scan&base=${A}%0A&head=${B}`,
    ]) {
      expect(readQuery(bad), bad).toBeNull()
    }
  })
})

describe('the previous scan', () => {
  const scan = (
    id: string,
    url: string,
    score: number | null,
    state = 'complete',
  ): AccountScan => ({
    id,
    url,
    state: state as AccountScan['state'],
    score,
    createdAt: '2026-10-09T12:00:00.000Z',
    siteId: null,
  })
  const list = [
    scan('new', 'https://a.example/', 90),
    scan('other', 'https://b.example/', 80),
    scan('failed', 'https://a.example/', null, 'failed'),
    scan('older', 'https://a.example/', 70),
    scan('oldest', 'https://a.example/', 60),
  ]

  it('is the next older scan of the same address that reached the page', () => {
    expect(previousScanOf(list, 0)?.id).toBe('older')
    expect(previousScanOf(list, 3)?.id).toBe('oldest')
  })

  it('is none for the oldest, for a scan that did not reach the page, or one with nothing older of its address', () => {
    expect(previousScanOf(list, 4)).toBeNull()
    expect(previousScanOf(list, 2)).toBeNull()
    expect(previousScanOf(list, 1)).toBeNull()
    expect(previousScanOf(list, 9)).toBeNull()
  })
})

describe('the numbers a comparison shows', () => {
  it('signs a change with a real minus and Western digits, and a dash for none', () => {
    expect(signed(12)).toBe('+12')
    expect(signed(-3)).toBe('−3')
    expect(signed(0)).toBe('0')
    expect(signed(null)).toBe('–')
    expect(toneOf({ before: 1, after: 2, change: 1 })).toBe('better')
    expect(toneOf({ before: 2, after: 1, change: -1 })).toBe('worse')
    expect(toneOf({ before: 2, after: 2, change: 0 })).toBe('same')
    expect(toneOf({ before: null, after: 2, change: null })).toBe('none')
  })

  it('writes a short day in the page’s language', () => {
    const time = Date.parse('2026-10-09T23:30:00.000Z')
    expect(shortDay(time, 'en')).toBe('Oct 9')
    expect(shortDay(time, 'ar')).toMatch(/^9 /)
  })
})

describe('the guards of the API’s answers', () => {
  const change = { before: 1, after: 2, change: 1 }
  const compared = { id: A, url: 'https://a.example/', createdAt: 'x' }
  const counts = { new: 0, fixed: 0, worsened: 0, improved: 0, unchanged: 0 }
  const scanComparison = {
    base: compared,
    head: compared,
    overall: change,
    categories: [{ category: 'speed', ...change }],
    engines: [],
    sameRules: true,
    counts,
    changes: [
      {
        kind: 'new',
        ruleId: 'r',
        severity: 'minor',
        message: { ar: 'ع', en: 'e' },
        engines: [],
      },
    ],
    omitted: 0,
  }

  it('accept a scan comparison and refuse one with a field missing or of a wrong kind', () => {
    expect(isScanComparison(scanComparison)).toBe(true)
    expect(isScanComparison({ ...scanComparison, counts: { new: 0 } })).toBe(false)
    expect(isScanComparison({ ...scanComparison, changes: [{ kind: 'odd' }] })).toBe(false)
    expect(isScanComparison({ ...scanComparison, overall: { before: 'x' } })).toBe(false)
    expect(isScanComparison(null)).toBe(false)
  })

  it('accept a crawl comparison and a site history, and refuse a point whose date is not one', () => {
    expect(
      isCrawlComparison({
        base: { id: A, origin: 'https://a.example' },
        head: { id: B },
        score: change,
        templates: [{ pattern: '/p/:slug', kind: 'product', score: change }],
        counts,
        changes: [],
        omitted: 0,
      }),
    ).toBe(true)
    expect(isCrawlComparison({ ...scanComparison })).toBe(false)
    const history = {
      siteId: 's',
      url: 'https://a.example/',
      days: 30,
      since: 'x',
      alerts: false,
      points: [
        {
          scanId: A,
          at: '2026-10-09T00:00:00.000Z',
          source: 'manual',
          overall: 80,
          categories: { speed: null },
        },
      ],
      markers: [{ scanId: A, at: 'x', kind: 'down' }],
    }
    expect(isSiteHistory(history)).toBe(true)
    expect(
      isSiteHistory({ ...history, points: [{ ...history.points[0], at: 'not a date' }] }),
    ).toBe(false)
    expect(isSiteHistory({ ...history, markers: [{ scanId: A, at: 'x', kind: 'odd' }] })).toBe(
      false,
    )
  })
})
