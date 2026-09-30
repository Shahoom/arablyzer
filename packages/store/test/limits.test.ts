import { describe, expect, it } from 'vitest'
import { MemoryRateLimiter, secondsUntilOne } from '../src/index'

const hour = { scans: 3, seconds: 3600 }

describe('MemoryRateLimiter', () => {
  it('lets a full bucket through, then refills it evenly', async () => {
    const limiter = new MemoryRateLimiter()
    const t0 = Date.parse('2026-09-28T12:00:00Z')
    for (let i = 0; i < 3; i++) expect(await limiter.take('a', hour, t0)).toEqual({ ok: true })
    expect(await limiter.take('a', hour, t0)).toEqual({ ok: false, retryAfterSeconds: 1200 })
    // A third of the window later, one scan is back.
    expect(await limiter.take('a', hour, t0 + 1_200_000)).toEqual({ ok: true })
    expect(await limiter.take('a', hour, t0 + 1_200_000)).toEqual({
      ok: false,
      retryAfterSeconds: 1200,
    })
    // Keys do not share a bucket.
    expect(await limiter.take('b', hour, t0)).toEqual({ ok: true })
  })

  it('forgets a key once its bucket is full again', async () => {
    const limiter = new MemoryRateLimiter()
    const t0 = 0
    await limiter.take('a', hour, t0)
    expect(limiter.size).toBe(1)
    await limiter.take('b', hour, t0 + 3_600_000)
    expect(limiter.size).toBe(1)
  })
})

describe('secondsUntilOne', () => {
  it('rounds up, and never answers less than a second', () => {
    expect(secondsUntilOne(0, { scans: 2, seconds: 3600 })).toBe(1800)
    expect(secondsUntilOne(0.5, { scans: 2, seconds: 3600 })).toBe(900)
    expect(secondsUntilOne(0.9999, { scans: 10, seconds: 1 })).toBe(1)
  })
})
