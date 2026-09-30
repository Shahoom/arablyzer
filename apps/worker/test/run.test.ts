import type { ScanEvent } from '@arablyzer/api-contract'
import type { Report } from '@arablyzer/report-schema'
import { ScannerUnavailable, type Scanner } from '@arablyzer/scanner-client'
import { MemoryScanEvents, MemoryScanStore } from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import {
  failScan,
  RETRY_FIRST_MS,
  RETRY_LONGEST_MS,
  RETRY_TOTAL_MS,
  runScan,
  scanJobOf,
} from '../src/run'

const NOW = new Date('2026-09-28T12:00:00Z')
const ID = 'AbCdEfGhIjKlMnOpQrSt_-'

async function stored(events: MemoryScanEvents): Promise<ScanEvent[]> {
  const stop = new AbortController()
  const seen: ScanEvent[] = []
  for await (const event of events.follow(ID, null, stop.signal)) {
    if (event === null) break
    seen.push(event.event)
    if (event.event.type === 'done' || event.event.type === 'error') break
  }
  stop.abort()
  return seen
}

async function setup() {
  const store = new MemoryScanStore()
  const events = new MemoryScanEvents(20)
  await store.create({ id: ID, url: 'https://example.com/', createdAt: NOW })
  return { store, events }
}

const STARTED: ScanEvent = { type: 'started', engines: ['chromium', 'firefox'] }

describe('runScan', () => {
  it('stores the report and tells the page every step, in order', async () => {
    const { store, events } = await setup()
    const report = { scan: { status: 'partial' } } as unknown as Report
    const scanner: Scanner = (_, onEvent) => {
      onEvent(STARTED)
      onEvent({ type: 'page', status: 200, contentType: 'text/html', error: null })
      onEvent({ type: 'render-start', engine: 'firefox' })
      onEvent({ type: 'rules', rules: 47 })
      return Promise.resolve(report)
    }
    await runScan(
      { id: ID, url: 'https://example.com/' },
      { store, events, scanner, now: () => NOW },
    )
    expect(await store.get(ID)).toMatchObject({
      state: 'partial',
      startedAt: NOW,
      finishedAt: NOW,
      report,
    })
    expect(await stored(events)).toEqual([
      STARTED,
      { type: 'page', status: 200, contentType: 'text/html', error: null },
      { type: 'render-start', engine: 'firefox' },
      { type: 'rules', rules: 47 },
      { type: 'done', state: 'partial' },
    ])
  })

  it("asks the scanner for a tool page's scan with its tool, and a whole scan without", async () => {
    const { store, events } = await setup()
    const asked: unknown[] = []
    const report = { scan: { status: 'complete' } } as unknown as Report
    const scanner: Scanner = (request) => {
      asked.push(request)
      return Promise.resolve(report)
    }
    await runScan(
      { id: ID, url: 'https://example.com/', tool: 'rtl-check' },
      { store, events, scanner, now: () => NOW },
    )
    expect(asked).toEqual([{ url: 'https://example.com/', tool: 'rtl-check' }])
    await store.create({ id: 'whole', url: 'https://example.com/', createdAt: NOW })
    await runScan(
      { id: 'whole', url: 'https://example.com/' },
      { store, events, scanner, now: () => NOW },
    )
    expect(asked.at(-1)).toEqual({ url: 'https://example.com/' })
  })

  it('fails a scan that could not run, with no report, and says so', async () => {
    const { store, events } = await setup()
    const logged: string[] = []
    await runScan(
      { id: ID, url: 'https://example.com/' },
      {
        store,
        events,
        scanner: (_, onEvent) => {
          onEvent(STARTED)
          return Promise.reject(new Error('The scanner answered 503'))
        },
        now: () => NOW,
        log: (message) => logged.push(message),
      },
    )
    expect(await store.get(ID)).toMatchObject({ state: 'failed', report: null })
    expect(await stored(events)).toEqual([STARTED, { type: 'error' }])
    expect(logged).toEqual([`Scan ${ID} could not run: The scanner answered 503`])
  })

  it('goes on when an event cannot be sent, and says which', async () => {
    const { store, events } = await setup()
    const logged: string[] = []
    // Valkey refusing the first event, as when it is out of memory or read-only.
    const flaky = {
      since: events.since.bind(events),
      follow: events.follow.bind(events),
      publish: (id: string, event: ScanEvent) =>
        event.type === 'started'
          ? Promise.reject(new Error('OOM command not allowed'))
          : events.publish(id, event),
    }
    const scanner: Scanner = async (_, onEvent) => {
      onEvent(STARTED)
      // The scanner is quiet a while after the refusal, as a browser starting is.
      await new Promise((resolve) => setTimeout(resolve, 20))
      onEvent({ type: 'rules', rules: 47 })
      return { scan: { status: 'complete' } } as unknown as Report
    }
    await runScan(
      { id: ID, url: 'https://example.com/' },
      { store, events: flaky, scanner, now: () => NOW, log: (m) => logged.push(m) },
    )
    expect(await store.get(ID)).toMatchObject({ state: 'complete' })
    expect(await stored(events)).toEqual([
      { type: 'rules', rules: 47 },
      { type: 'done', state: 'complete' },
    ])
    expect(logged).toEqual([`Scan ${ID} lost its started event: OOM command not allowed`])
  })

  it('keeps the report when done cannot be sent: the scan ran, and the page reads its state', async () => {
    const { store, events } = await setup()
    const logged: string[] = []
    const lossy = {
      since: events.since.bind(events),
      follow: events.follow.bind(events),
      publish: (id: string, event: ScanEvent) =>
        event.type === 'done' ? Promise.reject(new Error('READONLY')) : events.publish(id, event),
    }
    const report = { scan: { status: 'complete' } } as unknown as Report
    await runScan(
      { id: ID, url: 'https://example.com/' },
      {
        store,
        events: lossy,
        scanner: () => Promise.resolve(report),
        now: () => NOW,
        log: (m) => logged.push(m),
      },
    )
    expect(await store.get(ID)).toMatchObject({ state: 'complete', report })
    expect(logged).toEqual([`Scan ${ID} lost its done event: READONLY`])
  })

  it('never runs a scan twice: one no longer queued is failed, not scanned', async () => {
    const { store, events } = await setup()
    // The first run's worker died mid-scan, leaving it running.
    await store.start(ID, NOW)
    let scanned = false
    await runScan(
      { id: ID, url: 'https://example.com/' },
      {
        store,
        events,
        scanner: () => {
          scanned = true
          return Promise.reject(new Error('not reached'))
        },
        now: () => NOW,
      },
    )
    expect(scanned).toBe(false)
    expect(await store.get(ID)).toMatchObject({ state: 'failed', report: null })
    expect(await stored(events)).toEqual([{ type: 'error' }])
  })

  it('leaves a scan that ended as it is when its job fails afterwards', async () => {
    const { store, events } = await setup()
    const report = { scan: { status: 'partial' } } as unknown as Report
    await store.start(ID, NOW)
    await store.finish(ID, report, NOW)
    await failScan(ID, { store, events })
    expect(await store.get(ID)).toMatchObject({ state: 'partial', report })
    expect(await events.since(ID, null)).toEqual([])
  })
})

