// What the fix assistant keeps (BUILD-PLAN §12): the ledger of the requests it made to the model, which
// is what its per-account limit and its spend cap are counted from, and the answers it can give again
// without asking. Nothing here is a scanned page: an answer is the model's text, keyed by a hash.

/** How long a stored answer is given again; past it a request asks the model afresh. */
export const FIX_CACHE_DAYS = 30
/** How long a request holds its place before it is taken for one that died. */
export const PENDING_MS = 10 * 60_000
const DAY_MS = 24 * 60 * 60_000

/** What a request to the model really used, as its answer reports it. */
export interface FixUsage {
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  /** In micro-units: a millionth of the unit the prices and the caps are written in. */
  readonly costMicro: number
}

export interface Reservation {
  readonly id: string
  readonly userId: string
  readonly ruleId: string
  readonly at: Date
  /** The most the request can cost, in micro-units: held against the caps until it settles. */
  readonly worstMicro: number
  /** The requests the account may make in the 24 hours up to `at` (its plan). */
  readonly perDay: number
  /** The requests the account may have waiting for the model at once. */
  readonly maxPending: number
  /** The day's and the month's (UTC) spend cap in micro-units; null is none. */
  readonly dailyCapMicro: number | null
  readonly monthlyCapMicro: number | null
}

export type Reserved =
  | { readonly kind: 'reserved' }
  /** The account has used its day; the next slot frees after this many seconds. */
  | { readonly kind: 'limit'; readonly retryAfterSeconds: number }
  /** The account has as many requests waiting as it may. */
  | { readonly kind: 'busy' }
  /** The request, at its worst, would take the day's or the month's spend past its cap. */
  | { readonly kind: 'budget'; readonly cap: 'day' | 'month' }

export interface StoredFix {
  /** The answer as it was stored: the text of JSON the assistant validated. */
  readonly fix: string
  readonly model: string
  readonly createdAt: Date
}

export interface AiData {
  /** The stored answer for the key, if it is no older than `since`. */
  cached(key: string, since: Date): Promise<StoredFix | null>
  cache(key: string, fix: string, model: string, at: Date): Promise<void>
  /**
   * Takes a place for a request to the model, or says why not, as one step: the account's limit, its
   * waiting requests, and the day's and month's spend (what settled, plus what is reserved and not
   * yet settled, plus this request at its worst) are checked and written under one lock, so requests
   * at once cannot pass any of them. The caller settles or releases it.
   */
  reserve(input: Reservation): Promise<Reserved>
  /** The request ended with the model's answer, which cost this much: its place is its cost now. */
  settle(id: string, usage: FixUsage, at: Date): Promise<void>
  /** The request failed before the model billed it: it counts for nothing. */
  release(id: string): Promise<void>
  /** How many requests the account has made in the 24 hours up to `at` (those that failed are not). */
  used(userId: string, at: Date): Promise<number>
  /** The spend of the UTC day and month of `at`, in micro-units, with what is reserved. */
  spent(at: Date): Promise<{ readonly day: number; readonly month: number }>
  /** Forgets whose the requests were; what they cost stays, so the caps hold. */
  eraseUser(userId: string): Promise<void>
  /** Deletes the requests settled, and the answers stored, before `before`; how many. */
  prune(before: Date): Promise<number>
}

/** The start of the UTC day and of the UTC month that contain `at`. */
export function periodStarts(at: Date): { readonly day: Date; readonly month: Date } {
  return {
    day: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())),
    month: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)),
  }
}

/** When a counted request left the account's day, from its date: the seconds to wait for it. */
export const secondsUntilLeaves = (createdAt: Date, at: Date): number =>
  Math.max(1, Math.ceil((createdAt.getTime() + DAY_MS - at.getTime()) / 1000))

interface Row {
  readonly id: string
  userId: string | null
  readonly ruleId: string
  readonly createdAt: Date
  readonly reservedMicro: number
  usage: FixUsage | null
}

/** AiData in memory, for tests and `pnpm dev`. */
export class MemoryAiData implements AiData {
  readonly #rows = new Map<string, Row>()
  readonly #cache = new Map<string, StoredFix>()

