import { createHash } from 'node:crypto'
import { aggregate, type Aggregates, type AggregateResult } from './aggregate'
import {
  aggregateRows,
  aggregatesCsv,
  aggregatesParquet,
  datasetSchema,
  siteRows,
  sitesParquet,
  type SiteInput,
} from './dataset'
import type { FrameMeta } from './frame'
import type { ResultRow } from './store'

export interface EditionFile {
  readonly name: string
  readonly mediaType: string
  readonly description: string
  readonly bytes: Uint8Array
}

export interface Manifest {
  readonly v: 1
  readonly edition: string
  readonly license: 'CC-BY-4.0'
  readonly files: readonly {
    readonly name: string
    readonly mediaType: string
    readonly description: string
    readonly bytes: number
    readonly sha256: string
  }[]
}

const text = (value: string): Uint8Array => new TextEncoder().encode(value)

export interface EditionInput {
  readonly edition: string
  readonly frame: FrameMeta
  readonly crawl: { readonly startedAt: Date | null; readonly finishedAt: Date | null }
  readonly rows: readonly ResultRow[]
  /** The secret that keys the sites' ids. */
  readonly secret: string
}

/**
 * The files of an edition from a run's rows: the aggregates the page shows (JSON, CSV, Parquet),
 * the anonymised sites (Parquet), the JSON Schema of both tables, and a manifest with the size and
 * SHA-256 of each. The same rows give the same bytes.
 */
export function buildEdition(input: EditionInput): {
  aggregates: Aggregates
  files: EditionFile[]
  manifest: Manifest
} {
  const results: AggregateResult[] = input.rows.map((row) => ({
    country: row.country,
    state: row.state,
    reason: row.reason,
    outcome: row.outcome,
  }))
  const aggregates = aggregate({
    edition: input.edition,
    frame: input.frame,
    crawl: input.crawl,
    results,
  })
  const sites: SiteInput[] = input.rows.map((row) => ({
    domain: row.domain,
    rank: row.rank,
    country: row.country,
    state: row.state,
    reason: row.reason,
    outcome: row.outcome,
  }))
  const aggregateTable = aggregateRows(aggregates)
  const files: EditionFile[] = [
    {
      name: 'aggregates.json',
      mediaType: 'application/json',
      description: 'The numbers of the report: counts for each country, platform and metric.',
      bytes: text(JSON.stringify(aggregates)),
    },
    {
      name: 'aggregates.csv',
      mediaType: 'text/csv',
      description: 'The same aggregates, one row for each category of a metric in a cell.',
      bytes: text(aggregatesCsv(aggregateTable)),
    },
    {
      name: 'aggregates.parquet',
      mediaType: 'application/vnd.apache.parquet',
      description: 'The aggregates as Parquet.',
      bytes: new Uint8Array(aggregatesParquet(aggregateTable)),
    },
    {
      name: 'sites.parquet',
      mediaType: 'application/vnd.apache.parquet',
      description: 'One anonymised homepage per row: no domain, a keyed id, and the metrics.',
      bytes: new Uint8Array(sitesParquet(siteRows(sites, aggregates, input.secret))),
    },
    {
      name: 'schema.json',
      mediaType: 'application/schema+json',
      description: 'The JSON Schema of the sites’ and the aggregates’ tables.',
      bytes: text(`${JSON.stringify(datasetSchema(), null, 2)}\n`),
    },
  ]
  const manifest: Manifest = {
    v: 1,
    edition: input.edition,
    license: 'CC-BY-4.0',
    files: files.map((file) => ({
      name: file.name,
      mediaType: file.mediaType,
      description: file.description,
      bytes: file.bytes.byteLength,
      sha256: createHash('sha256').update(file.bytes).digest('hex'),
    })),
  }
  files.push({
    name: 'manifest.json',
    mediaType: 'application/json',
    description: 'The files of the edition, with their sizes and SHA-256.',
    bytes: text(`${JSON.stringify(manifest, null, 2)}\n`),
  })
  return { aggregates, files, manifest }
}
