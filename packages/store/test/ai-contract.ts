import { describe, expect, it } from 'vitest'
import { PENDING_MS, type AiData, type Reservation } from '../src/index'

export const NOW = new Date('2026-10-09T12:00:00.000Z')
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
export const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE)

export interface AiHarness {
  readonly ai: AiData
  /** Makes the person exist (PostgreSQL keeps a foreign key to them). */
  readonly user: (id: string) => Promise<void>
  /** Empties the two tables, so a test sees only its own rows (PostgreSQL shares them between tests). */
  readonly reset: () => Promise<void>
}

let counter = 0
const id = (prefix: string) => `${prefix}${String(++counter)}`.padEnd(22, '_')

const USAGE = {
  model: 'test-model',
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

/** What the fix assistant keeps, run over the memory store and PostgreSQL alike. */
export function aiContract(make: () => AiHarness | Promise<AiHarness>): void {
  async function setup() {
    const h = await make()
    await h.reset()
    const userId = id('u')
    await h.user(userId)
    const ask = (overrides: Partial<Reservation> = {}): Reservation => ({
      id: id('r'),
      userId,
      ruleId: 'img-alt',
      at: NOW,
      worstMicro: 100,
      perDay: 3,
      maxPending: 2,
      dailyCapMicro: null,
      monthlyCapMicro: null,
      ...overrides,
    })
    return { ...h, userId, ask }
  }

  describe('the fix cache', () => {
    it('keeps a stored answer by its key, and no older than the age asked for', async () => {
      const { ai } = await setup()
      expect(await ai.cached('k1', at(-60))).toBeNull()
      await ai.cache('k1', '{"a":1}', 'test-model', NOW)
      expect(await ai.cached('k1', at(-60))).toEqual({
        fix: '{"a":1}',
        model: 'test-model',
        createdAt: NOW,
      })
      expect(await ai.cached('k1', at(1))).toBeNull()
      // The same key written again replaces the answer, not duplicates it.
      await ai.cache('k1', '{"a":2}', 'test-model', at(5))
      expect((await ai.cached('k1', at(-60)))?.fix).toBe('{"a":2}')
    })
  })

  describe('reserving a request', () => {
    it('counts requests per account over a rolling day, and says when a slot frees', async () => {
      const { ai, ask, userId } = await setup()
      for (let n = 0; n < 3; n++) {
        const r = ask({ at: at(n) })
        expect((await ai.reserve(r)).kind).toBe('reserved')
        await ai.settle(r.id, { ...USAGE, costMicro: 10 }, at(n))
      }
      const refused = await ai.reserve(ask({ at: at(10) }))
      expect(refused.kind).toBe('limit')
      // The oldest left the window one day after it began: 24 h minus the 10 minutes since.
      if (refused.kind === 'limit') expect(refused.retryAfterSeconds).toBe(24 * 3600 - 10 * 60)
      expect(await ai.used(userId, at(10))).toBe(3)
      // A day on, the first request has aged out.
      expect((await ai.reserve(ask({ at: new Date(NOW.getTime() + DAY + MINUTE) }))).kind).toBe(
        'reserved',
      )
    })

    it('gives a request back when it fails: it counts for nothing', async () => {
      const { ai, ask, userId } = await setup()
      const r = ask({ perDay: 1 })
      expect((await ai.reserve(r)).kind).toBe('reserved')
      expect((await ai.reserve(ask({ perDay: 1 }))).kind).toBe('limit')
      await ai.release(r.id)
      expect(await ai.used(userId, NOW)).toBe(0)
      expect((await ai.reserve(ask({ perDay: 1 }))).kind).toBe('reserved')
    })

    it('holds an account to its pending requests, and forgets a reservation that was never settled', async () => {
      const { ai, ask } = await setup()
      const first = ask({ maxPending: 1 })
      expect((await ai.reserve(first)).kind).toBe('reserved')
      expect((await ai.reserve(ask({ maxPending: 1, at: at(1) }))).kind).toBe('busy')
      await ai.settle(first.id, { ...USAGE, costMicro: 5 }, at(1))
      expect((await ai.reserve(ask({ maxPending: 1, at: at(2) }))).kind).toBe('reserved')
      // A request that died holds its place no longer than PENDING_MS.
      const later = new Date(NOW.getTime() + 2 * MINUTE + PENDING_MS + MINUTE)
      expect((await ai.reserve(ask({ maxPending: 1, at: later }))).kind).toBe('reserved')
    })

    it('keeps to the day’s and the month’s spend, counting what is reserved and what is settled', async () => {
      const { ai, ask, user } = await setup()
      const other = id('v')
      await user(other)
      const cap = { dailyCapMicro: 1000, worstMicro: 400, perDay: 10 }
      const a = ask(cap)
      const b = ask({ ...cap, userId: other })
      expect((await ai.reserve(a)).kind).toBe('reserved')
      expect((await ai.reserve(b)).kind).toBe('reserved')
      expect(await ai.reserve(ask({ ...cap, at: at(1) }))).toEqual({
        kind: 'budget',
        cap: 'day',
      })
      // What a request really cost frees the rest of its reservation.
      await ai.settle(a.id, { ...USAGE, costMicro: 100 }, at(2))
      const third = ask({ ...cap, at: at(3) })
      expect((await ai.reserve(third)).kind).toBe('reserved')
      expect(await ai.spent(at(3))).toEqual({ day: 100 + 400 + 400, month: 100 + 400 + 400 })
      // A request waiting longer than PENDING_MS is forgotten, so the rest settle before the day ends.
      await ai.settle(b.id, { ...USAGE, costMicro: 400 }, at(4))
      await ai.settle(third.id, { ...USAGE, costMicro: 400 }, at(4))
      // The next UTC day starts a new daily total; the month's goes on.
      const tomorrow = new Date('2026-10-10T00:05:00.000Z')
      expect((await ai.reserve(ask({ ...cap, at: tomorrow, perDay: 10 }))).kind).toBe('reserved')
      const month = ask({ monthlyCapMicro: 1000, worstMicro: 400, at: tomorrow, perDay: 10 })
      expect(await ai.reserve(month)).toEqual({ kind: 'budget', cap: 'month' })
    })

    it('lets concurrent requests pass the cap by none: only as many as fit are reserved', async () => {
      const { ai, ask, user } = await setup()
      const people = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const person = id('c')
          await user(person)
          return person
        }),
      )
      const results = await Promise.all(
        people.map((userId) =>
          ai.reserve(ask({ userId, dailyCapMicro: 1000, worstMicro: 300, perDay: 5 })),
        ),
      )
      expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(3)
      expect((await ai.spent(NOW)).day).toBe(900)
    })

    it('does not reserve what a single request could never fit in', async () => {
      const { ai, ask } = await setup()
      expect(await ai.reserve(ask({ dailyCapMicro: 50, worstMicro: 100 }))).toEqual({
        kind: 'budget',
        cap: 'day',
      })
      expect((await ai.spent(NOW)).day).toBe(0)
    })
  })

  describe('erasing an account', () => {
    it('forgets whose requests they were and keeps what they cost, so the cap holds', async () => {
      const { ai, ask, userId } = await setup()
      const r = ask()
      await ai.reserve(r)
      await ai.settle(r.id, { ...USAGE, costMicro: 77 }, NOW)
      await ai.eraseUser(userId)
      expect(await ai.used(userId, NOW)).toBe(0)
      expect((await ai.spent(NOW)).day).toBe(77)
    })
  })

  describe('pruning', () => {
    it('drops settled requests and answers older than a day asked for, and nothing else', async () => {
      const { ai, ask } = await setup()
      const old = ask({ at: new Date(NOW.getTime() - 100 * DAY) })
      await ai.reserve(old)
      await ai.settle(old.id, { ...USAGE, costMicro: 1 }, old.at)
      const recent = ask()
      await ai.reserve(recent)
      await ai.settle(recent.id, { ...USAGE, costMicro: 2 }, NOW)
      await ai.cache('old', '{}', 'm', new Date(NOW.getTime() - 100 * DAY))
      await ai.cache('new', '{}', 'm', NOW)
      expect(await ai.prune(new Date(NOW.getTime() - 90 * DAY))).toBe(2)
      expect(await ai.cached('old', new Date(NOW.getTime() - 200 * DAY))).toBeNull()
      expect(await ai.cached('new', new Date(NOW.getTime() - 200 * DAY))).not.toBeNull()
      expect((await ai.spent(NOW)).month).toBe(2)
    })
  })
}
