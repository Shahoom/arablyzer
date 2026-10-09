import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_AUTH_LIMITS, DEVELOPMENT_LIMITS, planCatalogFrom } from '@arablyzer/plans'
import {
  MemoryAccountData,
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'
import { createAuth } from '../src/auth'
import { CLIENT_ID, CLIENT_SECRET, stubGoogle } from './support/google'

const SITE = new URL('https://arablyzer.example')

// Accounts are optional: whoever scans without signing in meets today's path, with the switch on
// or off: no cookie set, no account table read.
function run(accountsOn: boolean) {
  const reads: string[] = []
  const watch = (name: string) =>
    new Proxy([] as unknown[], {
      get(target, key, receiver) {
        reads.push(name)
        return Reflect.get(target, key, receiver) as unknown
      },
    })
  const tables = {
    user: watch('user'),
    session: watch('session'),
    account: watch('account'),
    verification: watch('verification'),
  }
  const auth = createAuth({
    site: SITE,
    secret: 'a'.repeat(40),
    database: memoryAdapter(tables),
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    production: false,
    log: () => undefined,
  })
  let count = 0
  const scans = new MemoryScanStore()
  const app = createApp({
    limits: DEVELOPMENT_LIMITS,
    policy: DEFAULT_POLICY,
    resolver: () => Promise.resolve([{ address: '93.184.215.14', family: 4 }]),
    turnstile: () => Promise.resolve(true),
    limiter: new MemoryRateLimiter(),
    store: scans,
    queue: new MemoryScanQueue(),
    events: new MemoryScanEvents(20),
    inFlight: new MemoryInFlight(),
    address: () => '203.0.113.9',
    connectionKey: (a) => `key-of-${a}`,
    newId: () => `scan${String(++count).padStart(18, '0')}`,
    origin: SITE.origin,
    ...(accountsOn
      ? {
          accounts: {
            auth,
            limits: DEVELOPMENT_AUTH_LIMITS,
            secureCookies: false,
            data: new MemoryAccountData(scans),
            plans: planCatalogFrom({}, DEVELOPMENT_LIMITS),
          },
        }
      : {}),
  })
  const scan = (cookie?: string) =>
    app.request('/api/scans', {
      method: 'POST',
      headers: {
        origin: SITE.origin,
        'content-type': 'application/json',
        ...(cookie === undefined ? {} : { cookie }),
      },
      body: JSON.stringify({ url: 'https://example.com/', turnstileToken: 'human' }),
    })
  return { app, scan, reads }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each([true, false])('an anonymous visitor, with accounts %s', (accountsOn) => {
  it('scans, reads the report and the events, sets no cookie, and touches no account table', async () => {
    const { app, scan, reads } = run(accountsOn)
    const started = await scan()
    expect(started.status).toBe(202)
    const { id } = (await started.json()) as { id: string }
    const responses = [
      started,
      await app.request(`/api/scans/${id}`),
      await app.request(`/api/scans/${id}/events`, { headers: { accept: 'text/event-stream' } }),
      await app.request(`/api/reports/${id}`),
    ]
    for (const response of responses) {
      expect(response.headers.getSetCookie()).toEqual([])
    }
    expect(reads).toEqual([])
  })

  it("is not made anyone's by a cookie: a garbage one is ignored, a good one starts an anonymous scan", async () => {
    stubGoogle()
    const { scan, reads } = run(accountsOn)
    expect((await scan('arablyzer.session_token=garbage')).status).toBe(202)
    expect((await scan('other=cookie; theme=dark')).status).toBe(202)
    // A scan never looks the cookie up: it has no owner in this milestone.
    expect(reads).toEqual([])
  })
})
