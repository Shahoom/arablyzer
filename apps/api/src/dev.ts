import { serve } from '@hono/node-server'
import { localScanner, scanOptionsFrom } from '@arablyzer/scanner'
import {
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { hostLimited, runScan } from '@arablyzer/worker'
import { createApp } from './app'
import { apiDeps } from './config'

// `pnpm --filter @arablyzer/api dev`: the API and one worker in this process, on the stores in
// memory, so the site's form scans locally with nothing else installed (M2.1 plan §4). With
// ARABLYZER_ALLOW_PRIVATE=1, it scans local pages too, such as the fixture sites.
const env: Readonly<Record<string, string | undefined>> = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
}
if (env.NODE_ENV === 'production') throw new Error('dev.ts runs in development only')

const store = new MemoryScanStore()
const queue = new MemoryScanQueue()
const events = new MemoryScanEvents()
const limiter = new MemoryRateLimiter()
const deps = apiDeps(env, { store, queue, events, limiter, inFlight: new MemoryInFlight() })
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

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stop.abort()
    server.close()
  })
}
