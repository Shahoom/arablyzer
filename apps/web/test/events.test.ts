import type { ScanEvent, ScanSummary } from '@arablyzer/api-contract/codes'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Loaded } from '../src/islands/api'
import {
  followScan,
  MAX_RECONNECTS,
  OFFLINE_AFTER,
  SILENCE_MS,
  type FollowDeps,
  type FollowHandlers,
} from '../src/islands/events'

const ID = 'AbCdEfGhIjKlMnOpQrSt_-'
const RUNNING: ScanSummary = {
  id: ID,
  url: 'https://example.com/',
  state: 'running',
  createdAt: '2026-09-28T12:00:00.000Z',
}
const DONE: ScanSummary = { ...RUNNING, state: 'complete' }

/** A stand-in for the browser's EventSource: the test opens, feeds and breaks it. */
class FakeSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static made: FakeSource[] = []
  readonly url: string
  readyState = FakeSource.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((message: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  readonly listeners = new Map<string, () => void>()
  closed = false

  constructor(url: string) {
    this.url = url
    FakeSource.made.push(this)
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener)
  }
  close() {
    this.closed = true
    this.readyState = FakeSource.CLOSED
  }
  open() {
    this.readyState = FakeSource.OPEN
    this.onopen?.()
  }
  send(event: ScanEvent) {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>)
  }
  ping() {
    this.listeners.get('ping')?.()
  }
  /** A drop the browser reconnects by itself. */
  drop() {
    this.readyState = FakeSource.CONNECTING
    this.onerror?.()
  }
  /** An answer that is not a stream (a 502, a 429, a 204): closed for good. */
  refuse() {
    this.readyState = FakeSource.CLOSED
    this.onerror?.()
  }
}

function harness(answers: Loaded<ScanSummary>[]) {
  const reads: string[] = []
  const calls: string[] = []
  const events: ScanEvent[] = []
  const deps: FollowDeps = {
    EventSource: FakeSource as unknown as typeof EventSource,
    fetchSummary: (id) => {
      reads.push(id)
      const answer = answers.shift() ?? answers.at(-1) ?? { ok: true, value: RUNNING }
      if (answers.length === 0) answers.push(answer)
      return Promise.resolve(answer)
    },
    setTimeout: (run, ms) => setTimeout(run, ms),
    clearTimeout: (timer) => {
      clearTimeout(timer)
    },
  }
  const handlers: FollowHandlers = {
    onFollowing: (summary) => calls.push(`following ${summary.state}`),
    onEvent: (event) => events.push(event),
    onEnded: (summary) => calls.push(`ended ${summary.state}`),
    onMissing: () => calls.push('missing'),
    onReachable: (reachable) => calls.push(`reachable ${String(reachable)}`),
  }
  const stop = followScan(ID, handlers, deps)
  const source = () => {
    const last = FakeSource.made.at(-1)
    if (last === undefined) throw new Error('No stream opened')
    return last
  }
  return { reads, calls, events, stop, source }
}

const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
  FakeSource.made = []
})
afterEach(() => {
  vi.useRealTimers()
})

