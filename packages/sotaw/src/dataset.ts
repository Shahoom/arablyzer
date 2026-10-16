import { createHmac } from 'node:crypto'
import { parquetWriteBuffer } from 'hyparquet-writer'
import { cellKey, platformKey, type Aggregates, type AggregateResult } from './aggregate'
import { METRICS, type MetricDef } from './metrics'
import type { Outcome } from './outcome'
import { wilson } from './stats'

// The files of an edition (docs/design/plans/m9-state-of-arabic-web.md §5): a table of anonymised
// sites, a long table of the aggregates the page shows, and the JSON Schema that describes both.

export type ColumnType = 'STRING' | 'BOOLEAN' | 'INT32' | 'DOUBLE'

export interface Column {
  readonly name: string
  readonly type: ColumnType
  readonly nullable: boolean
  readonly description: string
}

/** A metric's column in the sites' table: `m_` and its id with underscores. */
export const metricColumn = (id: string): string => `m_${id.replaceAll('-', '_')}`

/** The metrics that have a column of their own in the sites' table (the score has `score`). */
const SITE_METRICS: readonly MetricDef[] = METRICS.filter((metric) => metric.id !== 'score')

export const SITE_COLUMNS: readonly Column[] = [
  {
    name: 'site_id',
    type: 'STRING',
    nullable: false,
    description:
      'The first 16 hex characters of an HMAC-SHA-256 of the domain, under a secret that is not published. It is the same for a site within one edition and cannot be computed from the sample frame.',
  },
  { name: 'edition', type: 'STRING', nullable: false, description: 'The edition of the report.' },
  {
    name: 'country',
    type: 'STRING',
    nullable: false,
    description:
      'The country code of the domain (sa, ae, eg ...), or `other` for a country with fewer reached sites than the smallest published cell.',
  },
  {
    name: 'rank_bucket',
    type: 'STRING',
    nullable: false,
    description:
      "The site's place in the Tranco list, in a bucket: 1-10k, 10k-50k, 50k-100k, 100k-500k or 500k-1M.",
  },
  {
    name: 'platform',
    type: 'STRING',
    nullable: false,
    description:
      'The platform the page runs on as the platform rule names it (`salla`, `wordpress` ...); `none` when no platform was recognised, `other` for a platform with fewer reached sites than the smallest published cell.',
  },
  {
    name: 'script',
    type: 'STRING',
    nullable: true,
    description: "The homepage's dominant script: arabic, latin, other or none.",
  },
  {
    name: 'lang',
    type: 'STRING',
    nullable: true,
    description: 'The primary subtag of the language the page declares (`ar` of `ar-SA`).',
  },
  {
    name: 'dir',
    type: 'STRING',
    nullable: true,
    description: 'The direction the page declares on its html element: ltr, rtl or auto.',
  },
  {
    name: 'engines',
    type: 'STRING',
    nullable: false,
    description: 'The browser engines the page was drawn in, joined with `+`.',
  },
  {
    name: 'score',
    type: 'INT32',
    nullable: true,
    description: "Arablyzer's score for the page, 0 to 100, under the rule set of the edition.",
  },
  ...SITE_METRICS.map((metric): Column => {
    const binary = metric.categories.length === 2 && metric.categories[0] === 'yes'
    return {
      name: metricColumn(metric.id),
      type: binary ? 'BOOLEAN' : 'STRING',
      nullable: true,
      description: binary
        ? `The metric \`${metric.id}\`: true when the page has the property, false when it does not, null when the page could not be judged for it.`
        : `The metric \`${metric.id}\`: one of ${metric.categories.join(', ')}; null when the page could not be judged for it.`,
    }
  }),
  {
    name: 'rules',
    type: 'STRING',
    nullable: false,
    description:
      'A JSON object: each rule the scan ran and a letter for its result (p pass, f fail, r needs review, n not applicable, e error).',
  },
]

export interface SiteRow {
  readonly site_id: string
  readonly edition: string
  readonly country: string
  readonly rank_bucket: string
  readonly platform: string
  readonly script: string | null
  readonly lang: string | null
  readonly dir: string | null
  readonly engines: string
  readonly score: number | null
  readonly rules: string
  readonly [column: string]: string | number | boolean | null
}

export function rankBucket(rank: number): string {
  if (rank <= 10_000) return '1-10k'
  if (rank <= 50_000) return '10k-50k'
  if (rank <= 100_000) return '50k-100k'
  if (rank <= 500_000) return '100k-500k'
  return '500k-1M'
}

