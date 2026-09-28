import { scan } from '@arablyzer/engine'
import { PostgresScanStore, SCAN_QUEUE, ValkeyScanEvents, type ScanJob } from '@arablyzer/store'
import { Worker } from 'bullmq'
import { Redis } from 'ioredis'
import pg from 'pg'
import { scanOptionsFrom } from './options'
import { runScan } from './run'

// The worker as Compose and staging run it (M2.1 plan §4): one scan at a time, one browser at
// a time (BUILD-PLAN §11), on a network whose only way out is the egress proxy.
const env = process.env
const required = (name: string): string => {
  const value = env[name]?.trim()
  if (value === undefined || value === '') throw new Error(`${name} must be set`)
  return value
}

const redis = new Redis(required('VALKEY_URL'), { maxRetriesPerRequest: null })
const pool = new pg.Pool({ connectionString: required('DATABASE_URL'), max: 2 })
const deps = {
  store: new PostgresScanStore(pool),
  events: new ValkeyScanEvents(redis),
  scanner: scan,
  options: scanOptionsFrom(env),
  log: console.error,
}

const worker = new Worker<ScanJob>(
  SCAN_QUEUE,
  async (job) => {
    const { id, url } = job.data
    if (typeof id !== 'string' || typeof url !== 'string')
      throw new Error(`Job ${job.id ?? ''} is not a scan`)
    await runScan({ id, url }, deps)
  },
  { connection: redis, concurrency: 1 },
)
worker.on('ready', () => {
  console.log('Worker ready')
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    // The scan running finishes first; the queue keeps the rest.
    void worker.close().finally(() => {
      void pool.end().finally(() => {
        redis.disconnect()
      })
    })
  })
}
