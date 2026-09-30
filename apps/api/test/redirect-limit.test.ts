import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createPolicy, type Resolver } from '@arablyzer/egress'
import { serveSite, type FixtureSite } from '@arablyzer/fixtures'
import { DEVELOPMENT_LIMITS } from '@arablyzer/plans'
import { localScanner } from '@arablyzer/scanner'
import {
  hostLimitKey,
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { hostLimited, runScan } from '@arablyzer/worker'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'

// Security review, issue #30: the per-host limit counted the site a scan was asked for. A page
// that redirects to another site flooded it under the first one's name. The whole path, the API,
// the queue, the worker and the real engine, on two fixture sites, one redirecting to the other.

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>متجر</title></head><body><p>نص عربي</p></body></html>`
const HOSTS = { first: 'go.redirector.example', final: 'www.victim.example' }
const NOW = new Date('2026-09-28T12:00:00Z')

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

/** A site on its own port, served under a .example name, with these routes overridden. */
async function site(host: string, config?: object): Promise<FixtureSite> {
  const root = await mkdtemp(path.join(tmpdir(), 'arablyzer-redirect-'))
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, 'site.json'), JSON.stringify({ host }))
  await writeFile(path.join(root, 'index.html'), PAGE)
  if (config !== undefined) await writeFile(path.join(root, 'fixture.json'), JSON.stringify(config))
  const served = await serveSite(root)
  cleanup.push(async () => {
    await served.close()
    await rm(root, { recursive: true, force: true })
  })
  return served
}

async function setup(perHost: number) {
  const final = await site(HOSTS.final)
  const first = await site(HOSTS.first, {
    '/': { status: 301, headers: { location: final.url('/') } },
  })
  const policy = createPolicy({
    allowTargets: [first, final].map((one) => ({ address: '127.0.0.1', port: one.port })),
  })
  const resolver: Resolver = (host) =>
    Promise.resolve(
      Object.values(HOSTS).includes(host) ? [{ address: '127.0.0.1', family: 4 as const }] : [],
    )
  const store = new MemoryScanStore()
  const queue = new MemoryScanQueue()
  const events = new MemoryScanEvents(20)
  const limiter = new MemoryRateLimiter()
  const window = { scans: perHost, seconds: 3600 }
  const app = createApp({
    limits: { ...DEVELOPMENT_LIMITS, perHost: window },
    policy,
    resolver,
    turnstile: () => Promise.resolve(true),
    limiter,
    store,
    queue,
    events,
    inFlight: new MemoryInFlight(),
    address: () => '203.0.113.9',
    connectionKey: (address) => address,
    newId: () => 'AbCdEfGhIjKlMnOpQrSt_-',
    now: () => NOW,
  })
  const scanner = hostLimited(localScanner({ policy, resolver }), {
    limiter,
    window,
    now: () => NOW.getTime(),
  })
  /** Asks for the scan of the first site, and has the worker run it. */
  const scanFirst = async () => {
    const created = await app.request('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: first.url('/'), turnstileToken: 'human' }),
    })
    if (created.status === 202) {
      const job = await queue.take(AbortSignal.timeout(1000))
      if (job === null) throw new Error('No job was queued')
      await runScan(job, { store, events, scanner, now: () => NOW })
    }
    return created.status
  }
  return { first, final, limiter, window, store, events, scanFirst }
}

describe('a scan of a page that redirects to another site', () => {
  it('counts the site it ends at, and goes on while that site has scans left', async () => {
    const { final, limiter, window, store, scanFirst } = await setup(2)
    expect(await scanFirst()).toBe(202)
    const scan = await store.get('AbCdEfGhIjKlMnOpQrSt_-')
    expect(scan?.state).toBe('complete')
    expect(scan?.report?.target.finalUrl).toBe(final.url('/'))
    // The site asked for had one taken by the API, the site it ended at one by the worker.
    const left = async (host: string) => {
      let n = 0
      while ((await limiter.take(hostLimitKey(host), window, NOW.getTime())).ok) n++
      return n
    }
    expect(await left(HOSTS.first)).toBe(1)
    expect(await left(HOSTS.final)).toBe(1)
  })

  it('stops it at the site it ends at once that site has none left, and fails the scan', async () => {
    const { final, limiter, window, store, events, scanFirst } = await setup(1)
    // The victim's one scan is spent, by a direct scan of it, or by someone else's redirect.
    expect((await limiter.take(hostLimitKey(HOSTS.final), window, NOW.getTime())).ok).toBe(true)
    // The API knows only the site it is asked for, which has scans left.
    expect(await scanFirst()).toBe(202)
    const scan = await store.get('AbCdEfGhIjKlMnOpQrSt_-')
    expect(scan).toMatchObject({ state: 'failed', report: null })
    const told = (await events.since('AbCdEfGhIjKlMnOpQrSt_-', null)).map((stored) => stored.event)
    // The step that named the site the page was reached at, and then the scan's end.
    expect(told.find((event) => event.type === 'page')).toMatchObject({
      type: 'page',
      status: 200,
      host: HOSTS.final,
    })
    expect(told.at(-1)).toEqual({ type: 'error' })
    expect(told.map((event) => event.type)).not.toContain('done')
    // The site was asked for its robots.txt and its page, as any scan of it does first.
    expect(final.requests.slice(0, 2)).toEqual(['GET /robots.txt', 'GET /'])
  })
})