  cached(key: string, since: Date): Promise<StoredFix | null> {
    const found = this.#cache.get(key)
    return Promise.resolve(found !== undefined && found.createdAt >= since ? found : null)
  }

  cache(key: string, fix: string, model: string, at: Date): Promise<void> {
    this.#cache.set(key, { fix, model, createdAt: at })
    return Promise.resolve()
  }

  /** A row that counts at `at`: one settled, or one waiting that has not been forgotten. */
  #counts(row: Row, at: Date): boolean {
    return row.usage !== null || row.createdAt.getTime() > at.getTime() - PENDING_MS
  }

  #cost(row: Row): number {
    return row.usage === null ? row.reservedMicro : row.usage.costMicro
  }

  #total(from: Date, at: Date): number {
    let total = 0
    for (const row of this.#rows.values()) {
      if (row.createdAt >= from && this.#counts(row, at)) total += this.#cost(row)
    }
    return total
  }

  reserve(input: Reservation): Promise<Reserved> {
    const { at } = input
    const mine = [...this.#rows.values()].filter(
      (row) => row.userId === input.userId && this.#counts(row, at),
    )
    const pending = mine.filter((row) => row.usage === null).length
    if (pending >= input.maxPending) return Promise.resolve({ kind: 'busy' })
    const windowStart = at.getTime() - DAY_MS
    const inDay = mine
      .filter((row) => row.createdAt.getTime() > windowStart)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    if (inDay.length >= input.perDay) {
      // The request that must leave the window for this one to fit.
      const leaving = inDay[inDay.length - input.perDay]
      return Promise.resolve({
        kind: 'limit',
        retryAfterSeconds: secondsUntilLeaves(leaving?.createdAt ?? at, at),
      })
    }
    const starts = periodStarts(at)
    if (
      input.dailyCapMicro !== null &&
      this.#total(starts.day, at) + input.worstMicro > input.dailyCapMicro
    ) {
      return Promise.resolve({ kind: 'budget', cap: 'day' })
    }
    if (
      input.monthlyCapMicro !== null &&
      this.#total(starts.month, at) + input.worstMicro > input.monthlyCapMicro
    ) {
      return Promise.resolve({ kind: 'budget', cap: 'month' })
    }
    this.#rows.set(input.id, {
      id: input.id,
      userId: input.userId,
      ruleId: input.ruleId,
      createdAt: at,
      reservedMicro: input.worstMicro,
      usage: null,
    })
    return Promise.resolve({ kind: 'reserved' })
  }

  settle(id: string, usage: FixUsage): Promise<void> {
    const row = this.#rows.get(id)
    if (row !== undefined) row.usage = usage
    return Promise.resolve()
  }

  release(id: string): Promise<void> {
    const row = this.#rows.get(id)
    if (row?.usage === null) this.#rows.delete(id)
    return Promise.resolve()
  }

  used(userId: string, at: Date): Promise<number> {
    const windowStart = at.getTime() - DAY_MS
    return Promise.resolve(
      [...this.#rows.values()].filter(
        (row) =>
          row.userId === userId && row.createdAt.getTime() > windowStart && this.#counts(row, at),
      ).length,
    )
  }

  spent(at: Date): Promise<{ day: number; month: number }> {
    const starts = periodStarts(at)
    return Promise.resolve({
      day: this.#total(starts.day, at),
      month: this.#total(starts.month, at),
    })
  }

  eraseUser(userId: string): Promise<void> {
    for (const row of this.#rows.values()) if (row.userId === userId) row.userId = null
    return Promise.resolve()
  }

  prune(before: Date): Promise<number> {
    let gone = 0
    for (const [id, row] of this.#rows) {
      if (row.usage !== null && row.createdAt < before) {
        this.#rows.delete(id)
        gone++
      }
    }
    for (const [key, stored] of this.#cache) {
      if (stored.createdAt < before) {
        this.#cache.delete(key)
        gone++
      }
    }
    return Promise.resolve(gone)
  }
}
