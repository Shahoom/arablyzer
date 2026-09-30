import { serve } from '@hono/node-server'
import {
  BullMQScanQueue,
  PostgresScanStore,
  quietly,
  ValkeyRateLimiter,
  ValkeyScanEvents,
} from '@arablyzer/store'
import { Redis } from 'ioredis'
import pg from 'pg'
import { createApp } from './app'
import { apiDeps } from './config'

// The API as Compose and staging run it (M2.1 plan §4): PostgreSQL for scans and reports,
// Valkey for the queue, the events and the limits. It brings the tables up to date first.
// Production's checks hold whatever NODE_ENV says; dev.ts is the one for development.
const env: Readonly<Record<string, string | undefined>> = { ...process.env, NODE_ENV: 'production' }
const required = (name: string): string => {
  const value = env[name]?.trim()
  if (value === undefined || value === '') throw new Error(`${name} must be set`)
  return value
}
const log = (text: string) => {
  console.error(text)
}

// A request is answered, 503 when it must be, rather than waiting for Valkey to come back: no
// command waits for a connection, and none waits more than five seconds for its answer.
const redis = new Redis(required('VALKEY_URL'), {
  enableOfflineQueue: false,
  commandTimeout: 5_000,
  maxRetriesPerRequest: 1,
})
redis.on('error', quietly('Valkey', log))
await new Promise<void>((resolve) => {
  if (redis.status === 'ready') resolve()
  else redis.once('ready', resolve)
})
const pool = new pg.Pool({
  connectionString: required('DATABASE_URL'),
  max: 10,
  connectionTimeoutMillis: 5_000,
})
// PostgreSQL closing an idle connection, as a restart does, is told and the pool reconnects;
// without a listener, it would end the process.
pool.on('error', quietly('PostgreSQL', log))
const store = new PostgresScanStore(pool)
await store.migrate()
const queue = new BullMQScanQueue(redis)
const stopping = new AbortController()
const app = createApp({
  ...apiDeps(
    env,
    {
      store,
      queue,
      events: new ValkeyScanEvents(redis),
      limiter: new ValkeyRateLimiter(redis),
    },
    log,
  ),
  shutdown: stopping.signal,
  log,
})
const server = serve(
  { fetch: app.fetch, port: Number(env.PORT ?? 8787), hostname: '0.0.0.0' },
  (info) => {
    console.log(`API on port ${info.port}`)
  },
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    // Open event streams end now; their pages reconnect to another process, or retry.
    stopping.abort()
    server.close(() => {
      void Promise.all([queue.close(), pool.end()]).finally(() => {
        redis.disconnect()
      })
    })
  })
}
