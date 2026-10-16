import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SOTAW_UI } from '@arablyzer/i18n'
import { aggregate, type AggregateResult } from '@arablyzer/sotaw/aggregate'
import { buildEdition } from '@arablyzer/sotaw/edition'
import type { FrameMeta } from '@arablyzer/sotaw/frame'
import { METRICS } from '@arablyzer/sotaw/metrics'
import type { Outcome } from '@arablyzer/sotaw/outcome'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sotawData } from '../scripts/sotaw-data'
import {
  citation,
  countryChart,
  datasetJsonLd,
  fill,
  findings,
  frameRows,
  funnelRows,
  pct,
  platformName,
  platformRows,
  segments,
  span,
  type EditionData,
} from '../src/lib/sotaw-model'

const copy = SOTAW_UI.en
const frame: FrameMeta = {
  source: 'tranco',
  listId: 'TEST1',
  listCreatedOn: '2026-10-01',
  seed: 'seed',
  cap: 10_000,
  floor: 300,
  total: 400,
  populations: { sa: 200, eg: 150, ye: 10, ae: 40 },
  sampled: { sa: 200, eg: 150, ye: 10, ae: 40 },
  optedOut: 0,
  sha256: 'c'.repeat(64),
}

function outcome(rules: Record<string, 'p' | 'f' | 'n'>, platform: string | null = null): Outcome {
  return {
    v: 1,
    reached: true,
    status: 'complete',
    rendered: true,
    engines: ['chromium'],
    script: 'arabic',
    lang: 'ar',
    dir: 'rtl',
    score: 70,
    platform,
    crux: null,
    rules,
    ruleset: '1.2.0',
    ms: 9000,
  }
}

const rows = (n: number, country: string, o: Outcome): AggregateResult[] =>
  Array.from({ length: n }, () => ({ country, state: 'done' as const, reason: null, outcome: o }))
const results: AggregateResult[] = [
  ...rows(60, 'sa', outcome({ 'ar-letter-spacing': 'f', 'rtl-html-dir': 'f' }, 'salla')),
  ...rows(90, 'sa', outcome({ 'ar-letter-spacing': 'p', 'rtl-html-dir': 'p' })),
  ...rows(30, 'eg', outcome({ 'ar-letter-spacing': 'f', 'rtl-html-dir': 'p' })),
  ...rows(100, 'eg', outcome({ 'ar-letter-spacing': 'p', 'rtl-html-dir': 'p' }, 'wordpress')),
  ...rows(5, 'ye', outcome({ 'ar-letter-spacing': 'p' })),
  { country: 'ae', state: 'skipped', reason: 'robots', outcome: null },
  { country: 'ae', state: 'failed', reason: 'timeout', outcome: null },
]
const aggregates = aggregate({
  edition: 'test',
  frame,
  crawl: {
    startedAt: new Date('2026-10-20T00:00:00Z'),
    finishedAt: new Date('2026-10-22T00:00:00Z'),
  },
  results,
})
const edition: EditionData = {
  id: 'test',
  aggregates,
  files: [
    { name: 'aggregates.json', bytes: 2048, sha256: 'a'.repeat(64), description: 'x' },
    { name: 'sites.parquet', bytes: 4096, sha256: 'b'.repeat(64), description: 'y' },
  ],
}

