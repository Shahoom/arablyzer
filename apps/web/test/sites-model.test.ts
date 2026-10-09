import { describe, expect, it } from 'vitest'
import {
  dayLabel,
  isAccountScansResponse,
  isSitesResponse,
  reportHref,
  shortUrl,
  siteProblemOf,
} from '../src/islands/sites-model'

const SCAN = {
  id: 'BBBBBBBBBBBBBBBBBBBBBB',
  url: 'https://example.com/',
  state: 'complete',
  score: 82,
  createdAt: '2026-10-09T12:00:00.000Z',
  siteId: null,
}

describe('siteProblemOf', () => {
  it('names a URL’s problem as the scan form does, and an account’s as the account pages do', () => {
    expect(siteProblemOf(400, { error: 'invalid-url' })).toEqual({ problem: 'invalid-url' })
    expect(siteProblemOf(422, { error: 'blocked-host' })).toEqual({ problem: 'blocked-host' })
    expect(
      siteProblemOf(403, { error: 'plan-limit', limit: 'savedSites', plan: 'account' }),
    ).toEqual({
      problem: 'plan-limit',
    })
    expect(siteProblemOf(429, { error: 'rate-limited', retryAfterSeconds: 90 })).toEqual({
      problem: 'rate-limited',
      retryAfterSeconds: 90,
    })
    expect(siteProblemOf(401, null)).toEqual({ problem: 'unauthorized' })
    expect(siteProblemOf(502, '<html>')).toEqual({ problem: 'unavailable' })
  })
})

describe('the shapes the page reads', () => {
  it('accepts what the API sends and refuses the rest', () => {
    expect(isSitesResponse({ sites: [], limit: 3 })).toBe(true)
    expect(
      isSitesResponse({
        sites: [{ id: 'a', url: 'u', createdAt: 'c', lastScan: SCAN }],
        limit: 3,
      }),
    ).toBe(true)
    expect(isSitesResponse({ sites: [{ id: 'a' }], limit: 3 })).toBe(false)
    expect(isSitesResponse({ sites: [], limit: '3' })).toBe(false)
    expect(isAccountScansResponse({ scans: [SCAN], historyDays: 30 })).toBe(true)
    expect(isAccountScansResponse({ scans: [{ ...SCAN, state: 'weird' }], historyDays: 30 })).toBe(
      false,
    )
    expect(isAccountScansResponse(null)).toBe(false)
  })
})

describe('labels', () => {
  it('opens a report in the page’s language, and trims an address for a list', () => {
    expect(reportHref('ar', 'abc')).toBe('/r/abc')
    expect(reportHref('en', 'abc')).toBe('/en/r/abc')
    expect(shortUrl('https://example.com/')).toBe('example.com')
    expect(shortUrl('http://example.com/a/b?x=1')).toBe('example.com/a/b?x=1')
  })

  it('writes a date with Western digits in both languages, and nothing for a bad one', () => {
    expect(dayLabel('2026-10-09T12:00:00.000Z', 'en')).toBe('Oct 9, 2026')
    expect(dayLabel('2026-10-09T12:00:00.000Z', 'ar')).toMatch(/2026/)
    expect(dayLabel('nope', 'en')).toBe('')
  })
})
