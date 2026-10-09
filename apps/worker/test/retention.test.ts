import { MemoryScanStore } from '@arablyzer/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RETENTION_SWEEP_MS, startRetention } from '../src/retention'

// M5 (issue #33): reports are kept as long as the owner says, and the number is the owner's:
// unset, nothing is deleted by age, and the worker says so once when it starts.

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-28T12:00:00Z')

afterEach(() => {
  vi.useRealTimers()
})

/** A store holding a scan of each of these ages, in days. */
async function storeWith(...ages: number[]) {
  const store = new MemoryScanStore()
  for (const age of ages) {
    await store.create({
      id: `scan-of-${String(age)}-days`,
      url: 'https://example.com/?token=secret',
      createdAt: new Date(NOW.getTime() - age * DAY),
    })
  }
  return store
}

const idOf = (age: number) => `scan-of-${String(age)}-days`

describe('startRetention', () => {
  it('keeps every scan where no number is set, and says so once, at the start', async () => {
    const store = await storeWith(1, 400, 4000)
    const logged: string[] = []
    vi.useFakeTimers({ now: NOW })
    const retention = startRetention({}, { store, log: (message) => logged.push(message) })
    await vi.advanceTimersByTimeAsync(10 * RETENTION_SWEEP_MS)
    for (const age of [1, 400, 4000]) expect(await store.get(idOf(age)), String(age)).not.toBeNull()
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatch(/ARABLYZER_REPORT_RETENTION_DAYS is not set/)
    expect(logged[0]).toMatch(/kept/)
    // Blank is unset too.
    const again: string[] = []
    startRetention(
      { ARABLYZER_REPORT_RETENTION_DAYS: '  ' },
      { store, log: (message) => again.push(message) },
    ).stop()
    expect(again).toHaveLength(1)
    retention.stop()
  })

  it('deletes the scans older than the number of days at the start, and keeps the rest', async () => {
    const store = await storeWith(1, 29, 30, 31, 400)
    const logged: string[] = []
    vi.useFakeTimers({ now: NOW })
    const retention = startRetention(
      { ARABLYZER_REPORT_RETENTION_DAYS: '30' },
      { store, log: (message) => logged.push(message) },
    )
    await vi.advanceTimersByTimeAsync(0)
    for (const age of [31, 400]) expect(await store.get(idOf(age)), String(age)).toBeNull()
    for (const age of [1, 29, 30]) expect(await store.get(idOf(age)), String(age)).not.toBeNull()
    expect(logged).toEqual([
      'Reports and scans older than 30 days are deleted.',
      'Retention: 2 scans older than 30 days deleted.',
    ])
    retention.stop()
  })

  it('sweeps again as the days pass, and stops when it is told to', async () => {
    const store = await storeWith(29)
    vi.useFakeTimers({ now: NOW })
    const retention = startRetention(
      { ARABLYZER_REPORT_RETENTION_DAYS: '30' },
      { store, log: () => undefined },
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(await store.get(idOf(29))).not.toBeNull()
    // Two days on, the scan is 31 days old.
    await vi.advanceTimersByTimeAsync(2 * DAY)
    expect(await store.get(idOf(29))).toBeNull()
    retention.stop()
    await store.create({
      id: 'later',
      url: 'https://example.com/',
      createdAt: new Date(Date.now() - 400 * DAY),
    })
    await vi.advanceTimersByTimeAsync(3 * RETENTION_SWEEP_MS)
    expect(await store.get('later')).not.toBeNull()
  })

  it('tells a store that fails by its message, once a sweep, and goes on', async () => {
    class Flaky extends MemoryScanStore {
      failing = true
      override deleteOlderThan(before: Date): Promise<number> {
        return this.failing
          ? Promise.reject(new Error('Connection terminated'))
          : super.deleteOlderThan(before)
      }
    }
    const store = new Flaky()
    await store.create({
      id: idOf(400),
      url: 'https://example.com/',
      createdAt: new Date(NOW.getTime() - 400 * DAY),
    })
    const logged: string[] = []
    vi.useFakeTimers({ now: NOW })
    const retention = startRetention(
      { ARABLYZER_REPORT_RETENTION_DAYS: '30' },
      { store, log: (message) => logged.push(message) },
    )
    await vi.advanceTimersByTimeAsync(3 * RETENTION_SWEEP_MS)
    // The start, and each of the three sweeps after it: one line each, never the error itself.
    expect(logged.filter((message) => message.includes('Connection terminated'))).toEqual(
      Array.from({ length: 4 }, () => 'Retention: Connection terminated'),
    )
    expect(await store.get(idOf(400))).not.toBeNull()
    store.failing = false
    await vi.advanceTimersByTimeAsync(RETENTION_SWEEP_MS)
    expect(await store.get(idOf(400))).toBeNull()
    retention.stop()
  })

  it('refuses to start on a number that is not whole days, rather than keep or delete by a guess', () => {
    for (const bad of ['0', '-3', '1.5', 'thirty', '1e2']) {
      expect(
        () =>
          startRetention(
            { ARABLYZER_REPORT_RETENTION_DAYS: bad },
            { store: new MemoryScanStore(), log: () => undefined },
          ),
        bad,
      ).toThrow(/whole number of days/)
    }
  })

  it('deletes nothing for a number of days no scan is that old', async () => {
    const store = await storeWith(400)
    vi.useFakeTimers({ now: NOW })
    // Beyond what a date can hold: no scan is older than that.
    const retention = startRetention(
      { ARABLYZER_REPORT_RETENTION_DAYS: String(Number.MAX_SAFE_INTEGER) },
      { store, log: () => undefined },
    )
    await vi.advanceTimersByTimeAsync(RETENTION_SWEEP_MS)
    expect(await store.get(idOf(400))).not.toBeNull()
    retention.stop()
  })
})

describe('startRetention with accounts', () => {
  it('keeps the scans an account keeps past the global days, and deletes them after the plan’s', async () => {
    const store = await storeWith(5, 40, 100)
    store.linked.add(idOf(40))
    store.linked.add(idOf(100))
    const logged: string[] = []
    vi.useFakeTimers({ now: NOW })
    const retention = startRetention(
      {
        ARABLYZER_REPORT_RETENTION_DAYS: '30',
        ARABLYZER_ACCOUNTS: 'on',
        ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '90',
      },
      { store, log: (message) => logged.push(message) },
    )
    await vi.advanceTimersByTimeAsync(0)
    // Past the global days but kept by an account: still there. Past the plan's days: gone.
    expect(await store.get(idOf(40))).not.toBeNull()
    expect(await store.get(idOf(100))).toBeNull()
    expect(await store.get(idOf(5))).not.toBeNull()
    expect(logged.join('\n')).toMatch(/Scans an account keeps are deleted after 90 days/)
    retention.stop()
  })

  it('sweeps the accounts’ scans alone where the global number is unset', async () => {
    const store = await storeWith(400, 100)
    store.linked.add(idOf(100))
    vi.useFakeTimers({ now: NOW })
    const retention = startRetention(
      { ARABLYZER_ACCOUNTS: 'on', ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '90' },
      { store, log: () => undefined },
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(await store.get(idOf(100))).toBeNull()
    expect(await store.get(idOf(400))).not.toBeNull()
    retention.stop()
  })

  it('does not look for account scans with accounts off', async () => {
    const store = await storeWith(100)
    store.linked.add(idOf(100))
    vi.useFakeTimers({ now: NOW })
    const retention = startRetention(
      { ARABLYZER_REPORT_RETENTION_DAYS: '30' },
      { store, log: () => undefined },
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(await store.get(idOf(100))).not.toBeNull()
    retention.stop()
  })
})
