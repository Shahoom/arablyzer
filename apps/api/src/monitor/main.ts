import { checkDenyCidrs, defaultResolver, serverPolicy } from '@arablyzer/egress'
import { accountsModeFrom, limitsFrom, planCatalogFrom } from '@arablyzer/plans'
import {
  BullMQScanQueue,
  POSTGRES_PROTOCOLS,
  PostgresMonitorData,
  PostgresScanStore,
  productionUrl,
  quietly,
  VALKEY_PROTOCOLS,
  ValkeyInFlight,
  ValkeyRateLimiter,
  ValkeyScanEvents,
} from '@arablyzer/store'
import { Redis } from 'ioredis'
import pg from 'pg'
import { newScanId } from '../ids'
import { startLoop } from './loop'
import { mailerFrom } from './mail'
import { createScheduler } from './scheduler'
import { webhookSender } from './webhook'

// The monitoring scheduler as Compose runs it (M4.3): its own process, on the API's image and the
// application role, because it must create scans and read accounts, which the worker's role cannot.
// With accounts off it does nothing, and stays up doing it, so Compose does not restart it for ever.
const env: Readonly<Record<string, string | undefined>> = { ...process.env, NODE_ENV: 'production' }
const log = (text: string) => {
  console.error(text)
}

if (accountsModeFrom(env) !== 'on') {
  console.log('Accounts are off (ARABLYZER_ACCOUNTS): nothing to monitor.')
  setInterval(() => undefined, 2 ** 30)
} else {
  const policy = serverPolicy(env)
  for (const warning of checkDenyCidrs(env.ARABLYZER_DENY_CIDRS).warnings) log(warning)
  const limits = limitsFrom(env)
  const plans = planCatalogFrom(env, limits)
  const site = env.ARABLYZER_SITE?.trim() ?? ''
  if (site === '') throw new Error('ARABLYZER_SITE must be set: alerts link to the reports on it')
  const redis = new Redis(productionUrl('VALKEY_URL', env.VALKEY_URL, VALKEY_PROTOCOLS), {
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
    connectionString: productionUrl('DATABASE_URL', env.DATABASE_URL, POSTGRES_PROTOCOLS),
    max: 4,
    connectionTimeoutMillis: 5_000,
  })
  pool.on('error', quietly('PostgreSQL', log))
  const queue = new BullMQScanQueue(redis)
  const scheduler = createScheduler({
    monitors: new PostgresMonitorData(pool),
    store: new PostgresScanStore(pool),
    queue,
    events: new ValkeyScanEvents(redis),
    limiter: new ValkeyRateLimiter(redis),
    inFlight: new ValkeyInFlight(redis),
    limits,
    plans,
    policy,
    resolver: defaultResolver(policy),
    sender: webhookSender({ policy, resolver: defaultResolver(policy) }),
    mail: mailerFrom(env),
    origin: new URL(site).origin,
    newId: newScanId,
    log,
  })
  const loop = startLoop(scheduler, { log })
  console.log('Monitor scheduler ready')
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void loop.stop().finally(() => {
        void Promise.all([queue.close(), pool.end()]).finally(() => {
          redis.disconnect()
        })
      })
    })
  }
}
