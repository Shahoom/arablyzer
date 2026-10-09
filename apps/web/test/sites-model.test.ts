import { describe, expect, it } from 'vitest'
import {
  dayLabel,
  isAccountScansResponse,
  isAlertSettings,
  isAlertsResponse,
  isMonitorResponse,
  isSitesResponse,
  isTestResponse,
  sparkline,
  trendText,
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
    const monitoring = { limit: 1, everyDays: 7 }
    expect(isSitesResponse({ sites: [], limit: 3, monitoring })).toBe(true)
    expect(isSitesResponse({ sites: [], limit: 3 })).toBe(false)
    expect(
      isSitesResponse({
        sites: [{ id: 'a', url: 'u', createdAt: 'c', lastScan: SCAN, monitor: null }],
        limit: 3,
        monitoring,
      }),
    ).toBe(true)
    expect(isSitesResponse({ sites: [{ id: 'a' }], limit: 3, monitoring })).toBe(false)
    expect(isSitesResponse({ sites: [], limit: '3', monitoring })).toBe(false)
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

const POINT = (score: number | null) => ({
  scanId: 'CCCCCCCCCCCCCCCCCCCCCC',
  state: score === null ? ('failed' as const) : ('complete' as const),
  score,
  at: '2026-10-02T12:00:00.000Z',
})
const MONITOR = {
  everyDays: 7,
  paused: false,
  nextRunAt: '2026-10-16T12:00:00.000Z',
  failures: 0,
  trend: [POINT(90), POINT(80)],
}

describe('monitoring’s shapes', () => {
  it('reads a monitor answer, null for off, and refuses a half one', () => {
    expect(isMonitorResponse({ monitor: MONITOR })).toBe(true)
    expect(isMonitorResponse({ monitor: null })).toBe(true)
    expect(isMonitorResponse({ monitor: { ...MONITOR, trend: [{ score: 1 }] } })).toBe(false)
    expect(isMonitorResponse({})).toBe(false)
  })

  it('reads alert settings, with a secret only as text, and a test answer', () => {
    const settings = {
      webhook: { host: 'hooks.slack.com', kind: 'slack', failures: 0, disabled: false },
      dropThreshold: 10,
      onCritical: true,
      onDown: true,
      weeklySummary: false,
      email: { available: false, enabled: false },
    }
    expect(isAlertSettings(settings)).toBe(true)
    expect(isAlertSettings({ ...settings, webhook: null })).toBe(true)
    expect(isAlertSettings({ ...settings, email: undefined })).toBe(false)
    expect(isAlertsResponse({ ...settings, secret: 'abc' })).toBe(true)
    expect(isAlertsResponse({ ...settings, secret: 5 })).toBe(false)
    expect(isTestResponse({ ok: false, status: null })).toBe(true)
    expect(isTestResponse({ ok: 'yes', status: 200 })).toBe(false)
  })
})

describe('the trend', () => {
  it('says the scores in order, with a word for a run that had none', () => {
    expect(trendText([POINT(90), POINT(null), POINT(74)], 'no score')).toBe('90, no score, 74')
  })

  it('draws scores from the bottom, evenly across, and breaks the line at a run with no score', () => {
    const drawn = sparkline([POINT(100), POINT(0)])
    expect(drawn.lines).toEqual(['3,3 97,29'])
    expect(drawn.last).toEqual({ x: 97, y: 29 })
    const broken = sparkline([POINT(50), POINT(null), POINT(50), POINT(50)])
    expect(broken.lines).toHaveLength(2)
    expect(sparkline([POINT(null)])).toEqual({ lines: [], last: null })
    expect(sparkline([POINT(50)]).lines).toEqual(['50,16'])
    expect(sparkline([])).toEqual({ lines: [], last: null })
  })
})
