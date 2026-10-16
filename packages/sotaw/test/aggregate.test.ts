import { describe, expect, it } from 'vitest'
import { Aggregates, aggregate, cellKey, MIN_CELL, type AggregateResult } from '../src/aggregate'
import { estimate } from '../src/estimate'
import type { FrameMeta } from '../src/frame'
import { metricById } from '../src/metrics'
import { compact, isArabicPage } from '../src/outcome'
import { fakeReport, outcome } from './fixtures'

const frame: FrameMeta = {
  source: 'tranco',
  listId: 'TEST1',
  listCreatedOn: '2026-10-01',
  seed: 'seed',
  cap: 1000,
  floor: 10,
  total: 300,
  populations: { sa: 600, eg: 400 },
  sampled: { sa: 200, eg: 100 },
  optedOut: 0,
  excluded: 0,
  exclusions: {},
  exclusionsSha256: 'e'.repeat(64),
  sha256: 'a'.repeat(64),
}

const done = (country: string, o: ReturnType<typeof outcome>): AggregateResult => ({
  country,
  state: 'done',
  reason: null,
  outcome: o,
})
const many = (n: number, country: string, o: ReturnType<typeof outcome>) =>
  Array.from({ length: n }, () => done(country, o))

describe('a report made compact', () => {
  it('keeps a letter for each rule and a few facts, and nothing of the page', () => {
    const report = fakeReport(
      { 'ar-letter-spacing': 'fail', 'rtl-html-dir': 'pass', 'ar-digits-mixed': 'not-applicable' },
      { platform: 'salla', crux: { lcp: 2000, inp: 150, cls: 0.05 } },
    )
    const { outcome: kept, unjudged } = compact(report)
    expect(unjudged).toBeNull()
    expect(kept.rules).toEqual({
      'ar-letter-spacing': 'f',
      'rtl-html-dir': 'p',
      'ar-digits-mixed': 'n',
    })
    expect(kept).toMatchObject({
      reached: true,
      lang: 'ar',
      dir: 'rtl',
      script: 'arabic',
      platform: 'salla',
      engines: ['chromium'],
      crux: { found: true, lcp: 2000, inp: 150, cls: 0.05 },
    })
    const text = JSON.stringify(kept)
    expect(text).not.toContain('example.sa')
    expect(text).not.toContain('ArablyzerBot')
  })

  it('is not judged when the page is a bot challenge, or there is no score', () => {
    expect(
      compact(fakeReport({ 'bot-challenge': 'fail' }, { status: 'partial', score: null })).unjudged,
    ).toBe('bot-challenge')
    expect(compact(fakeReport({}, { status: 'failed', score: null, page: false })).unjudged).toBe(
      'no-page',
    )
  })
})

describe('the metrics', () => {
  const cls = (id: string, o: ReturnType<typeof outcome>) => metricById(id)?.classify(o)

  it('judge a rule that failed as yes, passed as no, and one that did not apply as nothing', () => {
    expect(cls('shaping', outcome({ 'ar-letter-spacing': 'f' }))).toBe(0)
    expect(cls('shaping', outcome({ 'ar-letter-spacing': 'p' }))).toBe(1)
    expect(cls('shaping', outcome({ 'ar-letter-spacing': 'n' }))).toBeNull()
    expect(cls('shaping', outcome({ 'ar-letter-spacing': 'e' }))).toBeNull()
    expect(cls('shaping', outcome({}))).toBeNull()
  })

  it('count a composite as present when any of its rules failed', () => {
    const font = (a: 'p' | 'f' | 'n', b: 'p' | 'f' | 'n') =>
      cls('arabic-font', outcome({ 'ar-font-no-arabic': a, 'ar-font-fallback': b }))
    expect(font('p', 'f')).toBe(0)
    expect(font('p', 'p')).toBe(1)
    expect(font('n', 'p')).toBe(1)
    expect(font('n', 'n')).toBeNull()
  })

  it('read use from a rule that applies, and a defect among the pages that use it', () => {
    expect(cls('json-ld', outcome({ 'jsonld-syntax-error': 'n' }))).toBe(1)
    expect(cls('json-ld', outcome({ 'jsonld-syntax-error': 'p' }))).toBe(0)
    expect(cls('json-ld-broken', outcome({ 'jsonld-syntax-error': 'n' }))).toBeNull()
    expect(cls('json-ld-broken', outcome({ 'jsonld-syntax-error': 'f' }))).toBe(0)
    expect(cls('sar-sign-used', outcome({ 'sar-sign-font': 'n' }))).toBe(1)
    expect(cls('sar-sign-glyph', outcome({ 'sar-sign-font': 'f' }))).toBe(0)
  })

  it('band the Core Web Vitals by the published thresholds', () => {
    const crux = (lcp: number | null, inp: number | null, cls: number | null) =>
      outcome({}, { crux: { found: true, lcp, inp, cls } })
    expect(cls('lcp', crux(2500, null, null))).toBe(0)
    expect(cls('lcp', crux(2501, null, null))).toBe(1)
    expect(cls('lcp', crux(4001, null, null))).toBe(2)
    expect(cls('inp', crux(null, 200, null))).toBe(0)
    expect(cls('cls', crux(null, null, 0.26))).toBe(2)
    expect(cls('lcp', crux(null, null, null))).toBeNull()
    expect(cls('lcp', outcome({}))).toBeNull()
    expect(cls('crux-data', outcome({}))).toBeNull()
    expect(
      cls('crux-data', outcome({}, { crux: { found: false, lcp: null, inp: null, cls: null } })),
    ).toBe(1)
  })

  it('count the security headers a page sends, only when all five were judged', () => {
    const headers = (present: number) =>
      outcome(
        Object.fromEntries(
          [
            'hsts-missing',
            'csp-missing',
            'x-content-type-options-missing',
            'frame-protection-missing',
            'referrer-policy-missing',
          ].map((id, i) => [id, i < present ? 'p' : 'f'] as const),
        ),
      )
    expect(cls('headers', headers(0))).toBe(0)
    expect(cls('headers', headers(5))).toBe(5)
    expect(cls('headers', outcome({ 'hsts-missing': 'p' }))).toBeNull()
  })

  it('put a score in its ten', () => {
    expect(cls('score', outcome({}, { score: 0 }))).toBe(0)
    expect(cls('score', outcome({}, { score: 79 }))).toBe(7)
    expect(cls('score', outcome({}, { score: 100 }))).toBe(9)
  })
})

