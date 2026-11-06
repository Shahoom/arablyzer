import type { AccountScan, SiteHistory, SiteSummary } from '@arablyzer/api-contract/codes'
import { describe, expect, it } from 'vitest'
import {
  ago,
  alertsOf,
  appHref,
  averageScore,
  donutArcs,
  filterPalette,
  filterRows,
  filterScans,
  hostOf,
  meterOf,
  monitoredToRead,
  nearestIndex,
  NO_FILTER,
  paged,
  paletteItems,
  pageOfSlug,
  scoreBand,
  siteIdOf,
  siteRows,
  sparkOf,
} from '../src/islands/app/app-model'

const ID = 'AAAAAAAAAAAAAAAAAAAAAA'
const scan = (over: Partial<AccountScan> & { id: string }): AccountScan => ({
  url: 'https://www.example.com/',
  state: 'complete',
  score: 80,
  createdAt: '2026-10-01T12:00:00.000Z',
  siteId: ID,
  ...over,
})
const site = (over: Partial<SiteSummary> = {}): SiteSummary => ({
  id: ID,
  url: 'https://www.example.com/',
  createdAt: '2026-09-01T00:00:00.000Z',
  lastScan: null,
  monitor: null,
  crawl: null,
  ...over,
})

describe('the dashboard’s addresses', () => {
  it('puts the overview at /app and the rest under it, in both languages', () => {
    expect(appHref('ar', 'overview')).toBe('/app')
    expect(appHref('en', 'overview')).toBe('/en/app')
    expect(appHref('ar', 'sites')).toBe('/app/sites')
    expect(appHref('en', 'keys')).toBe('/en/app/keys')
    expect(appHref('en', 'site', { id: ID })).toBe(`/en/app/site?id=${ID}`)
  })

  it('reads a page from its slug, and a site id from the query only when it is one', () => {
    expect(pageOfSlug(undefined)).toBe('overview')
    expect(pageOfSlug('monitoring')).toBe('monitoring')
    expect(pageOfSlug('nope')).toBeNull()
    expect(siteIdOf(`?id=${ID}`)).toBe(ID)
    expect(siteIdOf('?id=short')).toBeNull()
    expect(siteIdOf('')).toBeNull()
  })

  it('names a site by its host without www', () => {
    expect(hostOf('https://www.example.com/shop?x=1')).toBe('example.com')
    expect(hostOf('not a url')).toBe('not a url')
  })
})

describe('a site’s row', () => {
  it('takes the scores of its scans, oldest first, and the change from the one before', () => {
    const scans = [
      scan({ id: 'c', score: 90, createdAt: '2026-10-03T00:00:00.000Z' }),
      scan({ id: 'b', score: 70, createdAt: '2026-10-02T00:00:00.000Z' }),
      scan({ id: 'a', score: 60, createdAt: '2026-10-01T00:00:00.000Z' }),
      scan({ id: 'x', score: 10, createdAt: '2026-10-04T00:00:00.000Z', siteId: 'other' }),
      scan({ id: 'f', score: null, state: 'failed', createdAt: '2026-10-05T00:00:00.000Z' }),
    ]
    const [row] = siteRows([site()], scans)
    expect(row?.series).toEqual([60, 70, 90])
    expect(row?.score).toBe(90)
    expect(row?.delta).toBe(20)
  })

  it('falls back on the last scan, and has no change from one score', () => {
    const last = scan({ id: 'z', score: 55 })
    const [row] = siteRows([site({ lastScan: last })], [])
    expect(row?.series).toEqual([55])
    expect(row?.delta).toBeNull()
    const [none] = siteRows([site()], [])
    expect(none?.score).toBeNull()
  })

  it('tells how a site is monitored', () => {
    const monitor = (paused: boolean, failures: number) => ({
      everyDays: 7,
      paused,
      failures,
      nextRunAt: '2026-10-10T00:00:00.000Z',
      trend: [],
    })
    const rows = siteRows(
      [
        site({ id: 'a'.repeat(22) }),
        site({ id: 'b'.repeat(22), monitor: monitor(false, 0) }),
        site({ id: 'c'.repeat(22), monitor: monitor(true, 0) }),
        site({ id: 'd'.repeat(22), monitor: monitor(false, 2) }),
      ],
      [],
    )
    expect(rows.map((row) => row.monitor)).toEqual(['off', 'monitored', 'paused', 'failing'])
  })

  it('averages the scored sites and filters and sorts them', () => {
    const rows = siteRows(
      [
        site({
          id: 'a'.repeat(22),
          url: 'https://alpha.example/',
          lastScan: scan({ id: '1', score: 40, createdAt: '2026-10-02T00:00:00.000Z' }),
        }),
        site({
          id: 'b'.repeat(22),
          url: 'https://beta.example/',
          lastScan: scan({ id: '2', score: 90, createdAt: '2026-10-03T00:00:00.000Z' }),
        }),
        site({ id: 'c'.repeat(22), url: 'https://gamma.example/' }),
      ],
      [],
    )
    expect(averageScore(rows)).toEqual({ value: 65, scanned: 2 })
    expect(averageScore([])).toBeNull()
    expect(filterRows(rows, '', 'all', 'recent').map((r) => r.host)).toEqual([
      'beta.example',
      'alpha.example',
      'gamma.example',
    ])
    expect(filterRows(rows, '', 'all', 'worst').map((r) => r.host)).toEqual([
      'alpha.example',
      'beta.example',
      'gamma.example',
    ])
    expect(filterRows(rows, 'ALP', 'all', 'name').map((r) => r.host)).toEqual(['alpha.example'])
    expect(filterRows(rows, '', 'monitored', 'name')).toEqual([])
  })
})

