import { parquetMetadata, parquetReadObjects } from 'hyparquet'
import { describe, expect, it } from 'vitest'
import { aggregate } from '../src/aggregate'
import {
  AGGREGATE_COLUMNS,
  aggregateRows,
  aggregatesCsv,
  aggregatesParquet,
  datasetSchema,
  metricColumn,
  rankBucket,
  siteId,
  siteRows,
  SITE_COLUMNS,
  sitesParquet,
  type SiteInput,
} from '../src/dataset'
import { buildEdition } from '../src/edition'
import type { FrameMeta } from '../src/frame'
import { METRICS } from '../src/metrics'
import type { ResultRow } from '../src/store'
import { outcome } from './fixtures'

const SECRET = 's'.repeat(40)
const frame: FrameMeta = {
  source: 'tranco',
  listId: 'TEST1',
  listCreatedOn: null,
  seed: 'seed',
  cap: 1000,
  floor: 10,
  total: 100,
  populations: { sa: 400, eg: 300, ye: 10 },
  sampled: { sa: 40, eg: 40, ye: 5 },
  optedOut: 0,
  sha256: 'b'.repeat(64),
}

function inputs(): SiteInput[] {
  const rows: SiteInput[] = []
  const add = (country: string, n: number, o: ReturnType<typeof outcome>) => {
    for (let i = 0; i < n; i++) {
      rows.push({
        domain: `site${String(rows.length)}.${country}`,
        rank: 1 + rows.length * 997,
        country,
        state: 'done',
        reason: null,
        outcome: o,
      })
    }
  }
  add(
    'sa',
    40,
    outcome(
      { 'ar-letter-spacing': 'f', 'jsonld-syntax-error': 'p' },
      { platform: 'salla', crux: { found: true, lcp: 3000, inp: 100, cls: 0.3 } },
    ),
  )
  add('eg', 35, outcome({ 'ar-letter-spacing': 'p' }))
  add('ye', 5, outcome({ 'ar-letter-spacing': 'p' }))
  rows.push({
    domain: 'blocked.sa',
    rank: 5,
    country: 'sa',
    state: 'skipped',
    reason: 'robots',
    outcome: null,
  })
  return rows
}
const aggregates = () =>
  aggregate({
    edition: 'test',
    frame,
    crawl: { startedAt: null, finishedAt: null },
    results: inputs(),
  })

describe('the sites table', () => {
  const rows = siteRows(inputs(), aggregates(), SECRET)

  it('has a row for each site reached, and none for one that was not', () => {
    expect(rows).toHaveLength(80)
  })

  it('names no domain: a keyed id, which the published frame cannot be hashed to', () => {
    expect(rows[0]?.site_id).toMatch(/^[0-9a-f]{16}$/)
    expect(siteId('site0.sa', SECRET)).toBe(siteId('site0.sa', SECRET))
    expect(siteId('site0.sa', SECRET)).not.toBe(siteId('site0.sa', 'x'.repeat(40)))
    const plain = siteId('site0.sa', SECRET)
    expect(rows.some((r) => r.site_id === plain)).toBe(true)
    expect(JSON.stringify(rows)).not.toMatch(/site\d+\.(sa|eg|ye)/)
    expect(() => siteRows(inputs(), aggregates(), 'short')).toThrow()
  })

  it('folds a country with too few sites into other, and gives a rank in a bucket', () => {
    expect(new Set(rows.map((r) => r.country))).toEqual(new Set(['sa', 'eg', 'other']))
    expect(rankBucket(1)).toBe('1-10k')
    expect(rankBucket(10_001)).toBe('10k-50k')
    expect(rankBucket(999_999)).toBe('500k-1M')
    expect(rows.every((r) => !('rank' in r))).toBe(true)
  })

  it('is in the order of the ids, not of the frame', () => {
    const ids = rows.map((r) => r.site_id)
    expect(ids).toEqual([...ids].sort())
  })

  it('has a column for each metric but the score, and a rule letter for each rule', () => {
    const first = rows.find((r) => r.platform === 'salla')
    expect(first?.[metricColumn('shaping')]).toBe(true)
    expect(first?.m_lcp).toBe('needs-improvement')
    expect(first?.m_cls).toBe('poor')
    expect(JSON.parse(first?.rules ?? '{}')).toEqual({
      'ar-letter-spacing': 'f',
      'jsonld-syntax-error': 'p',
    })
    expect(SITE_COLUMNS.map((c) => c.name)).toContain(metricColumn(METRICS[1]?.id ?? ''))
    expect(SITE_COLUMNS.map((c) => c.name)).not.toContain('m_score')
  })
})

