import type { Report } from '@arablyzer/report-schema'
import type { Scanner, ScannerEvent } from '@arablyzer/scanner-client'
import {
  hostLimitKey,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanStore,
  type RateLimiter,
} from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { hostLimited } from '../src/hosts'
import { runScan } from '../src/run'

// Security review, issue #30: the per-host limit counted the site a scan was asked for, so a page
// that redirects to another site flooded it under the first one's name, and under as many first
// names as a visitor liked. The worker counts the site the scan ends at, once it knows it, before
// the browsers render it.

const WINDOW = { scans: 2, seconds: 3600 }
const NOW = Date.parse('2026-09-28T12:00:00Z')
const REPORT = { scan: { status: 'complete' } } as unknown as Report
const ID = 'AbCdEfGhIjKlMnOpQrSt_-'

const page = (host?: string): ScannerEvent => ({
  type: 'page',
  status: 200,
  contentType: 'text/html',
  error: null,
  ...(host === undefined ? {} : { host }),
})

/**
 * A scanner whose page is reached at `host`, and whose render that follows takes a moment, unless
 * it is told to stop first: it says whether it was.
 */
function reaching(host: string | undefined) {
  const seen = { stopped: false, events: [] as ScannerEvent[] }
  const scanner: Scanner = (_request, onEvent, signal) => {
    const event = page(host)
    seen.events.push(event)
    onEvent(event)
    return new Promise<Report>((resolve, reject) => {
      const rendered = setTimeout(() => {
        resolve(REPORT)
      }, 30)
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(rendered)
          seen.stopped = true
          reject(signal.reason as Error)
        },
        { once: true },
      )
    })
  }
  return { scanner, seen }
}

/** What the limiter still lets through for a site: its bucket holds two, whoever took them. */
async function leftFor(limiter: RateLimiter, host: string): Promise<number> {
  let left = 0
  while ((await limiter.take(hostLimitKey(host), WINDOW, NOW)).ok) left++
  return left
}

const asked = (url: string) => ({ url })

