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

  // The limiter served buckets of several windows (a visitor's, a network's, a host's) and forgot
  // each by the window of the call that happened to run, so a small window wiped a large one's.
  it('forgets a bucket by its own window, never by another key’s', async () => {
    const limiter = new MemoryRateLimiter()
    const t0 = 0
    const small = { scans: 1, seconds: 3600 }
    const large = { scans: 5, seconds: 3600 }
    expect(await limiter.take('large', large, t0)).toEqual({ ok: true })
    expect(await limiter.take('small', small, t0)).toEqual({ ok: true })
    // The large bucket holds 4 of 5: it is not full, whatever the small window's 1 says.
    expect(limiter.size).toBe(2)
    for (let i = 0; i < 4; i++) expect(await limiter.take('large', large, t0)).toEqual({ ok: true })
    expect(await limiter.take('large', large, t0)).toEqual({ ok: false, retryAfterSeconds: 720 })
    // And the small bucket, taken from again, is still empty.
    expect(await limiter.take('small', small, t0)).toEqual({ ok: false, retryAfterSeconds: 3600 })
  })
})

describe('secondsUntilOne', () => {
  it('rounds up, and never answers less than a second', () => {
    expect(secondsUntilOne(0, { scans: 2, seconds: 3600 })).toBe(1800)
    expect(secondsUntilOne(0.5, { scans: 2, seconds: 3600 })).toBe(900)
    expect(secondsUntilOne(0.9999, { scans: 10, seconds: 1 })).toBe(1)
  })
})
