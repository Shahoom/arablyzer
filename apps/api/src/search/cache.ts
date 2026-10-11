/** A day: what Google said is kept this long, so the same question is not asked twice. */
export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A small in-memory cache with a time to live and a cap on its size (the oldest entry goes when it
 * is full). It lives in one API process: a restart forgets, which only costs a repeat question.
 */
export class DayCache<T> {
  private readonly entries = new Map<string, { readonly at: number; readonly value: T }>()
  private readonly now: () => number
  private readonly max: number
  private readonly ttlMs: number

  constructor(now: () => number, max = 500, ttlMs = DAY_MS) {
    this.now = now
    this.max = max
    this.ttlMs = ttlMs
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    if (this.now() - entry.at >= this.ttlMs) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.entries.delete(key)
    this.entries.set(key, { at: this.now(), value })
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  get size(): number {
    return this.entries.size
  }
}