/** A domain's anonymous id: keyed, so that the published frame cannot be hashed to find it. */
export function siteId(domain: string, secret: string): string {
  return createHmac('sha256', secret).update(domain).digest('hex').slice(0, 16)
}

export interface SiteInput extends AggregateResult {
  readonly domain: string
  readonly rank: number
}

/**
 * The sites' rows: the reached sites only, a country or platform that is too small to publish
 * folded into `other`, in the order of their ids (not the frame's, which is by rank).
 */
export function siteRows(
  results: readonly SiteInput[],
  aggregates: Pick<Aggregates, 'edition' | 'minCell' | 'platforms' | 'countries'>,
  secret: string,
): SiteRow[] {
  if (secret.length < 32)
    throw new Error('The secret that hashes domains has at least 32 characters')
  const named = new Set(aggregates.platforms.map((p) => p.id))
  const bigCountries = new Set(
    aggregates.countries.filter((c) => c.n >= aggregates.minCell).map((c) => c.code),
  )
  const rows: SiteRow[] = []
  for (const result of results) {
    const outcome: Outcome | null = result.outcome
    if (result.state !== 'done' || outcome?.reached !== true) continue
    const row: Record<string, string | number | boolean | null> = {
      site_id: siteId(result.domain, secret),
      edition: aggregates.edition,
      country: bigCountries.has(result.country) ? result.country : 'other',
      rank_bucket: rankBucket(result.rank),
      platform: platformKey(outcome, named),
      script: outcome.script,
      lang: outcome.lang,
      dir: outcome.dir,
      engines: outcome.engines.join('+') || 'none',
      score: outcome.score,
    }
    for (const metric of SITE_METRICS) {
      const index = metric.classify(outcome)
      const binary = metric.categories.length === 2 && metric.categories[0] === 'yes'
      row[metricColumn(metric.id)] =
        index === null ? null : binary ? index === 0 : (metric.categories[index] ?? null)
    }
    row.rules = JSON.stringify(
      Object.fromEntries(Object.entries(outcome.rules).sort(([a], [b]) => (a < b ? -1 : 1))),
    )
    rows.push(row as SiteRow)
  }
  return rows.sort((a, b) => (a.site_id < b.site_id ? -1 : a.site_id > b.site_id ? 1 : 0))
}

export function sitesParquet(rows: readonly SiteRow[]): ArrayBuffer {
  return parquetWriteBuffer({
    columnData: SITE_COLUMNS.map((column) => ({
      name: column.name,
      type: column.type,
      nullable: column.nullable,
      data: rows.map((row) => row[column.name] ?? null),
    })),
    kvMetadata: [{ key: 'arablyzer.table', value: 'sites' }],
  })
}

// The aggregates, long: one row for each cell, metric and category.

export const AGGREGATE_COLUMNS: readonly Column[] = [
  {
    name: 'scope',
    type: 'STRING',
    nullable: false,
    description: 'all, country, platform or country_platform.',
  },
  {
    name: 'country',
    type: 'STRING',
    nullable: true,
    description: 'The country code, for the scopes that have one.',
  },
  {
    name: 'platform',
    type: 'STRING',
    nullable: true,
    description: 'The platform id (`none` and `other` too), for the scopes that have one.',
  },
  { name: 'metric', type: 'STRING', nullable: false, description: 'The metric id.' },
  {
    name: 'category',
    type: 'STRING',
    nullable: false,
    description: 'The metric’s category: yes or no for a binary metric.',
  },
  { name: 'sites', type: 'INT32', nullable: false, description: 'Sites in the category.' },
  {
    name: 'judged',
    type: 'INT32',
    nullable: false,
    description: 'Sites judged for the metric in the cell: the denominator.',
  },
  {
    name: 'share',
    type: 'DOUBLE',
    nullable: false,
    description:
      "The category's share of the sites judged. In the scope `all` it is weighted by the size of each country's list; elsewhere it is `sites` over `judged`.",
  },
  {
    name: 'lo',
    type: 'DOUBLE',
    nullable: true,
    description:
      'The lower end of the 95% interval of the share of `yes`; null for the other categories and for a distribution.',
  },
  { name: 'hi', type: 'DOUBLE', nullable: true, description: 'The upper end of that interval.' },
]

export interface AggregateRow {
  readonly scope: 'all' | 'country' | 'platform' | 'country_platform'
  readonly country: string | null
  readonly platform: string | null
  readonly metric: string
  readonly category: string
  readonly sites: number
  readonly judged: number
  readonly share: number
  readonly lo: number | null
  readonly hi: number | null
}

