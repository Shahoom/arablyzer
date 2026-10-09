import type { CrawlReport } from '@arablyzer/api-contract'
import type { ScanRecord, ScorePoint } from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { compareCrawls } from '../src/compare/crawls'
import { markersOf, siteHistory } from '../src/compare/history'
import { addressKey, locatorOf } from '../src/compare/normalize'
import { compareScans, isComparable, type Comparable } from '../src/compare/scans'
import { reportOf, type FindingSpec } from './support/reports'

// M4.6: the pure comparison of two reports, of two crawls, and the history's alert markers.

const at = new Date('2026-10-09T12:00:00.000Z')
const scan = (id: string, report: ReturnType<typeof reportOf> | null, state = 'complete') =>
  ({
    id,
    url: 'https://shop.example/',
    tool: null,
    state: report === null ? 'failed' : state,
    createdAt: at,
    startedAt: at,
    finishedAt: at,
    report,
  }) as unknown as ScanRecord
const compared = (id: string, report: ReturnType<typeof reportOf>) => scan(id, report) as Comparable
const run = (before: FindingSpec[], after: FindingSpec[], extra = {}) =>
  compareScans(
    compared('base', reportOf(70, before, extra)),
    compared('head', reportOf(80, after, extra)),
  )

describe('the address and locator keys', () => {
  it('drop the scheme, fragment, trailing slash and tracking, and sort the query', () => {
    expect(addressKey('https://Shop.example/a/b/?utm_source=x&b=2&a=1#top')).toBe(
      'shop.example/a/b?a=1&b=2',
    )
    expect(addressKey('http://shop.example/a/b?a=1&b=2')).toBe('shop.example/a/b?a=1&b=2')
    expect(addressKey('https://shop.example/')).toBe('shop.example/')
    expect(addressKey('not a  url')).toBe('not a url')
  })

  it('read the selector and address, and the snippet only when nothing points at the finding', () => {
    expect(locatorOf({ selector: 'main   >  img' }).label).toBe('main > img')
    expect(locatorOf({ url: 'https://a.example/x' }).label).toBe('https://a.example/x')
    expect(locatorOf({ snippet: '<img\n  src=a>' }).label).toBe('<img src=a>')
    expect(locatorOf({ selector: 'a', snippet: 'one' }).key).toBe(
      locatorOf({ selector: 'a', snippet: 'two' }).key,
    )
    expect(locatorOf({}).label).toBeNull()
  })
})