describe('a sparkline', () => {
  it('draws time from the start edge: right to left in Arabic', () => {
    const ltr = sparkOf([50, 60, 70], false)
    const rtl = sparkOf([50, 60, 70], true)
    expect(ltr.points[0]?.x).toBeLessThan(ltr.points[2]?.x ?? 0)
    expect(rtl.points[0]?.x).toBeGreaterThan(rtl.points[2]?.x ?? 0)
    // A higher score is higher up: a smaller y.
    expect(ltr.points[2]?.y).toBeLessThan(ltr.points[0]?.y ?? 0)
    expect(ltr.line.startsWith('M')).toBe(true)
    expect(ltr.area.endsWith('Z')).toBe(true)
  })

  it('keeps a steady series level and a lone point a dot', () => {
    const steady = sparkOf([80, 80, 80], false)
    expect(new Set(steady.points.map((p) => p.y)).size).toBe(1)
    const one = sparkOf([80], false)
    expect(one.line).toBe('')
    expect(one.points).toHaveLength(1)
    expect(sparkOf([], false).points).toEqual([])
  })
})

describe('a donut', () => {
  it('makes one arc a segment of one circle, each starting where the last ended', () => {
    const arcs = donutArcs([
      { key: 'critical', value: 1 },
      { key: 'serious', value: 3 },
      { key: 'minor', value: 0 },
    ])
    expect(arcs.map((arc) => arc.key)).toEqual(['critical', 'serious'])
    const circumference = 2 * Math.PI * 48
    expect(arcs[0]?.offset).toBe(0)
    expect(-(arcs[1]?.offset ?? 0)).toBeCloseTo(circumference / 4, 0)
    for (const arc of arcs) expect(arc.dash + arc.gap).toBeCloseTo(circumference, 0)
  })

  it('has no arc for nothing, and a whole circle for one part', () => {
    expect(donutArcs([{ key: 'a', value: 0 }])).toEqual([])
    const [whole] = donutArcs([{ key: 'a', value: 5 }])
    expect(whole?.dash).toBeCloseTo(2 * Math.PI * 48, 0)
  })
})

describe('meters and bands', () => {
  it('warns from four fifths and at the limit, and says when a plan has none', () => {
    expect(meterOf(1, 5).tone).toBe('ok')
    expect(meterOf(4, 5).tone).toBe('near')
    expect(meterOf(5, 5).tone).toBe('full')
    expect(meterOf(9, 5).ratio).toBe(1)
    expect(meterOf(0, 0).tone).toBe('none')
  })

  it('cuts scores at 90 and 50, as a report does', () => {
    expect([100, 90, 89, 50, 49, 0].map(scoreBand)).toEqual([
      'good',
      'good',
      'mid',
      'mid',
      'low',
      'low',
    ])
  })

  it('finds the nearest point to the pointer', () => {
    expect(nearestIndex([10, 50, 90], 60)).toBe(1)
    expect(nearestIndex([10, 50, 90], 1000)).toBe(2)
    expect(nearestIndex([], 5)).toBe(-1)
  })
})

