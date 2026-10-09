import { afterEach, describe, expect, it, vi } from 'vitest'
import { startAuthMaintenance } from '../src/maintenance'

afterEach(() => {
  vi.useRealTimers()
})

describe('startAuthMaintenance', () => {
  it('sweeps at start and every interval, says a count only when something went, and stops', async () => {
    vi.useFakeTimers()
    const counts = [
      { sessions: 2, verifications: 1 },
      { sessions: 0, verifications: 0 },
    ]
    const deleteExpired = vi.fn(() =>
      Promise.resolve(counts.shift() ?? { sessions: 0, verifications: 0 }),
    )
    const log: string[] = []
    const sweeping = startAuthMaintenance({ deleteExpired }, (m) => log.push(m), {
      intervalMs: 1000,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(deleteExpired).toHaveBeenCalledTimes(1)
    expect(log).toEqual(['Accounts sweep: 2 expired sessions, 1 sign-in states'])
    await vi.advanceTimersByTimeAsync(1000)
    expect(deleteExpired).toHaveBeenCalledTimes(2)
    expect(log).toHaveLength(1)
    sweeping.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(deleteExpired).toHaveBeenCalledTimes(2)
  })

  it('survives a failing sweep, and tells it once', async () => {
    vi.useFakeTimers()
    const deleteExpired = vi.fn(() => Promise.reject(new Error('down')))
    const log: string[] = []
    const sweeping = startAuthMaintenance({ deleteExpired }, (m) => log.push(m), {
      intervalMs: 1000,
    })
    await vi.advanceTimersByTimeAsync(3000)
    expect(deleteExpired).toHaveBeenCalledTimes(4)
    expect(log).toEqual(['Accounts sweep: down'])
    sweeping.stop()
  })
})