describe('comparing two page reports', () => {
  it('sorts findings into new, fixed, worsened, improved and unchanged', () => {
    const result = run(
      [
        { ruleId: 'img-alt', selector: 'img.a' },
        { ruleId: 'img-alt', selector: 'img.b' },
        { ruleId: 'title', severity: 'minor' },
        { ruleId: 'canonical', severity: 'serious' },
        { ruleId: 'h1' },
      ],
      [
        { ruleId: 'img-alt', selector: 'img.a' },
        { ruleId: 'img-alt', selector: 'img.c' },
        { ruleId: 'title', severity: 'serious' },
        { ruleId: 'canonical', severity: 'minor' },
        { ruleId: 'h1' },
      ],
    )
    const by = (kind: string) =>
      result.changes.filter((c) => c.kind === kind).map((c) => `${c.ruleId}@${c.locator ?? '-'}`)
    expect(by('new')).toEqual(['img-alt@img.c'])
    expect(by('fixed')).toEqual(['img-alt@img.b'])
    expect(by('worsened')).toEqual(['title@-'])
    expect(by('improved')).toEqual(['canonical@-'])
    expect(by('unchanged')).toEqual(['h1@-', 'img-alt@img.a'])
    expect(result.counts).toEqual({ new: 1, fixed: 1, worsened: 1, improved: 1, unchanged: 2 })
    expect(result.changes.map((c) => c.kind)).toEqual([
      'new',
      'worsened',
      'fixed',
      'improved',
      'unchanged',
      'unchanged',
    ])
    expect(result.changes.find((c) => c.ruleId === 'title')).toMatchObject({
      before: 'minor',
      after: 'serious',
    })
  })

  it('matches repeats one to one by occurrence, not all to the first', () => {
    const twice = [
      { ruleId: 'link-text', url: 'https://shop.example/a' },
      { ruleId: 'link-text', url: 'https://shop.example/a/?utm_medium=mail' },
    ]
    const same = run(twice, twice)
    expect(same.counts).toMatchObject({ unchanged: 2, new: 0, fixed: 0 })
    const one = run(twice, twice.slice(0, 1))
    expect(one.counts).toMatchObject({ unchanged: 1, fixed: 1, new: 0 })
  })

  it('does not tell a finding from its fingerprint: a moved line is the same finding', () => {
    const base = reportOf(70, [{ ruleId: 'r', selector: 'div p' }])
    const head = reportOf(70, [{ ruleId: 'r', selector: 'div   p' }])
    const moved = {
      ...head,
      findings: head.findings.map((f) => ({ ...f, fingerprint: 'ffffffffffffffff' })),
    }
    expect(compareScans(compared('a', base), compared('b', moved)).counts.unchanged).toBe(1)
  })

  it('tells the overall and per-category change, in schema order, whichever side has the category', () => {
    const result = compareScans(
      compared('a', reportOf(70, [], { categories: { speed: 60, index: 90, rtl: null } })),
      compared('b', reportOf(80, [], { categories: { speed: 75, ai: 50, rtl: 70 } })),
    )
    expect(result.overall).toEqual({ before: 70, after: 80, change: 10 })
    expect(result.categories.map((c) => [c.category, c.change])).toEqual([
      ['index', null],
      ['speed', 15],
      ['ai', null],
      ['rtl', null],
    ])
  })

  it('tells what each engine did and saw, and which scans ran different rules', () => {
    const result = compareScans(
      compared(
        'a',
        reportOf(70, [{ ruleId: 'r1', engines: ['chromium', 'firefox'] }], {
          render: { chromium: 'rendered', firefox: 'rendered', webkit: 'failed' },
        }),
      ),
      compared(
        'b',
        reportOf(80, [{ ruleId: 'r1', engines: ['chromium'] }], {
          render: { chromium: 'rendered', firefox: 'failed', webkit: 'rendered' },
          ran: 38,
          ruleset: '2.0.0',
        }),
      ),
    )
    expect(result.engines).toEqual([
      {
        engine: 'chromium',
        before: 'rendered',
        after: 'rendered',
        findingsBefore: 1,
        findingsAfter: 1,
      },
      {
        engine: 'firefox',
        before: 'rendered',
        after: 'failed',
        findingsBefore: 1,
        findingsAfter: null,
      },
      {
        engine: 'webkit',
        before: 'failed',
        after: 'rendered',
        findingsBefore: null,
        findingsAfter: 0,
      },
    ])
    expect(result.sameRules).toBe(false)
    expect(run([], []).sameRules).toBe(true)
  })

  it('leaves engines out when neither side rendered, and cuts the unchanged first past the cap', () => {
    expect(run([], []).engines).toEqual([])
    const many = Array.from({ length: 450 }, (_, n) => ({
      ruleId: 'r',
      selector: `p:nth-of-type(${n})`,
    }))
    const result = run(many, [...many.slice(0, 440), { ruleId: 'x' }])
    expect(result.changes).toHaveLength(400)
    expect(result.omitted).toBe(51)
    expect(result.counts.new).toBe(1)
    expect(result.counts.fixed).toBe(10)
    expect(result.changes[0]?.kind).toBe('new')
    expect(result.changes.filter((c) => c.kind === 'fixed')).toHaveLength(10)
  })

  it('compares only finished whole-page scans with a report', () => {
    const good = scan('a', reportOf(70))
    expect(isComparable(good)).toBe(true)
    expect(isComparable(scan('b', null))).toBe(false)
    expect(isComparable({ ...good, tool: 'hreflang' })).toBe(false)
    expect(isComparable({ ...good, state: 'running' })).toBe(false)
    expect(isComparable(null)).toBe(false)
  })
})

