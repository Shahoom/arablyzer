import { hostLimitFrom } from '@arablyzer/plans'
import { remoteScanner, SCAN_BUDGET_MS } from '@arablyzer/scanner-client'
import {
  PostgresScanStore,
  quietly,
  SCAN_QUEUE,
  SCAN_WORKER,
  ValkeyRateLimiter,
  ValkeyScanEvents,
  type ScanJob,
} from '@arablyzer/store'
import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import pg from 'pg'
import { hostLimited } from './hosts'
import { startRetention } from './retention'
import { failScan, runScan, scanJobOf } from './run'

// The worker as Compose and staging run it (M2.1 plan §5b): it takes one job at a time, has the
// scanner container run it, and stores the report. It runs no browser: the scanner does, on a
// network that sees the egress proxy alone, and never the stores.
const env = process.env
const required = (name: string): string => {
  const value = env[name]?.trim()
  if (value === undefined || value === '') throw new Error(`${name} must be set`)
  return value
}

/** A scan fits in its budget, with its fetch before and its rules after; five on, its worker died. */
const STALE_MS = 5 * SCAN_BUDGET_MS
/** How often the worker looks for scans left running. */
const SWEEP_MS = 60_000

const log = (text: string) => {
  console.error(text)
}
const redis = new Redis(required('VALKEY_URL'), { maxRetriesPerRequest: null })
redis.on('error', quietly('Valkey', log))
const pool = new pg.Pool({
  connectionString: required('DATABASE_URL'),
  max: 2,
  connectionTimeoutMillis: 5_000,
})
// PostgreSQL closing an idle connection, as a restart does, is told and the pool reconnects;
// without a listener, it would end the process.
pool.on('error', quietly('PostgreSQL', log))
const deps = {
  store: new PostgresScanStore(pool),
  events: new ValkeyScanEvents(redis),
  // The site a scan ends at, after its redirects, counts against the per-host limit as the site
  // it was asked for did in the API (security review, issue #30). Production's checks hold
  // whatever NODE_ENV says, as the API's do: the limit's numbers must be set.
  scanner: hostLimited(
    remoteScanner(required('ARABLYZER_SCANNER_URL'), required('ARABLYZER_SCANNER_TOKEN')),
    {
      limiter: new ValkeyRateLimiter(redis),
      window: hostLimitFrom({ ...env, NODE_ENV: 'production' }),
    },
  ),
  log,
}

const worker = new Worker<ScanJob>(
  SCAN_QUEUE,
  async (job) => {
    let scan: ScanJob
    try {
      scan = scanJobOf(job.data)
    } catch {
      throw new Error(`Job ${job.id ?? ''} is not a scan`)
    }
    await runScan(scan, deps)
  },
  { connection: redis, ...SCAN_WORKER },
)
worker.on('ready', () => {
  console.log('Worker ready')
})
worker.on('error', quietly('Worker', log))
// A job that failed outside runScan's own handling: its worker died mid-scan (BullMQ fails it
// when it is next taken), or the stores failed. Its scan is failed, and its page told.
worker.on('failed', (job) => {
  const id: unknown = job?.data.id
  if (typeof id !== 'string') return
  failScan(id, deps).catch((error: unknown) => {
    log(`Scan ${id} could not be failed: ${error instanceof Error ? error.message : String(error)}`)
  })
})

// Scans left running (by a worker that died, or stores that failed as a scan ended) are failed
// in the end, so no page waits for ever.
const sweep = () => {
  const at = new Date()
  deps.store
    .failStale(new Date(at.getTime() - STALE_MS), at)
    .then((ids) =>
      Promise.all(ids.map((id) => deps.events.publish(id, { type: 'error' }).catch(() => ''))),
    )
    .catch(quietly('Sweep', log))
}
sweep()
const sweeping = setInterval(sweep, SWEEP_MS)
// Reports older than the owner's number of days are deleted; unset, they are kept, and it says so.
const retention = startRetention(env, { store: deps.store, log })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    clearInterval(sweeping)
    retention.stop()
    // The scan running finishes first (Compose's stop_grace_period is longer than its budget);
    // the queue keeps the rest.
    void worker.close().finally(() => {
      void pool.end().finally(() => {
        redis.disconnect()
      })
    })
  })
}
