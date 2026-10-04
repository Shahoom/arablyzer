import raw from '../data/httparchive-benchmark.json'

/**
 * "Your page against Arabic sites": percentiles from the HTTP Archive and the Chrome UX Report, made
 * monthly by `pnpm benchmark:httparchive` (BigQuery, run by the owner) and committed as
 * src/data/httparchive-benchmark.json. Until that file has numbers, `status` is "none" and the
 * report says there is no benchmark yet. Nothing here is estimated: a number is Google's or the
 * HTTP Archive's, or it is not there.
 */
export const METRICS = ['weight', 'requests', 'font', 'lcp', 'cls'] as const
export type Metric = (typeof METRICS)[number]

/** The quartiles and the ninetieth percentile of a metric across the sites. Lower is better. */
export interface Percentiles {
  readonly p25: number
  readonly p50: number
  readonly p75: number
  readonly p90: number
}

export interface Benchmark {
  readonly schemaVersion: 1
  /** The day the numbers were made, YYYY-MM-DD. */
  readonly generatedAt: string
  /** The HTTP Archive crawl, YYYY-MM-DD, and the CrUX month, YYYYMM. */
  readonly crawl: string
  readonly cruxMonth: string
  /** What the numbers describe, in words: the sites, the device. */
  readonly scope: string
  /** Pages in the crawl, and origins in CrUX. */
  readonly pages: number
  readonly origins: number
  readonly metrics: Readonly<Record<Metric, Percentiles>>
}

/** Bytes for weight and font, a count for requests, milliseconds for lcp, no unit for cls. */
export const UNITS: Readonly<Record<Metric, 'bytes' | 'count' | 'ms' | 'none'>> = {
  weight: 'bytes',
  requests: 'count',
  font: 'bytes',
  lcp: 'ms',
  cls: 'none',
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const DAY = /^\d{4}-\d{2}-\d{2}$/
const MONTH = /^\d{6}$/

function percentiles(value: unknown): Percentiles | null {
  if (!isObject(value)) return null
  const { p25, p50, p75, p90 } = value
  const all = [p25, p50, p75, p90]
  if (!all.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null
  const [a, b, c, d] = all as [number, number, number, number]
  return a <= b && b <= c && c <= d ? { p25: a, p50: b, p75: c, p90: d } : null
}

/** The benchmark in a file's JSON, or null when it has no numbers yet or is not one. */
export function parseBenchmark(value: unknown): Benchmark | null {
  if (!isObject(value) || value.schemaVersion !== 1 || value.status === 'none') return null
  const { generatedAt, crawl, cruxMonth, scope, pages, origins, metrics } = value
  if (
    typeof generatedAt !== 'string' ||
    !DAY.test(generatedAt) ||
    typeof crawl !== 'string' ||
    !DAY.test(crawl) ||
    typeof cruxMonth !== 'string' ||
    !MONTH.test(cruxMonth) ||
    typeof scope !== 'string' ||
    typeof pages !== 'number' ||
    typeof origins !== 'number' ||
    !isObject(metrics)
  ) {
    return null
  }
  const read: Partial<Record<Metric, Percentiles>> = {}
  for (const metric of METRICS) {
    const found = percentiles(metrics[metric])
    if (found === null) return null
    read[metric] = found
  }
  return {
    schemaVersion: 1,
    generatedAt,
    crawl,
    cruxMonth,
    scope: scope.slice(0, 300),
    pages,
    origins,
    metrics: read as Record<Metric, Percentiles>,
  }
}

/** The committed benchmark: null until the owner has run the script. */
export const BENCHMARK: Benchmark | null = parseBenchmark(raw)

/**
 * Where a value falls among the sites, lower being better: 0 the best quarter, 1 better than the
 * median, 2 worse than it, 3 the worst quarter.
 */
export function bandOf(value: number, at: Percentiles): 0 | 1 | 2 | 3 {
  return value <= at.p25 ? 0 : value <= at.p50 ? 1 : value <= at.p75 ? 2 : 3
}

/** One of BigQuery's lists of 101 values (as numbers or their strings): the four percentiles. */
export function percentilesOf(list: unknown): Percentiles | null {
  if (!Array.isArray(list) || list.length !== 101) return null
  const at = (i: number) => Number(list[i])
  return percentiles({ p25: at(25), p50: at(50), p75: at(75), p90: at(90) })
}

/**
 * The benchmark from the two queries' rows (apps/web/queries), as `bq query --format=json` gives
 * them: its numbers are strings. Null if a row is not what the queries return.
 */
export function buildBenchmark(
  pagesRow: unknown,
  cruxRow: unknown,
  meta: { generatedAt: string; crawl: string; cruxMonth: string },
): Benchmark | null {
  if (!isObject(pagesRow) || !isObject(cruxRow)) return null
  const lists: Record<Metric, unknown> = {
    weight: pagesRow.weight,
    requests: pagesRow.requests,
    font: pagesRow.font,
    lcp: cruxRow.lcp,
    cls: cruxRow.cls,
  }
  const metrics: Partial<Record<Metric, Percentiles>> = {}
  for (const metric of METRICS) {
    const found = percentilesOf(lists[metric])
    if (found === null) return null
    metrics[metric] = found
  }
  const pages = Number(pagesRow.pages)
  const origins = Number(cruxRow.origins)
  if (!Number.isInteger(pages) || !Number.isInteger(origins)) return null
  return parseBenchmark({
    schemaVersion: 1,
    ...meta,
    scope:
      'Mobile root pages of Arab country-code domains in the HTTP Archive, and phone origins of Arab countries in the Chrome UX Report',
    pages,
    origins,
    metrics,
  })
}