/** Every published cell as rows, the smallest-cell rule applied to each metric's own denominator. */
export function aggregateRows(aggregates: Aggregates): AggregateRow[] {
  const rows: AggregateRow[] = []
  const countryCodes = aggregates.countries.map((c) => c.code)
  const platformIds = [...aggregates.platforms.map((p) => p.id), 'other', 'none']
  const targets: {
    key: string
    scope: AggregateRow['scope']
    country: string | null
    platform: string | null
  }[] = [
    { key: cellKey(null, null), scope: 'all', country: null, platform: null },
    ...countryCodes.map((code) => ({
      key: cellKey(code, null),
      scope: 'country' as const,
      country: code,
      platform: null,
    })),
    ...platformIds.map((id) => ({
      key: cellKey(null, id),
      scope: 'platform' as const,
      country: null,
      platform: id,
    })),
    ...countryCodes.flatMap((code) =>
      platformIds.map((id) => ({
        key: cellKey(code, id),
        scope: 'country_platform' as const,
        country: code,
        platform: id,
      })),
    ),
  ]
  for (const target of targets) {
    const cell = aggregates.cells[target.key]
    if (cell === undefined) continue
    for (const metric of aggregates.metrics) {
      const counts = cell.m[metric.id]
      const judged = counts?.reduce((sum, c) => sum + c, 0) ?? 0
      if (counts === undefined || judged < aggregates.minCell) continue
      const whole = target.scope === 'all' ? aggregates.overall[metric.id] : null
      const binary = metric.categories.length === 2 && metric.categories[0] === 'yes'
      const interval =
        binary && whole?.yes != null ? whole.yes : binary ? wilson(counts[0] ?? 0, judged) : null
      metric.categories.forEach((category, index) => {
        rows.push({
          scope: target.scope,
          country: target.country,
          platform: target.platform,
          metric: metric.id,
          category,
          sites: counts[index] ?? 0,
          judged,
          share: round6(whole?.shares[index] ?? (counts[index] ?? 0) / judged),
          lo: index === 0 && interval !== null ? round6(interval.lo) : null,
          hi: index === 0 && interval !== null ? round6(interval.hi) : null,
        })
      })
    }
  }
  return rows
}

export function aggregatesParquet(rows: readonly AggregateRow[]): ArrayBuffer {
  return parquetWriteBuffer({
    columnData: AGGREGATE_COLUMNS.map((column) => ({
      name: column.name,
      type: column.type,
      nullable: column.nullable,
      data: rows.map(
        (row) => (row as unknown as Record<string, string | number | null>)[column.name] ?? null,
      ),
    })),
    kvMetadata: [{ key: 'arablyzer.table', value: 'aggregates' }],
  })
}

/** RFC 4180: a field with a comma, a quote or a line break is quoted, quotes doubled. */
const field = (value: string | number | boolean | null): string => {
  if (value === null) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function aggregatesCsv(rows: readonly AggregateRow[]): string {
  const names = AGGREGATE_COLUMNS.map((column) => column.name)
  const lines = rows.map((row) =>
    names
      .map((name) =>
        field((row as unknown as Record<string, string | number | null>)[name] ?? null),
      )
      .join(','),
  )
  return `${names.join(',')}\n${lines.join('\n')}\n`
}

// The JSON Schema (draft 2020-12) of both tables.

const JSON_TYPE: Record<ColumnType, string> = {
  STRING: 'string',
  BOOLEAN: 'boolean',
  INT32: 'integer',
  DOUBLE: 'number',
}

function tableSchema(title: string, columns: readonly Column[]): Record<string, unknown> {
  return {
    type: 'object',
    title,
    additionalProperties: false,
    required: columns.filter((c) => !c.nullable).map((c) => c.name),
    properties: Object.fromEntries(
      columns.map((c) => [
        c.name,
        {
          type: c.nullable ? [JSON_TYPE[c.type], 'null'] : JSON_TYPE[c.type],
          description: c.description,
        },
      ]),
    ),
  }
}

export function datasetSchema(): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'State of the Arabic Web: tables',
    description:
      'The rows of sites.parquet (one anonymised homepage each) and of aggregates.parquet / aggregates.csv (one category of a metric in one cell). Licence CC BY 4.0.',
    $defs: {
      sites: tableSchema('A site', SITE_COLUMNS),
      aggregates: tableSchema('An aggregate', AGGREGATE_COLUMNS),
    },
  }
}

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6
