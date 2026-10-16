import { aggregate, type AggregateResult } from '@arablyzer/sotaw/aggregate'
import type { FrameMeta } from '@arablyzer/sotaw/frame'
import type { Outcome } from '@arablyzer/sotaw/outcome'
import { describe, expect, it } from 'vitest'
import { isEdition, viewOf, type ExplorerMetric } from '../src/islands/sotaw/explorer-model'

const frame: FrameMeta = {
  source: 'tranco',
  listId: 'TEST1',
  listCreatedOn: null,
  seed: 's',
  cap: 10_000,
  floor: 300,
  total: 100,
  populations: { sa: 300, eg: 100 },
  sampled: { sa: 300, eg: 100 },
  optedOut: 0,
  sha256: 'd'.repeat(64),
}
const page = (rule: 'p' | 'f', platform: string | null, score: number): Outcome => ({
  v: 1,
  reached: true,
  status: 'complete',
  rendered: true,
  engines: ['chromium'],
  script: 'arabic',
  lang: 'ar',
  dir: 'rtl',
  score,
  platform,
  crux: null,
  rules: { 'ar-letter-spacing': rule },
  ruleset: '1',
  ms: 1,
})
const many = (n: number, country: string, o: Outcome): AggregateResult[] =>
  Array.from({ length: n }, () => ({ country, state: 'done' as const, reason: null, outcome: o }))
const edition = aggregate({
  edition: 'test',
  frame,
  crawl: { startedAt: null, finishedAt: null },
  results: [
    ...many(30, 'sa', page('f', 'salla', 85)),
    ...many(70, 'sa', page('p', null, 45)),
    ...many(40, 'eg', page('p', null, 95)),
    ...many(5, 'eg', page('f', 'zid', 10)),
  ],
})
const shaping: ExplorerMetric = {
  id: 'shaping',
  kind: 'problem',
  title: 'Shaping',
  group: 'arabic',
  categories: [
    { key: 'yes', label: 'Yes' },
    { key: 'no', label: 'No' },
  ],
}
const score: ExplorerMetric = {
  id: 'score',
  kind: 'distribution',
  title: 'Score',
  group: 'structure',
  categories: Array.from({ length: 10 }, (_, i) => ({ key: String(i), label: String(i * 10) })),
}

describe('the explorer’s view of a selection', () => {
  it('a country: its counts, its share and a Wilson interval, unweighted', () => {
    const view = viewOf(edition, { country: 'sa', platform: null }, shaping)
    expect(view?.n).toBe(100)
    expect(view?.weighted).toBe(false)
    expect(view?.rows.map((r) => r.count)).toEqual([30, 70])
    expect(view?.yes?.p).toBe(0.3)
    expect(view?.yes?.lo).toBeLessThan(0.3)
    expect(view?.yes?.hi).toBeGreaterThan(0.3)
  })

  it('the whole sample: weighted by the countries’ lists, so a country’s weight is its list’s', () => {
    const view = viewOf(edition, { country: null, platform: null }, shaping)
    // sa: 0.3 of a list of 300; eg: 5 of 45 of a list of 100.
    expect(view?.weighted).toBe(true)
    expect(view?.yes?.p).toBeCloseTo(0.75 * 0.3 + 0.25 * (5 / 45), 5)
  })

  it('a platform alone, and a country with a platform, when they have enough pages', () => {
    expect(viewOf(edition, { country: null, platform: 'salla' }, shaping)?.rows[0]?.count).toBe(30)
    expect(viewOf(edition, { country: 'sa', platform: 'salla' }, shaping)?.n).toBe(30)
  })

  it('nothing for a selection with fewer pages than the edition’s smallest cell', () => {
    expect(viewOf(edition, { country: null, platform: 'zid' }, shaping)).toBeNull()
    expect(viewOf(edition, { country: 'eg', platform: 'zid' }, shaping)).toBeNull()
    expect(viewOf(edition, { country: 'ye', platform: null }, shaping)).toBeNull()
  })

  it('a distribution: the share in each of its categories, which add up to one', () => {
    const view = viewOf(edition, { country: 'eg', platform: null }, score)
    expect(view?.yes).toBeNull()
    expect(view?.rows.map((r) => r.count)).toEqual([0, 5, 0, 0, 0, 0, 0, 0, 0, 40])
    expect(view?.rows.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(1, 6)
  })

  it('reads only what looks like an edition', () => {
    expect(isEdition(JSON.parse(JSON.stringify(edition)))).toBe(true)
    expect(isEdition(null)).toBe(false)
    expect(isEdition({ v: 2 })).toBe(false)
    expect(isEdition({ v: 1, minCell: 30, cells: {}, overall: {} })).toBe(false)
  })
})
