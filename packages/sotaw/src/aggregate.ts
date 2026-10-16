import { z } from 'zod'
import { COUNTRY_CODES } from './countries'
import type { FrameMeta } from './frame'
import { METRICS, type MetricDef } from './metrics'
import { isArabicPage, type Outcome } from './outcome'
import { weightedShare, wilsonOf, type Interval } from './stats'

/** A cell with fewer reached sites than this is not published (it could point to one site). */
export const MIN_CELL = 30

const count = z.number().int().nonnegative()
const IntervalShape = z.strictObject({
  p: z.number().min(0).max(1),
  lo: z.number().min(0).max(1),
  hi: z.number().min(0).max(1),
})

const Cell = z.strictObject({
  /** Sites reached in the cell. */
  n: count,
  /** For each metric, the sites in each of its categories. */
  m: z.record(z.string(), z.array(count)),
})
export type Cell = z.infer<typeof Cell>

/** The whole-frame answer to a metric: weighted by each country's list, so it needs no cell. */
const Overall = z.strictObject({
  /** Sites judged for the metric. */
  n: count,
  /** Each category's weighted share. */
  shares: z.array(z.number().min(0).max(1)),
  /** For a binary metric, the weighted share of `yes` with its 95% interval. */
  yes: IntervalShape.nullable(),
})
export type Overall = z.infer<typeof Overall>

