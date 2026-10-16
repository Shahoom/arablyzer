import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { randomBytes } from 'node:crypto'
import { safeFetch, serverPolicy } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import { remoteCrawler } from '@arablyzer/scanner-client'
import {
  BullMQScanQueue,
  POSTGRES_PROTOCOLS,
  PostgresScanStore,
  productionUrl,
  quietly,
  requireSecret,
  VALKEY_PROTOCOLS,
} from '@arablyzer/store'
import { Redis } from 'ioredis'
import pg from 'pg'
import { runnerConfigFrom } from './config'
import { buildEdition } from './edition'
import { buildFrame, frameCsv, parseOptOut, parseTranco } from './frame'
import { FRAMES_DIR, frameIds, loadFrame, metaOf, OPT_OUT_FILE } from './frame-files'
import { PostgresSotawStore } from './pg-store'
import { byHash } from './rng'
import { createRunner } from './runner'

// The command line of the crawl of the Arabic web (docs/design/plans/m9-state-of-arabic-web.md):
//
//   pnpm sotaw:frame --list-id Y83YG            build and write the sample frame (needs no database)
//   pnpm sotaw:crawl [--edition 2026]           crawl it, politely, and go on where it stopped
//   pnpm sotaw status [--edition 2026]          how far the crawl is
//   pnpm sotaw export --out DIR [--edition ..]  the dataset's files, from what the crawl kept
//
// `crawl`, `status` and `export` read DATABASE_URL (the application role's), and `crawl` also
// VALKEY_URL and ARABLYZER_SCANNER_URL / ARABLYZER_SCANNER_TOKEN: they run inside the stack's
// network (infra/compose.yaml, profile `sotaw`).

const env = process.env
const log = (line: string) => {
  console.error(`${new Date().toISOString().slice(0, 19)}Z ${line}`)
}

const USAGE = `usage: sotaw <frame|crawl|status|export> [options]
  frame  --list-id ID [--cap 10000] [--floor 300] [--seed TEXT] [--file list.csv]
  crawl  [--edition 2026] [--frame ID]
  status [--edition 2026]
  export --out DIR [--edition 2026] [--frame ID]`

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'list-id': { type: 'string' },
    cap: { type: 'string' },
    floor: { type: 'string' },
    seed: { type: 'string' },
    file: { type: 'string' },
    edition: { type: 'string' },
    frame: { type: 'string' },
    out: { type: 'string' },
  },
})
const command = positionals[0]
const edition = values.edition ?? String(new Date().getUTCFullYear())
if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(edition))
  fail('The edition is lower case letters, digits and -')
const runId = `sotaw-${edition}`

const readOptOut = (): ReadonlySet<string> => {
  try {
    return parseOptOut(readFileSync(OPT_OUT_FILE, 'utf8'))
  } catch {
    return new Set()
  }
}

const integer = (name: string, value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) fail(`--${name} is a whole number from 1`)
  return number
}

async function frameCommand(): Promise<void> {
  const listId = values['list-id']
  if (listId === undefined || !/^[A-Z0-9]{4,8}$/.test(listId)) fail('--list-id is a Tranco list id')
  const cap = integer('cap', values.cap, 10_000)
  const floor = integer('floor', values.floor, 300)
  const seed = values.seed ?? `arablyzer-sotaw-${listId}`
  let text: string
  let createdOn: string | null = null
  if (values.file !== undefined) {
    text = readFileSync(resolve(values.file), 'utf8')
  } else {
    const policy = serverPolicy(env)
    const download = await safeFetch(`https://tranco-list.eu/download/${listId}/1000000`, {
      userAgent: USER_AGENT,
      accept: 'text/csv,text/plain;q=0.9',
      policy,
      timeoutMs: 120_000,
      maxBytes: 128 * 1024 * 1024,
    })
    if (download.response?.status !== 200) {
      fail(
        `Tranco did not give the list: ${download.error?.code ?? String(download.response?.status)}`,
      )
    }
    text = new TextDecoder().decode(download.response.body)
    const about = await safeFetch(`https://tranco-list.eu/api/lists/id/${listId}`, {
      userAgent: USER_AGENT,
      accept: 'application/json',
      policy,
      timeoutMs: 30_000,
      maxBytes: 64 * 1024,
    })
    if (about.response?.status === 200) {
      try {
        const made = (
          JSON.parse(new TextDecoder().decode(about.response.body)) as { created_on?: unknown }
        ).created_on
        createdOn = typeof made === 'string' ? made.slice(0, 10) : null
      } catch {
        createdOn = null
      }
    }
  }
  const { entries, invalid } = parseTranco(text)
  if (entries.length < 100_000 || invalid > entries.length / 100) {
    fail(
      `This is not a Tranco list: ${String(entries.length)} sites, ${String(invalid)} lines that are none`,
    )
  }
  const frame = buildFrame(entries, { cap, floor, seed, optOut: readOptOut() })
  const csv = frameCsv(frame.rows)
  const meta = metaOf(frame, { listId, listCreatedOn: createdOn, seed, cap, floor }, csv)
  mkdirSync(FRAMES_DIR, { recursive: true })
  writeFileSync(join(FRAMES_DIR, `${listId}.csv`), csv)
  writeFileSync(join(FRAMES_DIR, `${listId}.json`), `${JSON.stringify(meta, null, 2)}\n`)
  log(
    `frame ${listId}: ${String(frame.rows.length)} sites of ${String(Object.values(frame.populations).reduce((a, b) => a + b, 0))} on Arab domains in ${String(entries.length)}`,
  )
}