describe('hostLimited', () => {
  it('counts nothing for a scan that ends at the site it was asked for, under another name', async () => {
    const limiter = new MemoryRateLimiter()
    const { scanner } = reaching('www.example.com')
    const limited = hostLimited(scanner, { limiter, window: WINDOW, now: () => NOW })
    expect(await limited(asked('https://shop.example.com/'), () => undefined)).toBe(REPORT)
    expect(await leftFor(limiter, 'example.com')).toBe(2)
  })

  it('counts the site a scan ends at, once, when it is another', async () => {
    const limiter = new MemoryRateLimiter()
    const { scanner } = reaching('www.victim.example')
    const limited = hostLimited(scanner, { limiter, window: WINDOW, now: () => NOW })
    expect(await limited(asked('https://redirector.example.net/'), () => undefined)).toBe(REPORT)
    expect(await leftFor(limiter, 'victim.example')).toBe(1)
    expect(await leftFor(limiter, 'redirector.example.net')).toBe(2)
  })

  it('stops a scan whose site has reached its limit, and gives its page nothing after', async () => {
    const limiter = new MemoryRateLimiter()
    // The site's scans are spent, by direct scans of it and by others' redirects.
    expect(await leftFor(limiter, 'victim.example')).toBe(2)
    const { scanner, seen } = reaching('www.victim.example')
    const limited = hostLimited(scanner, { limiter, window: WINDOW, now: () => NOW })
    const told: ScannerEvent[] = []
    await expect(
      limited(asked('https://redirector.example.net/'), (event) => told.push(event)),
    ).rejects.toThrow(/reached its limit/)
    expect(seen.stopped).toBe(true)
    // What the page had been told stays told: the step that led to it.
    expect(told).toEqual([page('www.victim.example')])
  })

  it('never counts a page it did not reach, nor a step that names no host', async () => {
    const limiter = new MemoryRateLimiter()
    const { scanner } = reaching(undefined)
    const limited = hostLimited(scanner, { limiter, window: WINDOW, now: () => NOW })
    expect(await limited(asked('https://example.com/'), () => undefined)).toBe(REPORT)
    const other: Scanner = (_request, onEvent) => {
      onEvent({ type: 'robots', outcome: 'fetched', status: 200 })
      onEvent({ type: 'rules', rules: 3 })
      return Promise.resolve(REPORT)
    }
    await hostLimited(other, { limiter, window: WINDOW, now: () => NOW })(
      asked('https://example.com/'),
      () => undefined,
    )
    expect(await leftFor(limiter, 'example.com')).toBe(2)
  })

  it('is refused by a scan that has ended before the limiter answered', async () => {
    const slow: RateLimiter = {
      take: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return { ok: false, retryAfterSeconds: 60 }
      },
    }
    const quick: Scanner = (_request, onEvent) => {
      onEvent(page('www.victim.example'))
      return Promise.resolve(REPORT)
    }
    await expect(
      hostLimited(quick, { limiter: slow, window: WINDOW })(
        asked('https://a.example.net/'),
        () => undefined,
      ),
    ).rejects.toThrow(/reached its limit/)
  })

  it('stops the scan when the limit cannot be checked, and says so without the site', async () => {
    const down: RateLimiter = { take: () => Promise.reject(new Error('Connection is closed.')) }
    const { scanner, seen } = reaching('www.victim.example')
    const failure = await hostLimited(scanner, { limiter: down, window: WINDOW })(
      asked('https://redirector.example.net/'),
      () => undefined,
    ).then(
      () => null,
      (error: unknown) => error as Error,
    )
    expect(failure?.message).toMatch(/could not be checked/)
    expect(failure?.message).not.toContain('victim')
    expect(seen.stopped).toBe(true)
  })

  it('keeps the signal it is given: a scan told to stop stops', async () => {
    const limiter = new MemoryRateLimiter()
    const { scanner, seen } = reaching('www.example.com')
    const stop = new AbortController()
    const running = hostLimited(scanner, { limiter, window: WINDOW, now: () => NOW })(
      asked('https://example.com/'),
      () => undefined,
      stop.signal,
    )
    stop.abort(new Error('the worker is stopping'))
    await expect(running).rejects.toThrow(/the worker is stopping/)
    expect(seen.stopped).toBe(true)
  })

  it('counts a site an address names, and a request whose URL it cannot read', async () => {
    const limiter = new MemoryRateLimiter()
    const { scanner } = reaching('93.184.215.14')
    const limited = hostLimited(scanner, { limiter, window: WINDOW, now: () => NOW })
    await limited(asked('https://redirector.example.net/'), () => undefined)
    expect(await leftFor(limiter, '93.184.215.14')).toBe(1)
    // A request the API vetted is a URL; were it not, the site is still counted.
    const again = reaching('www.victim.example')
    await hostLimited(again.scanner, { limiter, window: WINDOW, now: () => NOW })(
      asked('not a url'),
      () => undefined,
    )
    expect(await leftFor(limiter, 'victim.example')).toBe(1)
  })
})

describe('hostLimited, in a scan the worker runs', () => {
  it('fails the scan, tells its page, and logs neither the site nor the limit', async () => {
    const store = new MemoryScanStore()
    const events = new MemoryScanEvents(20)
    await store.create({
      id: ID,
      url: 'https://redirector.example.net/',
      createdAt: new Date(NOW),
    })
    const limiter = new MemoryRateLimiter()
    await leftFor(limiter, 'victim.example')
    const logged: string[] = []
    const { scanner } = reaching('www.victim.example')
    await runScan(
      { id: ID, url: 'https://redirector.example.net/' },
      {
        store,
        events,
        scanner: hostLimited(scanner, { limiter, window: WINDOW, now: () => NOW }),
        now: () => new Date(NOW),
        log: (message) => logged.push(message),
      },
    )
    expect(await store.get(ID)).toMatchObject({ state: 'failed', report: null })
    const seen = (await events.since(ID, null)).map((stored) => stored.event.type)
    expect(seen).toEqual(['page', 'error'])
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatch(/could not run.*reached its limit/)
    expect(logged[0]).not.toContain('victim')
    expect(logged[0]).not.toContain('redirector')
  })

  it('leaves a scan that stays on its site to run to its report', async () => {
    const store = new MemoryScanStore()
    const events = new MemoryScanEvents(20)
    await store.create({ id: ID, url: 'https://example.com/', createdAt: new Date(NOW) })
    const { scanner } = reaching('example.com')
    await runScan(
      { id: ID, url: 'https://example.com/' },
      {
        store,
        events,
        scanner: hostLimited(scanner, {
          limiter: new MemoryRateLimiter(),
          window: WINDOW,
          now: () => NOW,
        }),
        now: () => new Date(NOW),
      },
    )
    expect(await store.get(ID)).toMatchObject({ state: 'complete' })
  })
})