describe('Parquet', () => {
  it('holds the sites as they were written, in the columns the schema names', async () => {
    const rows = siteRows(inputs(), aggregates(), SECRET)
    const file = sitesParquet(rows)
    const metadata = parquetMetadata(file)
    expect(metadata.num_rows).toBe(BigInt(rows.length))
    expect(metadata.schema.slice(1).map((e) => e.name)).toEqual(SITE_COLUMNS.map((c) => c.name))
    const back = await parquetReadObjects({ file })
    expect(back).toHaveLength(rows.length)
    expect(back[0]).toEqual(
      Object.fromEntries(SITE_COLUMNS.map((c) => [c.name, rows[0]?.[c.name] ?? null])),
    )
    expect(back.find((r) => r.platform === 'salla')?.m_shaping).toBe(true)
    expect(back.find((r) => r.country === 'eg')?.m_json_ld).toBeNull()
    // No domain is anywhere in the bytes.
    expect(Buffer.from(file).includes('site1.sa')).toBe(false)
  })

  it('holds the aggregates as rows, which the CSV repeats', async () => {
    const table = aggregateRows(aggregates())
    const file = aggregatesParquet(table)
    expect(
      parquetMetadata(file)
        .schema.slice(1)
        .map((e) => e.name),
    ).toEqual(AGGREGATE_COLUMNS.map((c) => c.name))
    const back = await parquetReadObjects({ file })
    expect(back).toHaveLength(table.length)
    expect(back[0]).toMatchObject({ scope: 'all', metric: table[0]?.metric, category: 'yes' })
    const csv = aggregatesCsv(table)
    expect(csv.split('\n')[0]).toBe(AGGREGATE_COLUMNS.map((c) => c.name).join(','))
    expect(csv.trimEnd().split('\n')).toHaveLength(table.length + 1)
  })

  it('leaves out a cell that is below the smallest, in the rows as in the page', () => {
    const table = aggregateRows(aggregates())
    expect(table.some((r) => r.country === 'ye')).toBe(false)
    expect(table.every((r) => r.judged >= 30)).toBe(true)
    const whole = table.find(
      (r) => r.scope === 'all' && r.metric === 'shaping' && r.category === 'yes',
    )
    expect(whole?.lo).toBeLessThan(whole?.share ?? 0)
    expect(
      table.find((r) => r.scope === 'all' && r.metric === 'shaping' && r.category === 'no')?.lo,
    ).toBeNull()
  })
})

describe('the schema', () => {
  it('is JSON Schema of both tables with the columns of the files', () => {
    const schema = datasetSchema() as {
      $schema: string
      $defs: Record<string, { properties: Record<string, { type: unknown }>; required: string[] }>
    }
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(Object.keys(schema.$defs.sites?.properties ?? {})).toEqual(
      SITE_COLUMNS.map((c) => c.name),
    )
    expect(schema.$defs.sites?.properties.score?.type).toEqual(['integer', 'null'])
    expect(schema.$defs.sites?.required).toContain('site_id')
    expect(schema.$defs.aggregates?.properties.share?.type).toBe('number')
  })
})

describe('an edition', () => {
  it('is the same bytes from the same rows, with a manifest that hashes them', () => {
    const rows: ResultRow[] = inputs().map((r, i) => ({
      runId: 'sotaw-test',
      domain: r.domain,
      country: r.country,
      rank: r.rank,
      position: i,
      state: r.state,
      reason: r.reason,
      attempts: 1,
      scanId: null,
      outcome: r.outcome,
    }))
    const a = buildEdition({
      edition: 'test',
      frame,
      crawl: { startedAt: null, finishedAt: null },
      rows,
      secret: SECRET,
    })
    const b = buildEdition({
      edition: 'test',
      frame,
      crawl: { startedAt: null, finishedAt: null },
      rows: [...rows].reverse(),
      secret: SECRET,
    })
    expect(a.files.map((f) => f.name)).toEqual([
      'aggregates.json',
      'aggregates.csv',
      'aggregates.parquet',
      'sites.parquet',
      'schema.json',
      'manifest.json',
    ])
    expect(a.manifest.files).toEqual(b.manifest.files)
    expect(a.manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && f.bytes > 0)).toBe(true)
    expect(a.manifest.license).toBe('CC-BY-4.0')
  })
})
