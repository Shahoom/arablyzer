import type { ScanEvent } from '@arablyzer/api-contract'
import type { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  IN_FLIGHT_TTL_MS,
  ValkeyInFlight,
  ValkeyRateLimiter,
  ValkeyScanEvents,
  type StoredEvent,
} from '../../src/index'
import { hasValkey, valkey, VALKEY_DB } from './services'

const ID = 'AbCdEfGhIjKlMnOpQrSt_-'

describe.skipIf(!hasValkey)('Valkey', () => {
  let redis: Redis
  beforeAll(async () => {
    redis = await valkey(VALKEY_DB.valkey)
  })
  afterAll(async () => {
    await redis.quit()
  })

  async function collect(events: ValkeyScanEvents, after: string | null, count: number) {
    const stop = new AbortController()
    const seen: (StoredEvent | null)[] = []
    for await (const stored of events.follow(ID, after, stop.signal)) {
      seen.push(stored)
      if (seen.length === count) break
    }
    stop.abort()
    return seen
  }

  it('keeps a scan’s events in order, resumable after any of them, expiring with the scan', async () => {
    const events = new ValkeyScanEvents(redis, 200)
    const sent: ScanEvent[] = [
      { type: 'queued', ahead: 0 },
      { type: 'started', engines: ['chromium'] },
      { type: 'done', state: 'complete' },
    ]
    const ids: string[] = []
    for (const event of sent) ids.push(await events.publish(ID, event))
    const all = await collect(events, null, 3)
    expect(all.map((stored) => stored?.event)).toEqual(sent)
    expect(all.map((stored) => stored?.id)).toEqual(ids)
    const rest = await collect(events, ids[0] ?? null, 2)
    expect(rest.map((stored) => stored?.event)).toEqual(sent.slice(1))
    const ttl = await redis.ttl(`arablyzer:scan:${ID}:events`)
    expect(ttl).toBeGreaterThan(23 * 60 * 60)
  })

  it('waits for the next event, says so when none comes, and stops when asked', async () => {
    const events = new ValkeyScanEvents(redis, 100)
    const other = 'ZyXwVuTsRqPoNmLkJiHg_-'
    const stop = new AbortController()
    const seen: (StoredEvent | null)[] = []
    const following = (async () => {
      for await (const stored of events.follow(other, null, stop.signal)) {
        seen.push(stored)
        if (stored !== null) stop.abort()
      }
    })()
    await new Promise((resolve) => setTimeout(resolve, 250))
    await events.publish(other, { type: 'started', engines: ['chromium'] })
    await following
    expect(seen.filter((stored) => stored === null).length).toBeGreaterThan(0)
    expect(seen.at(-1)?.event).toEqual({ type: 'started', engines: ['chromium'] })
  })

  it('reads the events there are without waiting, and any ID it could not have given from the start', async () => {
    const events = new ValkeyScanEvents(redis, 100)
    const scan = 'SiNcEsInCeSiNcEsInCe_-'
    expect(await events.since(scan, null)).toEqual([])
    const first = await events.publish(scan, { type: 'queued', ahead: 0 })
    const second = await events.publish(scan, { type: 'error' })
    expect(await events.since(scan, null)).toEqual([
      { id: first, event: { type: 'queued', ahead: 0 } },
      { id: second, event: { type: 'error' } },
    ])
    expect(await events.since(scan, first)).toEqual([{ id: second, event: { type: 'error' } }])
    expect(await events.since(scan, second)).toEqual([])
    // Past 2^64 − 1, which XREAD and XRANGE refuse: read from the start instead of failing.
    const huge = '99999999999999999999-0'
    expect(await events.since(scan, huge)).toHaveLength(2)
    const stop = new AbortController()
    for await (const next of events.follow(scan, huge, stop.signal)) {
      expect(next?.id).toBe(first)
      break
    }
    stop.abort()
  })

  it('refuses to store what is not a scan event', async () => {
    const events = new ValkeyScanEvents(redis)
    await expect(events.publish(ID, { type: 'teapot' } as unknown as ScanEvent)).rejects.toThrow()
  })

  it('shares one bucket between API processes, and forgets it when it is full again', async () => {
    const window = { scans: 5, seconds: 3600 }
    const first = new ValkeyRateLimiter(redis)
    const second = new ValkeyRateLimiter(redis)
    const now = Date.parse('2026-09-28T12:00:00Z')
    const taken = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 === 0 ? first : second).take('connection:k', window, now),
      ),
    )
    expect(taken.filter((result) => result.ok)).toHaveLength(5)
    expect(taken.find((result) => !result.ok)).toEqual({
      ok: false,
      retryAfterSeconds: 720,
    })
    const pttl = await redis.pttl('arablyzer:limit:connection:k')
    expect(pttl).toBeGreaterThan(0)
    expect(pttl).toBeLessThanOrEqual(3_600_000)
    // A fifth of the window later, one scan is back.
    expect(await first.take('connection:k', window, now + 720_000)).toEqual({ ok: true })
  })

  it('adds no scans for a process whose clock lags', async () => {
    const window = { scans: 5, seconds: 3600 }
    const limiter = new ValkeyRateLimiter(redis)
    const ahead = Date.parse('2026-09-28T12:45:00Z')
    const behind = Date.parse('2026-09-28T12:00:00Z')
    const taken = []
    for (let i = 0; i < 6; i++) {
      taken.push(await limiter.take('connection:skew', window, i % 2 === 0 ? ahead : behind))
    }
    expect(taken.filter((result) => result.ok)).toHaveLength(5)
  })

  describe('the places a visitor holds', () => {
    const at = Date.parse('2026-09-28T12:00:00Z')
    const key = (visitor: string) => `arablyzer:inflight:${visitor}`

    it('gives a visitor their cap and no more, however many ask at once', async () => {
      const first = new ValkeyInFlight(redis)
      const second = new ValkeyInFlight(redis)
      const taken = await Promise.all(
        Array.from({ length: 16 }, (_, i) =>
          (i % 2 === 0 ? first : second).hold('burst', `scan-${i}`, 2, at + i),
        ),
      )
      expect(taken.filter(Boolean)).toHaveLength(2)
      expect(await redis.zcard(key('burst'))).toBe(2)
    })

    it('lists the places with when each was taken, and gives them back', async () => {
      const places = new ValkeyInFlight(redis)
      expect(await places.held('lists')).toEqual([])
      expect(await places.hold('lists', 'a', 3, at)).toBe(true)
      expect(await places.hold('lists', 'b', 3, at + 5)).toBe(true)
      expect(await places.held('lists')).toEqual([
        { scanId: 'a', at },
        { scanId: 'b', at: at + 5 },
      ])
      await places.release('lists', ['a', 'not-held'])
      expect(await places.held('lists')).toEqual([{ scanId: 'b', at: at + 5 }])
      await places.release('lists', ['b'])
      expect(await redis.exists(key('lists'))).toBe(0)
      // Nothing to give back is not an error.
      await places.release('lists', [])
    })

    it('keeps visitors apart, and takes a scan’s place once', async () => {
      const places = new ValkeyInFlight(redis)
      expect(await places.hold('one', 'x', 1, at)).toBe(true)
      expect(await places.hold('one', 'x', 1, at + 9)).toBe(true)
      expect((await places.held('one')).map((place) => place.at)).toEqual([at])
      expect(await places.hold('one', 'y', 1, at)).toBe(false)
      expect(await places.hold('two', 'y', 1, at)).toBe(true)
    })

    it('forgets a place older than a scan can be, and expires with the visitor’s last', async () => {
      const places = new ValkeyInFlight(redis)
      expect(await places.hold('ages', 'old', 1, at)).toBe(true)
      expect(await places.hold('ages', 'new', 1, at + 1_000)).toBe(false)
      expect(await places.hold('ages', 'new', 1, at + IN_FLIGHT_TTL_MS + 1)).toBe(true)
      expect((await places.held('ages')).map((place) => place.scanId)).toEqual(['new'])
      const pttl = await redis.pttl(key('ages'))
      expect(pttl).toBeGreaterThan(0)
      expect(pttl).toBeLessThanOrEqual(IN_FLIGHT_TTL_MS)
    })
  })
})