describe('alerts', () => {
  const history = (over: Partial<SiteHistory>): SiteHistory => ({
    siteId: ID,
    url: 'https://example.com/',
    days: 30,
    since: '2026-09-01T00:00:00.000Z',
    points: [],
    markers: [],
    alerts: true,
    ...over,
  })

  it('lists the markers of every history, newest first, and skips a history that cannot mark', () => {
    const items = alertsOf([
      history({
        markers: [
          { scanId: 'a', at: '2026-10-01T00:00:00.000Z', kind: 'score-drop', from: 90, to: 70 },
          { scanId: 'b', at: '2026-10-03T00:00:00.000Z', kind: 'critical', count: 2 },
        ],
      }),
      history({
        siteId: 'other',
        alerts: false,
        markers: [{ scanId: 'c', at: '2026-10-09T00:00:00.000Z', kind: 'down' }],
      }),
    ])
    expect(items.map((item) => item.scanId)).toEqual(['b', 'a'])
    expect(items[1]).toMatchObject({ from: 90, to: 70 })
  })

  it('reads the histories of the monitored sites scanned last, up to a few', () => {
    const monitor = {
      everyDays: 7,
      paused: false,
      failures: 0,
      nextRunAt: '2026-10-10T00:00:00.000Z',
      trend: [],
    }
    const rows = siteRows(
      [
        site({
          id: 'a'.repeat(22),
          monitor,
          lastScan: scan({ id: '1', createdAt: '2026-10-01T00:00:00.000Z' }),
        }),
        site({
          id: 'b'.repeat(22),
          monitor,
          lastScan: scan({ id: '2', createdAt: '2026-10-05T00:00:00.000Z' }),
        }),
        site({ id: 'c'.repeat(22) }),
      ],
      [],
    )
    expect(monitoredToRead(rows, 1).map((s) => s.id)).toEqual(['b'.repeat(22)])
    expect(monitoredToRead(rows).map((s) => s.id)).toEqual(['b'.repeat(22), 'a'.repeat(22)])
  })
})

describe('the search', () => {
  const items = paletteItems({
    lang: 'en',
    pages: [
      { page: 'overview', label: 'Overview' },
      { page: 'sites', label: 'My sites' },
    ],
    sites: [site({ id: 'b'.repeat(22), url: 'https://shop.example.com/' })],
    scans: [scan({ id: 'S'.repeat(22), url: 'https://shop.example.com/cart' })],
    siteHint: 'Site',
    scanHint: () => 'Scan',
    reportHref: (s) => `/en/r/${s.id}`,
  })

  it('finds by every word, in the item’s label, in each group', () => {
    expect(filterPalette(items, 'shop').map((i) => i.group)).toEqual(['sites', 'scans'])
    expect(filterPalette(items, 'my sites').map((i) => i.id)).toEqual(['page:sites'])
    expect(filterPalette(items, 'zzz')).toEqual([])
    expect(filterPalette(items, '')).toHaveLength(4)
  })

  it('links a site to its page, a scan to its report, and reads addresses left to right', () => {
    const [, , shop, cart] = items
    expect(shop?.href).toBe(`/en/app/site?id=${'b'.repeat(22)}`)
    expect(cart?.href).toBe(`/en/r/${'S'.repeat(22)}`)
    expect(cart?.ltr).toBe(true)
  })
})

describe('the scans page', () => {
  const scans = [
    scan({ id: '1', url: 'https://a.example/', state: 'complete' }),
    scan({ id: '2', url: 'https://b.example/x', state: 'failed', score: null, siteId: null }),
    scan({ id: '3', url: 'https://a.example/y', state: 'partial' }),
  ]

  it('filters by words in the address, the state and the site', () => {
    expect(filterScans(scans, NO_FILTER)).toHaveLength(3)
    expect(filterScans(scans, { ...NO_FILTER, q: 'a.example' }).map((s) => s.id)).toEqual([
      '1',
      '3',
    ])
    expect(filterScans(scans, { ...NO_FILTER, state: 'failed' }).map((s) => s.id)).toEqual(['2'])
    expect(filterScans(scans, { ...NO_FILTER, siteId: ID }).map((s) => s.id)).toEqual(['1', '3'])
  })

  it('pages, keeping the page in range', () => {
    const many = Array.from({ length: 23 }, (_, i) => i)
    const second = paged(many, 2)
    expect(second).toMatchObject({ page: 2, pages: 3, from: 11, to: 20, total: 23 })
    expect(paged(many, 99).items).toEqual([20, 21, 22])
    expect(paged(many, 0).page).toBe(1)
    expect(paged([], 1)).toMatchObject({ pages: 1, from: 0, to: 0, total: 0 })
  })
})

describe('time', () => {
  const now = Date.parse('2026-10-10T12:00:00.000Z')
  it('says «yesterday» and «3 days ago» in both languages, with Western digits', () => {
    expect(ago('2026-10-09T12:00:00.000Z', now, 'en')).toBe('yesterday')
    expect(ago('2026-10-07T12:00:00.000Z', now, 'en')).toBe('3 days ago')
    expect(ago('2026-10-07T12:00:00.000Z', now, 'ar')).toMatch(/3/)
    expect(ago('garbage', now, 'en')).toBe('')
  })
})
