import { serve } from '@hono/node-server'
import {
  authDatabase,
  authSchema,
  BullMQScanQueue,
  POSTGRES_PROTOCOLS,
  PostgresAccountData,
  PostgresCrawlData,
  PostgresAuthMaintenance,
  PostgresMonitorData,
  PostgresScanStore,
  productionUrl,
  quietly,
  VALKEY_PROTOCOLS,
  ValkeyHandoff,
  ValkeyInFlight,
  ValkeyRateLimiter,
  ValkeyScanEvents,
} from '@arablyzer/store'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { Redis } from 'ioredis'
import pg from 'pg'
import { createApp } from './app'
import { apiDeps } from './config'
import { startAuthMaintenance } from './maintenance'

// The API as Compose and staging run it (M2.1 plan §4): PostgreSQL for scans and reports,
// Valkey for the queue, the events and the limits. It connects to PostgreSQL as a role that can
// read, write and delete the scans and change nothing else, so it does not bring the tables up to date: the
// database's own step does, before it starts (packages/store/src/migrate.ts, infra/compose.yaml).
// Production's checks hold whatever NODE_ENV says; dev.ts is the one for development.
const env: Readonly<Record<string, string | undefined>> = { ...process.env, NODE_ENV: 'production' }
const log = (text: string) => {
  console.error(text)
}

// The URLs are read before a client sees them, so that one it cannot read is told by its name,
// never by its text, whose password ioredis and pg would print; and their passwords are 32
// characters or more (packages/store).
const redisUrl = productionUrl('VALKEY_URL', env.VALKEY_URL, VALKEY_PROTOCOLS)
const databaseUrl = productionUrl('DATABASE_URL', env.DATABASE_URL, POSTGRES_PROTOCOLS)

// A request is answered, 503 when it must be, rather than waiting for Valkey to come back: no
// command waits for a connection, and none waits more than five seconds for its answer.
const redis = new Redis(redisUrl, {
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
  connectionString: databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5_000,
})
// PostgreSQL closing an idle connection, as a restart does, is told and the pool reconnects;
// without a listener, it would end the process.
pool.on('error', quietly('PostgreSQL', log))
const store = new PostgresScanStore(pool)
const queue = new BullMQScanQueue(redis)
const stopping = new AbortController()
const deps = apiDeps(
  env,
  {
    store,
    queue,
    events: new ValkeyScanEvents(redis),
    limiter: new ValkeyRateLimiter(redis),
    inFlight: new ValkeyInFlight(redis),
    handoff: new ValkeyHandoff(redis),
    auth: {
      database: drizzleAdapter(authDatabase(pool), {
        provider: 'pg',
        schema: authSchema,
        usePlural: true,
      }),
    },
    accountData: new PostgresAccountData(pool),
    monitorData: new PostgresMonitorData(pool),
    crawlData: new PostgresCrawlData(pool),
  },
  log,
)
// Expired sessions and sign-in states are swept hourly, where accounts are on.
const sweeping =
  deps.accounts === undefined ? null : startAuthMaintenance(new PostgresAuthMaintenance(pool), log)
const app = createApp({ ...deps, shutdown: stopping.signal, log })
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
    sweeping?.stop()
    server.close(() => {
      void Promise.all([queue.close(), pool.end()]).finally(() => {
        redis.disconnect()
      })
    })
  })
}