describe('followScan', () => {
  it('reads the scan, follows its events, and stops at its end', async () => {
    const run = harness([{ ok: true, value: RUNNING }])
    await settle()
    expect(run.calls).toEqual(['following running'])
    expect(run.source().url).toBe(`/api/scans/${ID}/events`)
    run.source().open()
    run.source().send({ type: 'started', engines: ['chromium'] })
    run.source().send({ type: 'done', state: 'complete' })
    expect(run.events.map((event) => event.type)).toEqual(['started', 'done'])
    expect(run.source().closed).toBe(true)
    await vi.advanceTimersByTimeAsync(SILENCE_MS * 2)
    expect(FakeSource.made).toHaveLength(1)
  })

  it('shows a scan that ended before the page came as ended, with no stream', async () => {
    const run = harness([{ ok: true, value: DONE }])
    await settle()
    expect(run.calls).toEqual(['ended complete'])
    expect(FakeSource.made).toHaveLength(0)
  })

  it('reads the scan again when its stream is refused, and shows the report if it ended', async () => {
    const run = harness([
      { ok: true, value: RUNNING },
      { ok: true, value: DONE },
    ])
    await settle()
    run.source().refuse()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(run.calls).toEqual(['following running', 'ended complete'])
  })

  it('opens a fresh stream for a scan still running, waiting longer after each refusal', async () => {
    const run = harness([{ ok: true, value: RUNNING }])
    await settle()
    const waits: number[] = []
    for (let refusal = 1; refusal <= 6; refusal++) {
      const before = FakeSource.made.length
      run.source().refuse()
      let waited = 0
      while (FakeSource.made.length === before) {
        await vi.advanceTimersByTimeAsync(1_000)
        waited += 1_000
      }
      waits.push(waited)
    }
    // 2, 4, 8, 16, then 30 s at most: a service that refuses streams is not hammered.
    expect(waits).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000])
    expect(run.calls.filter((call) => call === 'following running')).toHaveLength(7)
  })

  it('lets the browser reconnect a dropped stream, then reads the scan if it keeps failing', async () => {
    const run = harness([{ ok: true, value: RUNNING }])
    await settle()
    const first = run.source()
    for (let drop = 0; drop < MAX_RECONNECTS; drop++) first.drop()
    expect(first.closed).toBe(false)
    first.drop()
    expect(first.closed).toBe(true)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(run.reads).toHaveLength(2)
    expect(FakeSource.made).toHaveLength(2)
  })

  it('takes a silent stream for dead, and pings for life', async () => {
    const run = harness([{ ok: true, value: RUNNING }])
    await settle()
    run.source().open()
    await vi.advanceTimersByTimeAsync(SILENCE_MS - 1_000)
    run.source().ping()
    await vi.advanceTimersByTimeAsync(SILENCE_MS - 1_000)
    expect(run.source().closed).toBe(false)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(FakeSource.made[0]?.closed).toBe(true)
  })

  it('says the service is out of reach only after several failed reads, and keeps trying', async () => {
    const offline: Loaded<ScanSummary> = { ok: false, reason: 'offline' }
    const run = harness([offline, offline, offline, offline, { ok: true, value: RUNNING }])
    await settle()
    // Read 1 failed at once; reads 2 and 3 come 2 s and 4 s after the one before.
    await vi.advanceTimersByTimeAsync(2_000)
    expect(run.reads).toHaveLength(2)
    expect(run.calls).toEqual([])
    await vi.advanceTimersByTimeAsync(4_000)
    expect(run.reads).toHaveLength(OFFLINE_AFTER)
    expect(run.calls).toEqual(['reachable false'])
    // Reads 4 (8 s on) and 5 (16 s on): the service answers again.
    await vi.advanceTimersByTimeAsync(8_000 + 16_000)
    expect(run.calls).toEqual(['reachable false', 'reachable true', 'following running'])
  })

  it('stops at a scan that is not there, and when the page stops it', async () => {
    const missing = harness([{ ok: false, reason: 'missing' }])
    await settle()
    expect(missing.calls).toEqual(['missing'])

    FakeSource.made = []
    const run = harness([{ ok: true, value: RUNNING }])
    await settle()
    run.stop()
    expect(run.source().closed).toBe(true)
    run.source().refuse()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(run.reads).toHaveLength(1)
  })

  it('ignores what is not one of a scan’s events', async () => {
    const run = harness([{ ok: true, value: RUNNING }])
    await settle()
    run.source().onmessage?.({ data: 'not json' } as MessageEvent<string>)
    run.source().onmessage?.({ data: '{"type":"teapot"}' } as MessageEvent<string>)
    expect(run.events).toEqual([])
  })
})
