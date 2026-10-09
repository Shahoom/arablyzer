import { serve } from '@hono/node-server'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { localCrawlClient, localScanner, scanOptionsFrom } from '@arablyzer/scanner'
import {
  MemoryAccountData,
  MemoryCrawlData,
  MemoryHandoff,
  MemoryInFlight,
  MemoryMonitorData,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { hostLimited, runScan } from '@arablyzer/worker'
import { createApp } from './app'
import { apiDeps } from './config'
import { newScanId } from './ids'
import { createCrawlRunner } from './crawl/runner'
import { startLoop } from './monitor/loop'
import { noMailer } from './monitor/mail'
import { createScheduler } from './monitor/scheduler'

// `pnpm --filter @arablyzer/api dev`: the API and one worker in this process, on the stores in
// memory, so the site's form scans locally with nothing else installed (M2.1 plan §4). With
// ARABLYZER_ALLOW_PRIVATE=1, it scans local pages too, such as the fixture sites.
const env: Readonly<Record<string, string | undefined>> = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
}
if (env.NODE_ENV === 'production') throw new Error('dev.ts runs in development only')

const store = new MemoryScanStore()
const accountData = new MemoryAccountData(store)
const monitorData = new MemoryMonitorData(accountData, store)
const crawlData = new MemoryCrawlData()
accountData.onSiteRemoved.add((siteId) => {
  crawlData.dropSite(siteId)
})
const queue = new MemoryScanQueue()
const events = new MemoryScanEvents()
const limiter = new MemoryRateLimiter()
const deps = apiDeps(env, {
  store,
  queue,
  events,
  limiter,
  inFlight: new MemoryInFlight(),
  handoff: new MemoryHandoff(),
  // Accounts, when ARABLYZER_ACCOUNTS=on, live in memory here: gone when this process ends.
  auth: { database: memoryAdapter({ user: [], session: [], account: [], verification: [] }) },
  accountData,
  monitorData,
  crawlData,
})
const app = createApp(deps)
const port = Number(env.PORT ?? 8787)
const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`API on http://127.0.0.1:${info.port}, with a worker in this process`)
})

const stop = new AbortController()
// The site a scan ends at, after its redirects, counts against the per-host limit, as in Compose.
const scanner = hostLimited(localScanner(scanOptionsFrom(env)), {
  limiter,
  window: deps.limits.perHost,
})
void (async () => {
  while (!stop.signal.aborted) {
    const job = await queue.take(stop.signal)
    if (job === null) break
    await runScan(job, { store, events, scanner, log: console.error })
  }
})()

// With accounts on, monitoring runs here too: the same scheduler, on the memory stores.
const accounts = deps.accounts
if (accounts?.monitors !== undefined && accounts.sender !== undefined) {
  const loop = startLoop(
    createScheduler({
      monitors: accounts.monitors,
      store,
      queue,
      events,
      limiter,
      inFlight: deps.inFlight,
      limits: deps.limits,
      plans: accounts.plans,
      policy: deps.policy,
      resolver: deps.resolver,
      sender: accounts.sender,
      mail: accounts.mail ?? noMailer,
      origin: `http://127.0.0.1:${String(port)}`,
      newId: newScanId,
      log: console.error,
    }),
    { log: console.error },
  )
  stop.signal.addEventListener('abort', () => void loop.stop())
}

// And the crawler: the same runner, reading pages with the engine in this process.
if (accounts?.crawls !== undefined && accounts.crawlSettings !== undefined) {
  const loop = startLoop(
    createCrawlRunner({
      crawls: accounts.crawls,
      accounts: accounts.data,
      store,
      queue,
      events,
      limiter,
      inFlight: deps.inFlight,
      limits: deps.limits,
      plans: accounts.plans,
      policy: deps.policy,
      resolver: deps.resolver,
      scanner: localCrawlClient(scanOptionsFrom(env)),
      settings: accounts.crawlSettings,
      newId: newScanId,
      log: console.error,
    }),
    { log: console.error, intervalMs: 2_000, name: 'Crawler' },
  )
  stop.signal.addEventListener('abort', () => void loop.stop())
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stop.abort()
    server.close()
  })
}
