import { describe, expect, it } from 'vitest'
import { ApiError, type Scan } from '../src/client'
import { POLL_DELAYS_MS, waitForScan } from '../src/wait'

const scan = (state: Scan['state']): Scan => ({
  id: 'AbCdEfGhIjKlMnOpQrSt_-',
  url: 'https://example.com/',
  state,
  tool: null,
  createdAt: '2026-10-11T12:00:00.000Z',
  score: null,
  links: { status: '/s', report: '/r', page: '/p' },
})

/** A clock the fake sleep moves. */
function clock() {
  let time = 0
  return {
    now: () => time,
    sleeps: [] as number[],
    sleep(ms: number) {
      this.sleeps.push(ms)
      time += ms
      return Promise.resolve()
    },
  }
}

describe('waiting for a scan', () => {
  it('returns at once for a scan already final (a reused one)', async () => {
    const c = clock()
    const done = scan('complete')
    const result = await waitForScan({
      client: { getScan: () => Promise.reject(new Error('not asked')) },
      scanId: done.id,
      first: done,
      timeoutMs: 60_000,
      sleep: c.sleep.bind(c),
      now: c.now,
    })
    expect(result).toBe(done)
    expect(c.sleeps).toEqual([])
  })

  it('asks politely: delays grow, then repeat the last, until the scan is final', async () => {
    const c = clock()
    const states: Scan['state'][] = Array(9).fill('running') as Scan['state'][]
    states.push('partial')
    const seen: string[] = []
    const result = await waitForScan({
      client: { getScan: () => Promise.resolve(scan(states.shift() ?? 'failed')) },
      scanId: 'x',
      first: scan('queued'),
      timeoutMs: 600_000,
      sleep: c.sleep.bind(c),
      now: c.now,
      onState: (s) => seen.push(s.state),
    })
    expect(result.state).toBe('partial')
    expect(c.sleeps.slice(0, POLL_DELAYS_MS.length)).toEqual([...POLL_DELAYS_MS])
    expect(c.sleeps.at(-1)).toBe(10_000)
    expect(seen[0]).toBe('queued')
  })

  it('stops with a timeout instead of waiting past the deadline', async () => {
    const c = clock()
    const error = await waitForScan({
      client: { getScan: () => Promise.resolve(scan('running')) },
      scanId: 'x',
      first: scan('queued'),
      timeoutMs: 10_000,
      sleep: c.sleep.bind(c),
      now: c.now,
    }).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'timeout' })
    expect(c.now()).toBeLessThanOrEqual(10_000)
  })

  it('obeys Retry-After on a 429 and goes on', async () => {
    const c = clock()
    let calls = 0
    const result = await waitForScan({
      client: {
        getScan: () => {
          calls++
          return calls === 1
            ? Promise.reject(new ApiError('rate_limited', 'slow', 429, { retryAfterSeconds: 20 }))
            : Promise.resolve(scan('complete'))
        },
      },
      scanId: 'x',
      first: scan('running'),
      timeoutMs: 120_000,
      sleep: c.sleep.bind(c),
      now: c.now,
    })
    expect(result.state).toBe('complete')
    expect(c.sleeps).toContain(20_000)
  })

  it('rides out a couple of dropped connections, but not a rejected key', async () => {
    const c = clock()
    let calls = 0
    const ok = await waitForScan({
      client: {
        getScan: () =>
          ++calls <= 2
            ? Promise.reject(new ApiError('network', 'down', 0))
            : Promise.resolve(scan('complete')),
      },
      scanId: 'x',
      first: scan('running'),
      timeoutMs: 120_000,
      sleep: c.sleep.bind(c),
      now: c.now,
    })
    expect(ok.state).toBe('complete')

    const denied = await waitForScan({
      client: { getScan: () => Promise.reject(new ApiError('unauthorized', 'no', 401)) },
      scanId: 'x',
      first: scan('running'),
      timeoutMs: 120_000,
      sleep: c.sleep.bind(c),
      now: c.now,
    }).catch((e: unknown) => e)
    expect(denied).toMatchObject({ code: 'unauthorized' })

    const gone = await waitForScan({
      client: { getScan: () => Promise.reject(new ApiError('unavailable', 'down', 503)) },
      scanId: 'x',
      first: scan('running'),
      timeoutMs: 600_000,
      sleep: c.sleep.bind(c),
      now: c.now,
    }).catch((e: unknown) => e)
    expect(gone).toMatchObject({ code: 'unavailable' })
  })
})