describe('the aggregates', () => {
  const sa = outcome({ 'ar-letter-spacing': 'f', 'rtl-html-dir': 'p' })
  const saOk = outcome({ 'ar-letter-spacing': 'p', 'rtl-html-dir': 'p' })
  const salla = outcome({ 'ar-letter-spacing': 'p' }, { platform: 'salla' })
  const rare = outcome({ 'ar-letter-spacing': 'p' }, { platform: 'rare' })
  const results: AggregateResult[] = [
    ...many(60, 'sa', sa),
    ...many(140, 'sa', saOk),
    ...many(MIN_CELL, 'eg', salla),
    ...many(70, 'eg', saOk),
    ...many(3, 'eg', rare),
    { country: 'eg', state: 'skipped', reason: 'robots', outcome: null },
    { country: 'sa', state: 'skipped', reason: 'robots', outcome: null },
    { country: 'sa', state: 'failed', reason: 'timeout', outcome: null },
    { country: 'sa', state: 'pending', reason: null, outcome: null },
  ]
  const result = aggregate({
    edition: 'test',
    frame,
    crawl: { startedAt: null, finishedAt: null },
    results,
  })

  it('count the funnel, and the skips by reason', () => {
    expect(result.funnel).toEqual({
      frame: results.length,
      reached: 303,
      arabic: 303,
      notArabic: 0,
      pending: 1,
      failed: 1,
      skipped: { robots: 2 },
    })
    expect(result.crawl.complete).toBe(false)
  })

  it('count the pages judged in each category, for the whole, each country and each platform', () => {
    expect(result.cells.all?.n).toBe(303)
    expect(result.cells[cellKey('sa', null)]?.m.shaping).toEqual([60, 140])
    expect(result.cells[cellKey(null, 'salla')]?.n).toBe(MIN_CELL)
    expect(result.cells[cellKey('eg', 'salla')]?.m.shaping).toEqual([0, MIN_CELL])
  })

  it('name a platform only when enough pages share it, and fold the rest into other', () => {
    expect(result.platforms.map((p) => p.id)).toEqual(['salla'])
    expect(result.cells[cellKey(null, 'other')]).toBeUndefined()
    expect(result.cells[cellKey(null, 'none')]?.n).toBe(270)
  })

  it('publish no cell below the smallest, and say so in the estimate', () => {
    expect(result.cells[cellKey('eg', 'other')]).toBeUndefined()
    expect(estimate(result, { country: 'eg', platform: 'other' }, 'shaping')).toBeNull()
    expect(estimate(result, { country: 'sa', platform: null }, 'shaping')?.yes?.p).toBeCloseTo(
      0.3,
      6,
    )
  })

  it('weight the whole by the lists, not by the pages reached', () => {
    // sa: 60 of 200 (0.3) with 600 on its list; eg: 0 of 103 with 400 on its list.
    const whole = estimate(result, { country: null, platform: null }, 'shaping')
    expect(whole?.weighted).toBe(true)
    expect(whole?.yes?.p).toBeCloseTo(0.6 * 0.3, 6)
    expect(whole?.yes?.lo).toBeLessThan(whole?.yes?.p ?? 0)
  })

  it('are a valid file, which the same results make again byte for byte', () => {
    expect(() => Aggregates.parse(JSON.parse(JSON.stringify(result)))).not.toThrow()
    const again = aggregate({
      edition: 'test',
      frame,
      crawl: { startedAt: null, finishedAt: null },
      results: [...results].reverse(),
    })
    expect(JSON.stringify(again)).toBe(JSON.stringify(result))
  })

  it('hold no domain and no page text', () => {
    const text = JSON.stringify(result)
    expect(text).not.toMatch(/\.(sa|eg)\b/)
  })
})

