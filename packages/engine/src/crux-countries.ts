import type { CruxCountriesFacts, CruxCountry, CruxMetric } from '@arablyzer/collectors'
import { TtlCache } from './outside-http'
import type { BigQueryClient } from './bigquery'

/**
 * The Chrome UX Report by country (docs/design/plans/arabic-native.md §14). The CrUX API has no
 * country dimension; the per-country data is in BigQuery, in `chrome-ux-report.country_<cc>.<yyyymm>`
 * (monthly tables with the origin, the form factor and a histogram of each metric). One query for
 * the origin reads the nine Arab countries' tables for the latest month, phones only, and gives
 * for each the share of page loads that are good: LCP up to 2.5 s, INP up to 200 ms, CLS up to 0.1.
 * A second, smaller query asks the origin's popularity rank in each. Both are dry-run first: they
 * run only if BigQuery says they read less than the cap, and BigQuery itself refuses to bill more
 * (`maximumBytesBilled`).
 */

export const COUNTRIES = ['SA', 'AE', 'EG', 'KW', 'QA', 'BH', 'OM', 'JO', 'MA'] as const
type Code = (typeof COUNTRIES)[number]

/** The default cap on bytes billed for one scan, both queries together: 20 GiB. */
export const DEFAULT_MAX_BYTES = 20 * 1024 ** 3

/** Thresholds of a good experience (web.dev/vitals), in the units of the histograms. */
export const GOOD: Readonly<Record<CruxMetric, number>> = { lcp: 2500, inp: 200, cls: 0.1 }

export interface CruxCountriesOptions {
  readonly client: BigQueryClient
  /** Bytes billed at most for one scan; DEFAULT_MAX_BYTES. */
  readonly maxBytes?: number
}

const table = (code: Code, month: string) =>
  `chrome-ux-report.country_${code.toLowerCase()}.${month}`

/** The share of density in a histogram's bins that end at or under the threshold. */
const good = (column: string, limit: number) =>
  `(SELECT SAFE_DIVIDE(SUM(IF(SAFE_CAST(b.end AS FLOAT64) <= ${String(limit)}, b.density, 0)), SUM(b.density)) FROM UNNEST(${column}.histogram.bin) AS b)`

/** One SELECT per country, joined: the good shares of the origin's phone rows. */
export function metricsSql(month: string): string {
  return COUNTRIES.map(
    (code) => `SELECT '${code}' AS country,
  ${good('largest_contentful_paint', GOOD.lcp)} AS lcp,
  ${good('interaction_to_next_paint', GOOD.inp)} AS inp,
  ${good('layout_instability.cumulative_layout_shift', GOOD.cls)} AS cls
FROM \`${table(code, month)}\`
WHERE origin = @origin AND form_factor.name = 'phone'`,
  ).join('\nUNION ALL\n')
}

/** The origin's popularity rank in each country (a separate query: if the column differs, only it fails). */
export function rankSql(month: string): string {
  return COUNTRIES.map(
    (code) => `SELECT '${code}' AS country, experimental.popularity.rank AS rank
FROM \`${table(code, month)}\`
WHERE origin = @origin
LIMIT 1`,
  )
    .map((select) => `(${select})`)
    .join('\nUNION ALL\n')
}

/** The month before `date`, as yyyymm: CrUX publishes a month's tables in the next month. */
export function monthsBefore(date: Date): [string, string] {
  const month = (back: number) => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - back, 1))
    return `${String(d.getUTCFullYear())}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  return [month(1), month(2)]
}

const number = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const cache = new TtlCache<CruxCountriesFacts>(24 * 60 * 60 * 1000, 100)

/** Forgets the answers kept (for tests). */
export function clearCruxCountriesCache(): void {
  cache.clear()
}

export interface CruxCountriesContext {
  readonly options: CruxCountriesOptions
  readonly origin: string
  readonly now?: () => Date
}

/**
 * The origin's good-experience shares in the nine countries, for the latest month that has tables.
 * `failed` when BigQuery gave no answer to either month; `too-big` when its dry run said the query
 * would read more than the cap (nothing is run, nothing is billed).
 */
export async function queryCruxCountries(
  context: CruxCountriesContext,
): Promise<CruxCountriesFacts> {
  const cap = context.options.maxBytes ?? DEFAULT_MAX_BYTES
  const cached = cache.get(context.origin)
  if (cached !== undefined) return cached
  const { client } = context.options
  const parameters = [{ name: 'origin', value: context.origin }]
  for (const month of monthsBefore((context.now ?? (() => new Date()))())) {
    // A dry run is free: it says whether the tables exist and what the query would read.
    const dry = await client.query(metricsSql(month), parameters, {
      maximumBytesBilled: cap,
      dryRun: true,
    })
    if (dry === null) continue
    if (dry.bytesProcessed > cap) return { outcome: 'too-big', bytes: dry.bytesProcessed, cap }
    const result = await client.query(metricsSql(month), parameters, { maximumBytesBilled: cap })
    if (result === null) return { outcome: 'failed' }
    let bytes = result.bytesBilled
    const ranks = new Map<string, number | null>()
    const rankDry = await client.query(rankSql(month), parameters, {
      maximumBytesBilled: cap,
      dryRun: true,
    })
    if (rankDry !== null && bytes + rankDry.bytesProcessed <= cap) {
      const rankResult = await client.query(rankSql(month), parameters, {
        maximumBytesBilled: cap - bytes,
      })
      if (rankResult !== null) {
        bytes += rankResult.bytesBilled
        for (const row of rankResult.rows) ranks.set(row.country ?? '', number(row.rank))
      }
    }
    const countries = COUNTRIES.map((code): CruxCountry => {
      const rows = result.rows.filter((row) => row.country === code)
      const average = (metric: CruxMetric): number | null => {
        const values = rows.flatMap((row) => number(row[metric]) ?? [])
        return values.length === 0
          ? null
          : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1000) /
              1000
      }
      return {
        country: code,
        found: rows.length > 0,
        good: { lcp: average('lcp'), inp: average('inp'), cls: average('cls') },
        rank: ranks.get(code) ?? null,
      }
    })
    const facts: CruxCountriesFacts = {
      outcome: 'checked',
      origin: context.origin,
      month,
      bytes,
      countries,
    }
    cache.set(context.origin, facts)
    return facts
  }
  return { outcome: 'failed' }
}
