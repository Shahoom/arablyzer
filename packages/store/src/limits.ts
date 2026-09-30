import type { Window } from '@arablyzer/plans'

export type Taken =
  { readonly ok: true } | { readonly ok: false; readonly retryAfterSeconds: number }

/**
 * A token bucket per key: `window.scans` scans at once, refilled evenly over `window.seconds`
 * (BUILD-PLAN §13). A key's state lasts only until its bucket is full again.
 */
export interface RateLimiter {
  take(key: string, window: Window, now: number): Promise<Taken>
}

interface Bucket {
  tokens: number
  updated: number
  /** The window the bucket was taken with: buckets of several windows share one limiter. */
  window: Window
}

/** In memory, for tests and local development; one process only. */
export class MemoryRateLimiter implements RateLimiter {
  readonly #buckets = new Map<string, Bucket>()

  take(key: string, window: Window, now: number): Promise<Taken> {
    const rate = window.scans / (window.seconds * 1000)
    const bucket = this.#buckets.get(key) ?? { tokens: window.scans, updated: now, window }
    bucket.tokens = Math.min(window.scans, bucket.tokens + (now - bucket.updated) * rate)
    bucket.updated = now
    bucket.window = window
    this.#forgetFull(now)
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      this.#buckets.set(key, bucket)
      return Promise.resolve({ ok: true })
    }
    this.#buckets.set(key, bucket)
    return Promise.resolve({ ok: false, retryAfterSeconds: secondsUntilOne(bucket.tokens, window) })
  }

  /** Buckets that have refilled hold nothing worth keeping: each is judged by its own window. */
  #forgetFull(now: number): void {
    for (const [key, bucket] of this.#buckets) {
      const { scans, seconds } = bucket.window
      const rate = scans / (seconds * 1000)
      if (bucket.tokens + (now - bucket.updated) * rate >= scans) this.#buckets.delete(key)
    }
  }

  get size(): number {
    return this.#buckets.size
  }
}

/** Seconds until a bucket holding `tokens` has one again; a hair under a second counts as one. */
export function secondsUntilOne(tokens: number, window: Window): number {
  const seconds = ((1 - tokens) * window.seconds) / window.scans
  return Math.max(1, Math.ceil(seconds - 1e-9))
}