describe('the pages that are not in Arabic', () => {
  const page = (change: Partial<ReturnType<typeof outcome>>, shaping: 'p' | 'f' = 'p') =>
    outcome({ 'ar-letter-spacing': shaping }, change)

  it('are the pages whose language does not start with ar and whose script is not Arabic', () => {
    expect(isArabicPage({ lang: 'ar', script: 'arabic' })).toBe(true)
    expect(isArabicPage({ lang: 'ar', script: 'latin' })).toBe(true)
    expect(isArabicPage({ lang: 'arz', script: null })).toBe(true)
    expect(isArabicPage({ lang: 'en', script: 'arabic' })).toBe(true)
    expect(isArabicPage({ lang: null, script: 'arabic' })).toBe(true)
    expect(isArabicPage({ lang: 'en', script: 'latin' })).toBe(false)
    expect(isArabicPage({ lang: 'fr', script: 'other' })).toBe(false)
    expect(isArabicPage({ lang: null, script: null })).toBe(false)
    // `arn` (Mapudungun) and `arg` (Aragonese) start with ar and are not Arabic.
    expect(isArabicPage({ lang: 'arn', script: 'latin' })).toBe(false)
    expect(isArabicPage({ lang: 'arg', script: 'latin' })).toBe(false)
  })

  const english = page({ lang: 'en', script: 'latin' }, 'f')
  const results: AggregateResult[] = [
    ...many(80, 'sa', page({}, 'f')),
    ...many(20, 'sa', page({ lang: 'en', script: 'arabic' })),
    ...many(100, 'sa', english),
    ...many(60, 'eg', page({ lang: 'ar', script: 'latin' })),
    ...many(40, 'eg', page({ lang: null, script: null, platform: 'salla' }, 'f')),
    { country: 'eg', state: 'skipped', reason: 'robots', outcome: null },
  ]
  const result = aggregate({
    edition: 'test',
    frame,
    crawl: { startedAt: null, finishedAt: null },
    results,
  })

  it('are counted on their own in the funnel, and in no other figure', () => {
    expect(result.funnel).toMatchObject({ reached: 300, arabic: 160, notArabic: 140 })
    expect(result.cells.all?.n).toBe(160)
    expect(result.cells[cellKey('sa', null)]?.n).toBe(100)
    expect(result.cells[cellKey('eg', null)]?.n).toBe(60)
    expect(result.countries.find((c) => c.code === 'sa')?.n).toBe(100)
    // The English pages, all of them failing the rule, are in no share: only the Arabic page that fails it.
    expect(result.cells[cellKey('sa', null)]?.m.shaping).toEqual([80, 20])
    expect(estimate(result, { country: 'sa', platform: null }, 'shaping')?.yes?.p).toBeCloseTo(
      0.8,
      6,
    )
    // The one page of the platform that is not in Arabic does not make the platform's share.
    expect(result.platforms).toEqual([])
    expect(result.cells[cellKey(null, 'none')]?.n).toBe(160)
  })

  it('are a figure of their own, weighted by the lists like the others', () => {
    // sa: 100 of 200 judged are not in Arabic (list 600); eg: 40 of 100 (list 400).
    expect(result.notArabic?.n).toBe(300)
    expect(result.notArabic?.yes?.p).toBeCloseTo(0.6 * 0.5 + 0.4 * 0.4, 6)
    expect(result.notArabic?.yes?.lo).toBeLessThan(result.notArabic?.yes?.p ?? 0)
    expect(result.notArabic?.yes?.hi).toBeGreaterThan(result.notArabic?.yes?.p ?? 1)
    expect(result.notArabic?.shares[0]).toBeCloseTo(0.46, 6)
    expect(() => Aggregates.parse(JSON.parse(JSON.stringify(result)))).not.toThrow()
  })

  it('are no figure when no page was judged', () => {
    const none = aggregate({
      edition: 'test',
      frame,
      crawl: { startedAt: null, finishedAt: null },
      results: [{ country: 'sa', state: 'skipped', reason: 'robots', outcome: null }],
    })
    expect(none.notArabic).toBeNull()
    expect(none.funnel).toMatchObject({ reached: 0, arabic: 0, notArabic: 0 })
  })
})