function chosenFrame(): {
  rows: ReturnType<typeof loadFrame>['rows']
  meta: ReturnType<typeof loadFrame>['meta']
} {
  const id = values.frame ?? frameIds().at(-1)
  if (id === undefined)
    fail('There is no frame in packages/sotaw/data/frames: pnpm sotaw:frame first')
  return loadFrame(id)
}

function connect() {
  const pool = new pg.Pool({
    connectionString: productionUrl('DATABASE_URL', env.DATABASE_URL, POSTGRES_PROTOCOLS),
    max: 3,
    connectionTimeoutMillis: 10_000,
  })
  pool.on('error', quietly('PostgreSQL', log))
  return pool
}

async function crawlCommand(): Promise<void> {
  const { rows, meta } = chosenFrame()
  const config = runnerConfigFrom(env, { seed: meta.seed, optOut: readOptOut() })
  const pool = connect()
  const redis = new Redis(productionUrl('VALKEY_URL', env.VALKEY_URL, VALKEY_PROTOCOLS), {
    maxRetriesPerRequest: null,
  })
  redis.on('error', quietly('Valkey', log))
  const queue = new BullMQScanQueue(redis)
  const store = new PostgresSotawStore(pool)
  const scanner = env.ARABLYZER_SCANNER_URL?.trim()
  if (scanner === undefined || scanner === '') fail('ARABLYZER_SCANNER_URL must be set')
  const controller = new AbortController()
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      log(`${signal}: stopping after the scan in hand; run the same command to go on`)
      controller.abort()
    })
  }
  try {
    if (!(await store.lock())) fail('Another crawl holds the lock: one at a time')
    const order = [...rows].sort(byHash(`${meta.seed}:order`, (row) => row.domain))
    await store.start(
      { id: runId, frameId: meta.listId, frameSha: meta.sha256, seed: meta.seed },
      order.map((row, position) => ({ ...row, position })),
      new Date(),
    )
    log(
      `crawl ${runId}: ${String(rows.length)} sites, ${config.engines.join('+')}, a scan at most every ${String(config.intervalMs / 1000)} s, ${String(config.concurrency)} at a time`,
    )
    const runner = createRunner(
      runId,
      {
        store,
        scans: new PostgresScanStore(pool),
        queue,
        crawler: remoteCrawler(
          scanner,
          requireSecret('ARABLYZER_SCANNER_TOKEN', env.ARABLYZER_SCANNER_TOKEN),
        ),
        load: () => (os.loadavg()[0] ?? 0) / os.availableParallelism(),
        now: () => Date.now(),
        sleep: (ms, signal) =>
          new Promise<void>((done) => {
            const timer = setTimeout(done, ms)
            signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer)
                done()
              },
              { once: true },
            )
          }),
        newId: () => randomBytes(16).toString('base64url'),
        log,
      },
      config,
    )
    const summary = await runner.run(controller.signal)
    if (summary.stopped === 'finished') await store.finish(runId, 'finished', new Date())
    log(`${summary.stopped}: ${JSON.stringify(summary.counts)}`)
  } finally {
    await store.unlock()
    await queue.close()
    redis.disconnect()
    await pool.end()
  }
}

async function statusCommand(): Promise<void> {
  const pool = connect()
  try {
    const store = new PostgresSotawStore(pool)
    const run = await store.run(runId)
    if (run === null) fail(`There is no run ${runId}`)
    console.log(
      `${runId} (${run.state}), frame ${run.frameId}: ${JSON.stringify(await store.counts(runId))}`,
    )
  } finally {
    await pool.end()
  }
}

async function exportCommand(): Promise<void> {
  const out = values.out
  if (out === undefined) fail('--out names the directory to write to')
  const secret = requireSecret('ARABLYZER_SOTAW_SALT', env.ARABLYZER_SOTAW_SALT)
  const { meta } = chosenFrame()
  const pool = connect()
  try {
    const store = new PostgresSotawStore(pool)
    const run = await store.run(runId)
    if (run === null) fail(`There is no run ${runId}`)
    if (run.frameSha !== meta.sha256) fail('The run was made from another frame: pass --frame')
    const rows = await store.results(runId)
    const { aggregates, files } = buildEdition({
      edition,
      frame: meta,
      crawl: { startedAt: run.createdAt, finishedAt: run.finishedAt },
      rows,
      secret,
    })
    const dir = resolve(out, edition)
    mkdirSync(dir, { recursive: true })
    for (const file of files) writeFileSync(join(dir, file.name), file.bytes)
    log(
      `${dir}: ${files.map((f) => f.name).join(', ')} (${String(aggregates.funnel.reached)} sites reached of ${String(aggregates.funnel.frame)}${aggregates.crawl.complete ? '' : ', the crawl is not complete'})`,
    )
  } finally {
    await pool.end()
  }
}

switch (command) {
  case 'frame':
    await frameCommand()
    break
  case 'crawl':
    await crawlCommand()
    break
  case 'status':
    await statusCommand()
    break
  case 'export':
    await exportCommand()
    break
  default:
    fail(USAGE)
}
