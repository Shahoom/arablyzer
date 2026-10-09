import { checkDenyCidrs, defaultResolver, serverPolicy } from '@arablyzer/egress'
import { accountsModeFrom, limitsFrom, planCatalogFrom } from '@arablyzer/plans'
import { remoteCrawler } from '@arablyzer/scanner-client'
import {
  BullMQScanQueue,
  POSTGRES_PROTOCOLS,
  PostgresAccountData,
  PostgresCrawlData,
  PostgresScanStore,
  productionUrl,
  quietly,
  requireSecret,
  VALKEY_PROTOCOLS,
  ValkeyInFlight,
  ValkeyRateLimiter,
  ValkeyScanEvents,
} from '@arablyzer/store'
import { Redis } from 'ioredis'
import pg from 'pg'
import { newScanId } from '../ids'
import { startLoop } from '../monitor/loop'
import { createCrawlRunner } from './runner'
import { crawlSettingsFrom } from './settings'

// The crawler as Compose runs it (M4.5): its own process on the API's image and the application
// role, like the monitor, because it creates scans and reads accounts, which the worker's role
// cannot. It reads pages through the scanner, which fetches under the egress rules; it holds no
// browser and parses no HTML. With accounts off it does nothing, and stays up doing it, so
// Compose does not restart it for ever.
const env: Readonly<Record<string, string | undefined>> = { ...process.env, NODE_ENV: 'production' }
const log = (text: string) => {
  console.error(text)
}
/** Crawls worked on at once by this process: each is a page at a time at its own pace. */
const WORKERS = 2
/** How soon a worker that found nothing looks again. */
const LOOK_MS = 5_000

if (accountsModeFrom(env) !== 'on') {
  console.log('Accounts are off (ARABLYZER_ACCOUNTS): nothing to crawl.')
  setInterval(() => undefined, 2 ** 30)
} else {
  const policy = serverPolicy(env)
  for (const warning of checkDenyCidrs(env.ARABLYZER_DENY_CIDRS).warnings) log(warning)
  const limits = limitsFrom(env)
  const plans = planCatalogFrom(env, limits)
  const settings = crawlSettingsFrom(env)
  const scannerUrl = env.ARABLYZER_SCANNER_URL?.trim() ?? ''
  if (scannerUrl === '') throw new Error('ARABLYZER_SCANNER_URL must be set')
  const scanner = remoteCrawler(
    scannerUrl,
    requireSecret('ARABLYZER_SCANNER_TOKEN', env.ARABLYZER_SCANNER_TOKEN),
  )
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
    max: WORKERS * 2 + 2,
    connectionTimeoutMillis: 5_000,
  })
  pool.on('error', quietly('PostgreSQL', log))
  const queue = new BullMQScanQueue(redis)
  const runner = createCrawlRunner({
    crawls: new PostgresCrawlData(pool),
    accounts: new PostgresAccountData(pool),
    store: new PostgresScanStore(pool),
    queue,
    events: new ValkeyScanEvents(redis),
    limiter: new ValkeyRateLimiter(redis),
    inFlight: new ValkeyInFlight(redis),
    limits,
    plans,
    policy,
    resolver: defaultResolver(policy),
    scanner,
    settings,
    newId: newScanId,
    log,
  })
  const loops = Array.from({ length: WORKERS }, () =>
    startLoop(runner, { log, intervalMs: LOOK_MS, name: 'Crawler' }),
  )
  console.log('Crawler ready')
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void Promise.all(loops.map((loop) => loop.stop())).finally(() => {
        void Promise.all([queue.close(), pool.end()]).finally(() => {
          redis.disconnect()
        })
      })
    })
  }
}