export const Aggregates = z.strictObject({
  v: z.literal(1),
  edition: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
  license: z.literal('CC-BY-4.0'),
  frame: z.strictObject({
    source: z.literal('tranco'),
    listId: z.string().min(1).max(32),
    listCreatedOn: z.string().nullable(),
    seed: z.string().min(1).max(64),
    cap: count,
    floor: count,
    total: count,
    /** The sites of each country on its domains, less those left out as not the Arabic web. */
    populations: z.record(z.string(), count),
    sampled: z.record(z.string(), count),
    /** The sites left out of the frame as not the Arabic web: link shorteners, global brands' mirrors. */
    excluded: count,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  crawl: z.strictObject({
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    /** Every site of the frame was tried (reached, skipped or failed). */
    complete: z.boolean(),
    engines: z.array(z.string()).max(3),
    /** Sites also drawn in the three engines, when the crawl did that for a share of them. */
    allEnginesSites: count,
    ruleset: z.string().nullable(),
  }),
  funnel: z.strictObject({
    /** The sites of the frame. */
    frame: count,
    /** Fetched and judged, in Arabic or not. */
    reached: count,
    /** Of those, in Arabic (`lang` starts with `ar`, or the dominant script is Arabic): the pages every other figure is of. */
    arabic: count,
    /** Of those, not in Arabic: counted here and in `notArabic`, and in no other figure. */
    notArabic: count,
    /** Not tried yet, or tried and failed twice. */
    pending: count,
    failed: count,
    /** Not judged, by why: robots.txt, no way in, a bot challenge, not a page… */
    skipped: z.record(z.string(), count),
  }),
  minCell: count,
  metrics: z.array(
    z.strictObject({
      id: z.string(),
      kind: z.enum(['problem', 'adoption', 'distribution']),
      group: z.string(),
      categories: z.array(z.string()),
    }),
  ),
  /** The platforms with enough sites to be named; `other` and `none` stand for the rest. */
  platforms: z.array(z.strictObject({ id: z.string(), n: count })),
  /** Arabic pages reached in each country, whatever the cell's size. */
  countries: z.array(z.strictObject({ code: z.string(), n: count })),
  /** `all`, `c:sa`, `p:salla`, `c:sa|p:salla`: only those with at least `minCell` sites. */
  cells: z.record(z.string(), Cell),
  overall: z.record(z.string(), Overall.nullable()),
  /**
   * The pages on Arab domains that are not in Arabic, as a share of the pages judged, weighted like
   * the other whole-frame figures: `n` pages judged, `yes` the share that is not in Arabic.
   */
  notArabic: Overall.nullable(),
})
export type Aggregates = z.infer<typeof Aggregates>

/** A site's row at the end of a crawl, as the aggregation reads it. */
export interface AggregateResult {
  readonly country: string
  readonly state: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  readonly reason: string | null
  readonly outcome: Outcome | null
}

export interface AggregateInput {
  readonly edition: string
  readonly frame: FrameMeta
  readonly crawl: { readonly startedAt: Date | null; readonly finishedAt: Date | null }
  readonly results: readonly AggregateResult[]
  readonly minCell?: number
}

export const cellKey = (country: string | null, platform: string | null): string =>
  [country === null ? '' : `c:${country}`, platform === null ? '' : `p:${platform}`]
    .filter((part) => part !== '')
    .join('|') || 'all'

/** The metrics' definitions as an edition records them, so that a file explains itself. */
export const metricsOf = (defs: readonly MetricDef[] = METRICS): Aggregates['metrics'] =>
  defs.map(({ id, kind, group, categories }) => ({ id, kind, group, categories: [...categories] }))

/** The platform a site is counted under: its id when enough sites share it, `other`, or `none`. */
export function platformKey(outcome: Outcome, named: ReadonlySet<string>): string {
  if (outcome.platform === null) return 'none'
  return named.has(outcome.platform) ? outcome.platform : 'other'
}

/** A country's pages judged for a metric: its list's size, the pages in each category, and their sum. */
interface Stratum {
  readonly population: number
  readonly counts: readonly number[]
  readonly n: number
}

/**
 * The whole frame's answer: each country's shares weighted by the size of its list (by its pages
 * when the frame has no list), and, for a binary metric, the weighted share of `yes` with its interval.
 */
function weighted(parts: readonly Stratum[], categories: number, binary: boolean): Overall | null {
  const n = parts.reduce((sum, part) => sum + part.n, 0)
  if (n === 0) return null
  const total = parts.reduce((sum, part) => sum + part.population, 0)
  const shares = Array.from({ length: categories }, (_, j) =>
    total === 0
      ? parts.reduce((sum, part) => sum + (part.counts[j] ?? 0), 0) / n
      : parts.reduce(
          (sum, part) => sum + (part.population / total) * ((part.counts[j] ?? 0) / part.n),
          0,
        ),
  )
  const interval: Interval | null = !binary
    ? null
    : total === 0
      ? wilsonOf(parts.reduce((sum, part) => sum + (part.counts[0] ?? 0), 0) / n, n)
      : weightedShare(
          parts.map((part) => ({
            population: part.population,
            n: part.n,
            k: part.counts[0] ?? 0,
          })),
        )
  return {
    n,
    shares: shares.map(round6),
    yes:
      interval === null
        ? null
        : { p: round6(interval.p), lo: round6(interval.lo), hi: round6(interval.hi) },
  }
}

export function aggregate(input: AggregateInput): Aggregates {
  const minCell = input.minCell ?? MIN_CELL
  const judged = input.results.flatMap((r) =>
    r.state === 'done' && r.outcome?.reached === true
      ? [{ country: r.country, outcome: r.outcome }]
      : [],
  )
  // Every figure but the funnel and the share of pages not in Arabic is of the Arabic pages alone.
  const reached = judged.filter(({ outcome }) => isArabicPage(outcome))
  // The platforms that enough sites share to be named.
  const perPlatform = new Map<string, number>()
  for (const { outcome } of reached) {
    if (outcome.platform !== null) {
      perPlatform.set(outcome.platform, (perPlatform.get(outcome.platform) ?? 0) + 1)
    }
  }
  const named = new Set(
    [...perPlatform].filter(([, n]) => n >= minCell).map(([platform]) => platform),
  )
  const cells = new Map<string, Cell>()
  const add = (key: string, outcome: Outcome) => {
    const cell = cells.get(key) ?? { n: 0, m: {} }
    cells.set(key, cell)
    cell.n++
    for (const metric of METRICS) {
      const index = metric.classify(outcome)
      if (index === null) continue
      const counts = (cell.m[metric.id] ??= metric.categories.map(() => 0))
      counts[index] = (counts[index] ?? 0) + 1
    }
  }
  const perCountry = new Map<string, number>()
  for (const { country, outcome } of reached) {
    const platform = platformKey(outcome, named)
    perCountry.set(country, (perCountry.get(country) ?? 0) + 1)
    add('all', outcome)
    add(cellKey(country, null), outcome)
    add(cellKey(null, platform), outcome)
    add(cellKey(country, platform), outcome)
  }
  // The countries' cells before any is dropped: the whole-frame figures weight these.
  const strata = (metric: MetricDef): Stratum[] =>
    COUNTRY_CODES.flatMap((code) => {
      const counts = cells.get(cellKey(code, null))?.m[metric.id]
      const n = counts?.reduce((sum, c) => sum + c, 0) ?? 0
      return counts !== undefined && n > 0
        ? [{ population: input.frame.populations[code] ?? 0, counts, n }]
        : []
    })
  const overall: Record<string, Overall | null> = {}
  for (const metric of METRICS) {
    overall[metric.id] = weighted(
      strata(metric),
      metric.categories.length,
      metric.categories.length === 2 && metric.categories[0] === 'yes',
    )
  }
  // The pages not in Arabic, among all the pages judged: `yes` is the share that is not.
  const notArabicStrata: Stratum[] = COUNTRY_CODES.flatMap((code) => {
    const here = judged.filter((page) => page.country === code)
    const notArabic = here.filter(({ outcome }) => !isArabicPage(outcome)).length
    return here.length === 0
      ? []
      : [
          {
            population: input.frame.populations[code] ?? 0,
            counts: [notArabic, here.length - notArabic],
            n: here.length,
          },
        ]
  })
  const notArabic = weighted(notArabicStrata, 2, true)
  const published: Record<string, Cell> = {}
  for (const [key, cell] of [...cells].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (key !== 'all' && cell.n < minCell) continue
    // The metrics in their own order, whatever order the sites came in: the same sites, the same bytes.
    const m: Record<string, number[]> = {}
    for (const metric of METRICS) {
      const counts = cell.m[metric.id]
      if (counts !== undefined) m[metric.id] = counts
    }
    published[key] = { n: cell.n, m }
  }
  const skippedCounts = new Map<string, number>()
  let pending = 0
  let failed = 0
  for (const result of input.results) {
    if (result.state === 'skipped') {
      const reason = result.reason ?? 'other'
      skippedCounts.set(reason, (skippedCounts.get(reason) ?? 0) + 1)
    } else if (result.state === 'failed') failed++
    else if (result.state === 'pending' || result.state === 'running') pending++
  }
  const skipped = Object.fromEntries([...skippedCounts].sort(([a], [b]) => (a < b ? -1 : 1)))
  const engines = new Set<string>()
  let allEnginesSites = 0
  const rulesets = new Set<string>()
  for (const { outcome } of judged) {
    for (const engine of outcome.engines) engines.add(engine)
    if (outcome.engines.length === 3) allEnginesSites++
    rulesets.add(outcome.ruleset)
  }
  return {
    v: 1,
    edition: input.edition,
    license: 'CC-BY-4.0',
    frame: {
      source: input.frame.source,
      listId: input.frame.listId,
      listCreatedOn: input.frame.listCreatedOn,
      seed: input.frame.seed,
      cap: input.frame.cap,
      floor: input.frame.floor,
      total: input.frame.total,
      populations: { ...input.frame.populations },
      sampled: { ...input.frame.sampled },
      excluded: input.frame.excluded,
      sha256: input.frame.sha256,
    },
    crawl: {
      startedAt: input.crawl.startedAt?.toISOString() ?? null,
      finishedAt: input.crawl.finishedAt?.toISOString() ?? null,
      complete: pending === 0,
      engines: [...engines].sort(),
      allEnginesSites,
      ruleset: [...rulesets].sort().at(-1) ?? null,
    },
    funnel: {
      frame: input.results.length,
      reached: judged.length,
      arabic: reached.length,
      notArabic: judged.length - reached.length,
      pending,
      failed,
      skipped,
    },
    minCell,
    metrics: metricsOf(),
    platforms: [
      ...[...named]
        .map((id) => ({ id, n: perPlatform.get(id) ?? 0 }))
        .sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1)),
    ],
    countries: COUNTRY_CODES.map((code) => ({ code, n: perCountry.get(code) ?? 0 })),
    cells: published,
    overall,
    notArabic,
  }
}

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6