describe('the numbers the page shows', () => {
  it('say a share as a percentage, whole from ten and a decimal under it', () => {
    expect([0, 0.0004, 0.034, 0.1, 0.236, 1].map(pct)).toEqual([
      '0%',
      '<0.1%',
      '3.4%',
      '10%',
      '24%',
      '100%',
    ])
    expect(fill('{n} of {total} {missing}', { n: 3, total: '4' })).toBe('3 of 4 {missing}')
  })

  it('cuts a line at its values so each can be set apart, left to right, in Arabic text', () => {
    expect(
      segments('عيّنة {sites} موقعاً ({list}، {date}) {missing}', {
        sites: '3,767',
        list: 'Y83YG',
        date: '2026-10-01',
      }),
    ).toEqual([
      { text: 'عيّنة ', value: false },
      { text: '3,767', value: true },
      { text: ' موقعاً (', value: false },
      { text: 'Y83YG', value: true },
      { text: '، ', value: false },
      { text: '2026-10-01', value: true },
      { text: ') {missing}', value: false },
    ])
    expect(segments('no values', {})).toEqual([{ text: 'no values', value: false }])
  })

  it('findings: each headline metric with its share and interval, and none that was not judged', () => {
    const list = findings(aggregates, copy)
    expect(list.map((f) => f.id)).toEqual(['shaping', 'rtl-lang'])
    const shaping = list.find((f) => f.id === 'shaping')
    expect(shaping?.n).toBe(285)
    expect(Number.parseFloat(shaping?.lo ?? '')).toBeLessThan(
      Number.parseFloat(shaping?.value ?? ''),
    )
    expect(shaping?.title).toBe(copy.metrics.shaping?.title)
  })

  it('country chart: the countries with enough pages, largest first, and the small ones named as hidden', () => {
    const chart = countryChart(aggregates, 'shaping', 'en', copy)
    expect(chart.bars.map((b) => b.code)).toEqual(['sa', 'eg'])
    expect(chart.hidden).toEqual(['Yemen'])
    expect(chart.max).toBeGreaterThanOrEqual(Math.max(...chart.bars.map((b) => b.hi)))
    for (const bar of chart.bars) {
      expect(bar.from).toBeLessThanOrEqual(bar.length)
      expect(bar.to).toBeGreaterThanOrEqual(bar.length)
      expect(bar.to).toBeLessThanOrEqual(100)
    }
    expect(countryChart(aggregates, 'arabic-font', 'en', copy).bars).toEqual([])
  })

  it('a bar starts at the start of the line: the left in English, the right in Arabic', () => {
    expect(span(0, 40, false)).toEqual({ x: 0, width: 40 })
    expect(span(0, 40, true)).toEqual({ x: 60, width: 40 })
    expect(span(10, 30, true)).toEqual({ x: 70, width: 20 })
  })

  it('platforms: the named ones and the rest as the remainder, never a small platform’s own count', () => {
    const list = platformRows(aggregates, copy)
    expect(list.map((row) => row.id)).toEqual(['wordpress', 'salla', 'other'])
    expect(list.at(-1)?.n).toBe(aggregates.funnel.reached - 160)
    expect(Math.max(...list.map((r) => r.length))).toBe(100)
    expect(platformName('wordpress')).toBe('WordPress')
    expect(platformName('some-new-cms')).toBe('Some New Cms')
  })

  it('the funnel: the frame, those reached, each reason for a skip, the failures', () => {
    const list = funnelRows(aggregates, copy)
    expect(list.map((r) => [r.key, r.n])).toEqual([
      ['frame', results.length],
      ['reached', 285],
      ['skipped-robots', 1],
      ['failed', 1],
    ])
    expect(list.find((r) => r.key === 'skipped-robots')?.label).toBe(copy.funnel.reasons.robots)
  })

  it('the frame: the countries by their sites, none with zero', () => {
    const list = frameRows(
      {
        listId: 'T',
        listCreatedOn: null,
        total: 400,
        cap: 10000,
        floor: 300,
        seed: 's',
        populations: frame.populations,
        sha256: 'c'.repeat(64),
      },
      'en',
    )
    expect(list.map((r) => [r.code, r.n])).toEqual([
      ['sa', 200],
      ['eg', 150],
      ['ae', 40],
      ['ye', 10],
    ])
  })
})

describe('the Dataset markup', () => {
  const ld = datasetJsonLd({
    edition,
    lang: 'en',
    copy,
    pageUrl: 'https://arablyzer.example/en/state-of-arabic-web',
    origin: 'https://arablyzer.example',
    organization: { name: 'Arablyzer', url: 'https://arablyzer.example' },
  })

  it('names the licence, the creator, the coverage and each file with its hash', () => {
    expect(ld['@type']).toBe('Dataset')
    expect(ld.license).toBe('https://creativecommons.org/licenses/by/4.0/')
    expect(ld.temporalCoverage).toBe('2026-10-20/2026-10-22')
    expect(ld.isAccessibleForFree).toBe(true)
    const files = ld.distribution as {
      contentUrl: string
      sha256: string
      encodingFormat: string
    }[]
    expect(files.map((f) => f.contentUrl)).toEqual([
      'https://arablyzer.example/data/state-of-arabic-web/test/aggregates.json',
      'https://arablyzer.example/data/state-of-arabic-web/test/sites.parquet',
    ])
    expect(files[1]?.encodingFormat).toBe('application/vnd.apache.parquet')
    expect((ld.variableMeasured as unknown[]).length).toBe(METRICS.length)
    expect(String(ld.description).length).toBeGreaterThan(50)
  })

  it('cites the edition, with the licence', () => {
    expect(citation('test', '2026', 'https://x/', 'en')).toContain('CC BY 4.0')
    expect(citation('test', '2026', 'https://x/', 'ar')).toContain('حالة الويب العربي')
  })
})

