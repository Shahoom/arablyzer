import { serve } from '@hono/node-server'
import {
  BullMQScanQueue,
  PostgresScanStore,
  ValkeyRateLimiter,
  ValkeyScanEvents,
} from '@arablyzer/store'
import { Redis } from 'ioredis'
import pg from 'pg'
import { createApp } from './app'
import { apiDeps } from './config'

// The API as Compose and staging run it (M2.1 plan §4): PostgreSQL for scans and reports,
// Valkey for the queue, the events and the limits. It brings the tables up to date first.
const env = process.env
const required = (name: string): string => {
  const value = env[name]?.trim()
  if (value === undefined || value === '') throw new Error(`${name} must be set`)
  return value
}

const redis = new Redis(required('VALKEY_URL'), { maxRetriesPerRequest: null })
const pool = new pg.Pool({ connectionString: required('DATABASE_URL'), max: 10 })
const store = new PostgresScanStore(pool)
await store.migrate()
const queue = new BullMQScanQueue(redis)
const app = createApp(
  apiDeps(env, {
    store,
    queue,
    events: new ValkeyScanEvents(redis),
    limiter: new ValkeyRateLimiter(redis),
  }),
)
const server = serve(
  { fetch: app.fetch, port: Number(env.PORT ?? 8787), hostname: '0.0.0.0' },
  (info) => {
    console.log(`API on port ${info.port}`)
  },
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void Promise.all([queue.close(), pool.end()]).finally(() => {
        redis.disconnect()
      })
    })
  })
}