describe('comparing two crawls', () => {
  const summary = (id: string) =>
    ({ id, state: 'done', origin: 'https://shop.example', siteId: 'site' }) as CrawlReport['crawl']
  const template = (key: string, pattern: string, scores: (number | null)[], checked = 10) => ({
    key,
    kind: 'product' as const,
    pattern,
    found: 40,
    checked,
    topIssues: [],
    representatives: scores.map((score, n) => ({
      url: `https://shop.example/${key}/${n}`,
      scanId: null,
      state: null,
      score,
    })),
  })
  const issue = (
    ruleId: string,
    on: [string, number, number][],
    options: { severity?: CrawlReport['issues'][number]['severity']; rendered?: boolean } = {},
  ): CrawlReport['issues'][number] => ({
    ruleId,
    severity: options.severity ?? 'moderate',
    title: { ar: ruleId, en: ruleId },
    rendered: options.rendered ?? false,
    pages: on.reduce((sum, [, pages]) => sum + pages, 0),
    templates: on.map(([template, pages, checked]) => ({ template, pages, checked, examples: [] })),
  })
  const crawl = (
    id: string,
    templates: CrawlReport['templates'],
    issues: CrawlReport['issues'],
  ): CrawlReport => ({ crawl: summary(id), templates, issues })

  it('matches by rule and template pattern, whatever key the crawl gave the template', () => {
    const base = crawl(
      'a',
      [template('t1', '/products/:slug', [60]), template('t2', '/blog/:slug', [80, 90])],
      [
        issue('title', [['t1', 8, 10]]),
        issue('h1', [['t1', 2, 10]]),
        issue('alt', [['t2', 3, 10]]),
        issue('canonical', [['t2', 5, 10]], { severity: 'serious' }),
        issue('gone', [['t1', 10, 10]]),
      ],
    )
    const head = crawl(
      'b',
      [template('t2', '/products/:slug', [70]), template('t1', '/blog/:slug', [85, 95])],
      [
        issue('title', [['t2', 2, 10]]),
        issue('h1', [['t2', 9, 10]]),
        issue('alt', [['t1', 3, 10]]),
        issue('canonical', [['t1', 5, 10]], { severity: 'minor' }),
        issue('fresh', [['t2', 1, 10]]),
      ],
    )
    const result = compareCrawls(base, head)
    const kinds = Object.fromEntries(result.changes.map((c) => [c.ruleId, c.kind]))
    expect(kinds).toEqual({
      title: 'improved',
      h1: 'worsened',
      alt: 'unchanged',
      canonical: 'improved',
      gone: 'fixed',
      fresh: 'new',
    })
    expect(result.changes.find((c) => c.ruleId === 'title')).toMatchObject({
      pattern: '/products/:slug',
      before: { pages: 8, checked: 10 },
      after: { pages: 2, checked: 10 },
    })
    expect(result.counts).toEqual({ new: 1, fixed: 1, worsened: 1, improved: 2, unchanged: 1 })
    expect(result.score).toEqual({ before: 77, after: 83, change: 6 })
    expect(result.templates.find((t) => t.pattern === '/products/:slug')?.score).toEqual({
      before: 60,
      after: 70,
      change: 10,
    })
  })

  it('keeps a browser finding apart from an HTML one of the same rule, and tells a template that came or went', () => {
    const base = crawl('a', [template('t1', '/a/:slug', [null])], [issue('r', [['t1', 1, 1]])])
    const head = crawl(
      'b',
      [template('t1', '/a/:slug', [null]), template('t2', '/b/:slug', [50])],
      [issue('r', [['t1', 1, 1]], { rendered: true })],
    )
    const result = compareCrawls(base, head)
    expect(result.changes.map((c) => [c.rendered, c.kind]).sort()).toEqual([
      [false, 'fixed'],
      [true, 'new'],
    ])
    expect(result.templates.find((t) => t.pattern === '/b/:slug')).toMatchObject({
      before: null,
      after: { found: 40, checked: 10 },
    })
    expect(result.score).toEqual({ before: null, after: 50, change: null })
  })
})

describe('the history’s alert markers', () => {
  const day = (n: number) => new Date(at.getTime() + n * 86_400_000)
  const point = (
    n: number,
    score: number | null,
    options: Partial<ScorePoint> = {},
  ): ScorePoint => ({
    scanId: `scan${n}`.padEnd(22, '_'),
    createdAt: day(n),
    source: 'monitor',
    state: score === null ? 'failed' : 'complete',
    score,
    categories: {},
    criticals: [],
    ...options,
  })
  const wants = { dropThreshold: 10, onCritical: true, onDown: true }

  it('marks a drop of the threshold, a new critical, and the first run of a down stretch', () => {
    const markers = markersOf(
      [
        point(0, 90),
        point(1, 85),
        point(2, 70),
        point(3, 70, { criticals: ['aaaaaaaaaaaaaaaa'] }),
        point(4, null),
        point(5, null),
        point(6, 60),
      ],
      wants,
    )
    expect(markers.map((m) => [m.kind, m.at.slice(8, 10), m.from, m.to, m.count])).toEqual([
      ['score-drop', '11', 85, 70, undefined],
      ['critical', '12', undefined, undefined, 1],
      ['down', '13', undefined, undefined, undefined],
      ['score-drop', '15', 70, 60, undefined],
    ])
  })

  it('reads a monitor run against the earlier scan of any source, never marks a manual scan, and honours the settings', () => {
    const points = [
      point(0, 90, { source: 'manual' }),
      point(1, 75),
      point(2, 50, { source: 'manual' }),
    ]
    expect(markersOf(points, wants).map((m) => m.scanId.slice(0, 5))).toEqual(['scan1'])
    expect(markersOf(points, { ...wants, dropThreshold: 20 })).toEqual([])
    expect(markersOf([point(0, null)], { ...wants, onDown: false })).toEqual([])
    expect(markersOf([point(0, null)], wants)).toHaveLength(1)
  })

  it('carries the window, the points oldest first, and no markers where monitoring does not exist', () => {
    const history = siteHistory({
      siteId: 's',
      url: 'https://shop.example/',
      days: 30,
      since: day(-30),
      points: [point(0, 90), point(1, 70)],
      wants: null,
    })
    expect(history).toMatchObject({ days: 30, alerts: false, markers: [] })
    expect(history.points.map((p) => [p.overall, p.source])).toEqual([
      [90, 'monitor'],
      [70, 'monitor'],
    ])
  })
})
