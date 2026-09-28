import type { ScanEvent } from '@arablyzer/api-contract'
import type { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ValkeyRateLimiter, ValkeyScanEvents, type StoredEvent } from '../../src/index'
import { hasValkey, valkey } from './services'

const ID = 'AbCdEfGhIjKlMnOpQrSt_-'

describe.skipIf(!hasValkey)('Valkey', () => {
  let redis: Redis
  beforeAll(async () => {
    redis = await valkey()
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
      { type: 'started' },
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
    await events.publish(other, { type: 'started' })
    await following
    expect(seen.filter((stored) => stored === null).length).toBeGreaterThan(0)
    expect(seen.at(-1)?.event).toEqual({ type: 'started' })
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
})