describe('the copy', () => {
  it('has words for every metric, group and skip reason the edition can hold, in both languages', () => {
    for (const lang of ['ar', 'en'] as const) {
      const t = SOTAW_UI[lang]
      for (const metric of METRICS) {
        expect(t.metrics[metric.id]?.title, `${lang} ${metric.id}`).toBeTruthy()
        expect(t.metrics[metric.id]?.hint, `${lang} ${metric.id}`).toBeTruthy()
        expect(t.groups[metric.group], `${lang} ${metric.group}`).toBeTruthy()
        if (metric.categories.length <= 3) {
          for (const key of metric.categories)
            expect(t.categories[key], `${lang} ${key}`).toBeTruthy()
        }
      }
      for (const reason of [
        'robots',
        'robots-unreachable',
        'bot-challenge',
        'http-error',
        'unreachable',
        'not-html',
        'off-domain',
        'opt-out',
        'no-page',
        'other',
      ]) {
        expect(t.funnel.reasons[reason], `${lang} ${reason}`).toBeTruthy()
      }
    }
  })

  it('states no number that the page or the crawl does not give: a placeholder, not a digit', () => {
    // The licence's name and the confidence level are the report's own constants; the rest comes by placeholder.
    const own = /CC BY 4\.0|95%|`[^`]*`|\{[a-zA-Z]+\}/g
    for (const lang of ['ar', 'en'] as const) {
      const t = SOTAW_UI[lang]
      const lines = [
        t.lead,
        t.soon.lead,
        ...t.soon.items,
        ...t.method.sections.flatMap((s) => [
          ...(s.paragraphs ?? []),
          ...(s.items ?? []),
          ...(s.after ?? []),
        ]),
      ]
      for (const line of lines)
        expect(line.replace(own, ''), `${lang}: ${line}`).not.toMatch(/[0-9\u0660-\u0669]/)
    }
  })
})

describe('the data the build reads', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sotaw-'))
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('is the sample frame alone while there is no edition', () => {
    const data = sotawData({ editions: join(dir, 'none') })
    expect(data.edition).toBeNull()
    expect(data.frame?.total).toBeGreaterThan(0)
    expect(
      Object.values(data.frame?.populations ?? {}).reduce((a, b) => a + b, 0),
    ).toBeGreaterThanOrEqual(data.frame?.total ?? 1)
  })

  it('is the newest edition when its files are the ones the manifest lists, and refuses a changed file', () => {
    const made = buildEdition({
      edition: 'test',
      frame,
      crawl: { startedAt: null, finishedAt: null },
      rows: results.map((r, i) => ({
        runId: 'r',
        domain: `site${String(i)}.${r.country}`,
        country: r.country,
        rank: i + 1,
        position: i,
        state: r.state,
        reason: r.reason,
        attempts: 1,
        scanId: null,
        outcome: r.outcome,
      })),
      secret: 'k'.repeat(40),
    })
    const folder = join(dir, 'editions', 'test')
    mkdirSync(folder, { recursive: true })
    for (const file of made.files) writeFileSync(join(folder, file.name), file.bytes)
    const data = sotawData({ editions: join(dir, 'editions') })
    expect(data.edition?.id).toBe('test')
    expect(data.edition?.aggregates.funnel.reached).toBe(285)
    expect(data.edition?.files.map((f) => f.name)).toContain('sites.parquet')
    writeFileSync(
      join(folder, 'aggregates.csv'),
      `${readFileSync(join(folder, 'aggregates.csv'), 'utf8')}x`,
    )
    expect(() => sotawData({ editions: join(dir, 'editions') })).toThrow(/manifest/)
  })
})