// H1 of the pre-launch review: a scanner that had died, which Compose starts again (as it does after
// every scan the scanner serves, M3), was never asked again: "not there" was final, each scan is
// tried once, and so every scan queued behind the one that died failed within a moment.
describe('runScan, while the scanner is not there', () => {
  /** A clock that only the waits move, so a test of a minute takes no time. */
  function clock() {
    const waits: number[] = []
    let now = 0
    return {
      waits,
      now: () => now,
      sleep: (ms: number) => {
        waits.push(ms)
        now += ms
        return Promise.resolve()
      },
    }
  }

  const REPORT = { scan: { status: 'complete' } } as unknown as Report

  it('waits for a scanner that is restarting, and runs the scan when it is back', async () => {
    const { store, events } = await setup()
    const time = clock()
    const logged: string[] = []
    let asked = 0
    const scanner: Scanner = (_, onEvent) => {
      if (++asked <= 3)
        return Promise.reject(new ScannerUnavailable('The scanner is not there (ECONNREFUSED)'))
      onEvent(STARTED)
      return Promise.resolve(REPORT)
    }
    await runScan(
      { id: ID, url: 'https://example.com/' },
      { store, events, scanner, now: () => NOW, sleep: time.sleep, log: (m) => logged.push(m) },
    )
    expect(asked).toBe(4)
    // Short waits, longer each time.
    expect(time.waits).toEqual([RETRY_FIRST_MS, 2 * RETRY_FIRST_MS, 4 * RETRY_FIRST_MS])
    expect(await store.get(ID)).toMatchObject({ state: 'complete', report: REPORT })
    // No page was told of an error: it saw its scan start, and finish.
    expect(await stored(events)).toEqual([STARTED, { type: 'done', state: 'complete' }])
    // Said once, whatever the number of waits: the log is for what needs a person.
    expect(logged).toEqual([
      `Scan ${ID}: The scanner is not there (ECONNREFUSED); asking again, for up to 60 s`,
    ])
  })

  it('does not fail the scans queued behind one that meets a scanner that has just died', async () => {
    const { store, events } = await setup()
    const ids = ['second-scan', 'third-scan']
    for (const id of ids) await store.create({ id, url: 'https://example.com/', createdAt: NOW })
    const time = clock()
    // The scanner is back after eight seconds, as a container restarted by Compose is.
    const BACK = 8_000
    const scanner: Scanner = () =>
      time.now() < BACK
        ? Promise.reject(new ScannerUnavailable('The scanner answered 503'))
        : Promise.resolve(REPORT)
    // One job at a time, as the worker takes them.
    for (const id of [ID, ...ids]) {
      await runScan(
        { id, url: 'https://example.com/' },
        { store, events, scanner, now: () => NOW, sleep: time.sleep },
      )
    }
    for (const id of [ID, ...ids])
      expect(await store.get(id), id).toMatchObject({ state: 'complete' })
  })

  it('waits at most a minute in all, and then fails that scan alone, with the reason', async () => {
    const { store, events } = await setup()
    const time = clock()
    const logged: string[] = []
    let asked = 0
    const dead: Scanner = () => {
      asked++
      return Promise.reject(new ScannerUnavailable('The scanner is not there (ENOTFOUND)'))
    }
    await runScan(
      { id: ID, url: 'https://example.com/' },
      {
        store,
        events,
        scanner: dead,
        now: () => NOW,
        sleep: time.sleep,
        log: (m) => logged.push(m),
      },
    )
    expect(await store.get(ID)).toMatchObject({ state: 'failed', report: null })
    expect(await stored(events)).toEqual([{ type: 'error' }])
    expect(time.waits.reduce((all, wait) => all + wait, 0)).toBeLessThanOrEqual(RETRY_TOTAL_MS)
    expect(time.waits.at(-1)).toBe(RETRY_LONGEST_MS)
    expect(asked).toBe(time.waits.length + 1)
    expect(logged.at(-1)).toBe(`Scan ${ID} could not run: The scanner is not there (ENOTFOUND)`)
    // The next scan is not held back by it: the scanner is back, and it runs.
    await store.create({ id: 'next-scan', url: 'https://example.com/', createdAt: NOW })
    await runScan(
      { id: 'next-scan', url: 'https://example.com/' },
      { store, events, scanner: () => Promise.resolve(REPORT), now: () => NOW, sleep: time.sleep },
    )
    expect(await store.get('next-scan')).toMatchObject({ state: 'complete' })
  })

  it('keeps to the wait it is given', async () => {
    const { store, events } = await setup()
    const time = clock()
    await runScan(
      { id: ID, url: 'https://example.com/' },
      {
        store,
        events,
        scanner: () => Promise.reject(new ScannerUnavailable('The scanner answered 503')),
        now: () => NOW,
        sleep: time.sleep,
        retryMs: 2_000,
      },
    )
    expect(time.waits).toEqual([500, 1_000])
    expect(await store.get(ID)).toMatchObject({ state: 'failed' })
  })

  it('asks again for nothing but a scanner that is not there', async () => {
    for (const failure of [
      new Error('The scanner answered 500'),
      new Error('The scanner could not run the scan: Firefox did not start'),
      new TypeError('fetch failed', { cause: new Error('read ECONNRESET') }),
    ]) {
      const { store, events } = await setup()
      const time = clock()
      let asked = 0
      await runScan(
        { id: ID, url: 'https://example.com/' },
        {
          store,
          events,
          scanner: () => {
            asked++
            return Promise.reject(failure)
          },
          now: () => NOW,
          sleep: time.sleep,
        },
      )
      expect(asked, failure.message).toBe(1)
      expect(time.waits, failure.message).toEqual([])
      expect(await store.get(ID), failure.message).toMatchObject({ state: 'failed' })
    }
  })

  it('states the waits it keeps: short at first, never long, a minute in all', () => {
    expect(RETRY_FIRST_MS).toBeLessThanOrEqual(1_000)
    expect(RETRY_LONGEST_MS).toBeLessThanOrEqual(10_000)
    expect(RETRY_TOTAL_MS).toBe(60_000)
  })
})

describe('scanJobOf', () => {
  it("reads a queued job's scan, with the tool a tool page asked for", () => {
    expect(scanJobOf({ id: ID, url: 'https://example.com/' })).toEqual({
      id: ID,
      url: 'https://example.com/',
    })
    expect(scanJobOf({ id: ID, url: 'https://example.com/', tool: 'rtl-check' })).toEqual({
      id: ID,
      url: 'https://example.com/',
      tool: 'rtl-check',
    })
  })

  it('refuses what is not a scan', () => {
    for (const data of [null, 'scan', { id: ID }, { url: 'x' }, { id: ID, url: 'x', tool: 3 }]) {
      expect(() => scanJobOf(data)).toThrow('Not a scan')
    }
  })
})
