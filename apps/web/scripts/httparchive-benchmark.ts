// The monthly "Arabic sites" benchmark: runs the two BigQuery queries in apps/web/queries with the
// `bq` command line (gcloud's, signed in to a project that can read the public datasets) and writes
// src/data/httparchive-benchmark.json for the report to read. Usage, after each month's HTTP Archive
// crawl and CrUX release:
//   pnpm benchmark:httparchive -- --crawl 2026-09-01 --month 202609
// Add --dry-run to check the queries without reading data. Review the diff of the JSON before
// committing it: the numbers are the HTTP Archive's and Google's, never ours.
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs, promisify } from 'node:util'
import { buildBenchmark } from '../src/lib/benchmark'

const run = promisify(execFile)
const QUERIES = new URL('../queries/', import.meta.url)
const OUT = new URL('../src/data/httparchive-benchmark.json', import.meta.url)

const { values } = parseArgs({
  options: {
    crawl: { type: 'string' },
    month: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
})
const { crawl, month } = values
if (
  crawl === undefined ||
  !/^\d{4}-\d{2}-01$/.test(crawl) ||
  month === undefined ||
  !/^\d{6}$/.test(month)
) {
  throw new Error('Usage: --crawl YYYY-MM-01 --month YYYYMM [--dry-run]')
}

async function query(file: string, parameter: string): Promise<unknown> {
  const sql = await readFile(new URL(file, QUERIES), 'utf8')
  const args = ['query', '--use_legacy_sql=false', '--format=json', `--parameter=${parameter}`]
  if (values['dry-run']) args.push('--dry_run')
  const { stdout } = await run('bq', [...args, sql], { maxBuffer: 16 * 1024 * 1024 })
  if (values['dry-run']) {
    console.log(`${file}: ${stdout.trim()}`)
    return null
  }
  const rows = JSON.parse(stdout) as unknown[]
  if (rows.length !== 1) throw new Error(`${file}: expected one row, got ${rows.length}`)
  return rows[0]
}

const pages = await query('httparchive-pages.sql', `crawl:DATE:${crawl}`)
const crux = await query('crux-arab.sql', `month:INT64:${month}`)
if (!values['dry-run']) {
  const benchmark = buildBenchmark(pages, crux, {
    generatedAt: new Date().toISOString().slice(0, 10),
    crawl,
    cruxMonth: month,
  })
  if (benchmark === null) throw new Error('The queries did not return what the benchmark needs')
  await writeFile(OUT, `${JSON.stringify(benchmark, null, 2)}\n`)
  console.log(`Wrote ${OUT.pathname}: ${benchmark.pages} pages, ${benchmark.origins} origins`)
}
