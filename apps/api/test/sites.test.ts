import { AccountScansResponse, SitesResponse } from '@arablyzer/api-contract'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, planCatalogFrom } from '@arablyzer/plans'
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
import type { AccountsDeps } from '../src/accounts'
import { createApp } from '../src/app'
import { createAuth } from '../src/auth'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle } from './support/google'

const SITE = new URL('https://arablyzer.example')
const PLAN = {
  ARABLYZER_PLAN_ACCOUNT_SCANS: '3',
  ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '60',
  ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '2',
  ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '2',
  ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '30',
}
// An anonymous visitor may take 1 scan in 60 s and hold 1 place: the plan above is above both.
const ANONYMOUS = {
  ...DEVELOPMENT_LIMITS,
  perConnection: { scans: 1, seconds: 60 },
  inFlight: 1,
}

function setup(options: { accounts?: boolean; turnstile?: boolean } = {}) {
  const tables: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] }
  const scans = new MemoryScanStore()
  const data = new MemoryAccountData(scans)
  const auth = createAuth({
    site: SITE,
    secret: 'a'.repeat(40),
    database: memoryAdapter(tables),
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    production: false,
    beforeDelete: (userId) => data.eraseUser(userId),
    log: () => undefined,
  })
  const accounts: AccountsDeps = {
    auth,
    limits: { signIn: { scans: 1000, seconds: 60 } },
    secureCookies: false,
    data,
    plans: planCatalogFrom(PLAN, ANONYMOUS),
  }
  let count = 0
  const asked = { turnstile: 0 }
  const app = createApp({
    limits: ANONYMOUS,
    policy: DEFAULT_POLICY,
    resolver: () => Promise.resolve([{ address: '93.184.215.14', family: 4 }]),
    turnstile: () => {
      asked.turnstile++
      return Promise.resolve(options.turnstile ?? true)
    },
    limiter: new MemoryRateLimiter(),
    store: scans,
    queue: new MemoryScanQueue(),
    events: new MemoryScanEvents(20),
    inFlight: new MemoryInFlight(),
    address: () => '203.0.113.9',
    connectionKey: (a) => `key-of-${a}`,
    newId: () => `scan${String(++count).padStart(18, '0')}`,
    origin: SITE.origin,
    ...(options.accounts === false ? {} : { accounts }),
  })
  const send = (method: string, path: string, body?: unknown, cookie?: string) =>
    app.request(path, {
      method,
      headers: {
        origin: SITE.origin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie === undefined ? {} : { cookie }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const signIn = async (sub: string) => {
    stubGoogle(idToken({ sub, email: `${sub}@example.com` }))
    const response = await send('POST', '/api/session/one-tap', {
      credential: idToken({ sub, email: `${sub}@example.com` }),
    })
    expect(response.status).toBe(200)
    return response.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
  }
  const scan = (url: string, cookie?: string) =>
    send('POST', '/api/scans', { url, turnstileToken: 'human' }, cookie)
  return { send, signIn, scan, asked, scans }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('saved sites', () => {
  it('adds, lists, answers a duplicate with the same site, and holds to the plan', async () => {
    const { send, signIn } = setup()
    const cookie = await signIn('ali')
    const first = await send('POST', '/api/sites', { url: 'https://example.com/a' }, cookie)
    expect(first.status).toBe(201)
    const site = (await first.json()) as { id: string; url: string; lastScan: unknown }
    expect(site).toMatchObject({ url: 'https://example.com/a', lastScan: null })
    const again = await send('POST', '/api/sites', { url: 'https://example.com/a' }, cookie)
    expect(again.status).toBe(200)
    expect(((await again.json()) as { id: string }).id).toBe(site.id)
    expect(
      (await send('POST', '/api/sites', { url: 'https://example.com/b' }, cookie)).status,
    ).toBe(201)
    const over = await send('POST', '/api/sites', { url: 'https://example.com/c' }, cookie)
    expect(over.status).toBe(403)
    expect(await over.json()).toEqual({ error: 'plan-limit', limit: 'savedSites', plan: 'account' })
    const list = SitesResponse.parse(
      await (await send('GET', '/api/sites', undefined, cookie)).json(),
    )
    expect(list.limit).toBe(2)
    expect(list.sites.map((s) => s.url)).toEqual(['https://example.com/a', 'https://example.com/b'])
  })

  it('refuses an address a scan would refuse, with the scan form’s own words', async () => {
    const { send, signIn } = setup()
    const cookie = await signIn('ali')
    const bad = await send('POST', '/api/sites', { url: 'not a url' }, cookie)
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid-url' })
    const internal = await send('POST', '/api/sites', { url: 'http://localhost/' }, cookie)
    expect(internal.status).toBe(422)
    expect((await send('POST', '/api/sites', { urls: 1 }, cookie)).status).toBe(400)
  })

  it('is the signed-in person’s alone: 401 without a session, 404 for another’s site', async () => {
    const { send, signIn } = setup()
    for (const [method, path] of [
      ['GET', '/api/sites'],
      ['POST', '/api/sites'],
      ['DELETE', '/api/sites/AAAAAAAAAAAAAAAAAAAAAA'],
      ['POST', '/api/sites/AAAAAAAAAAAAAAAAAAAAAA/scans'],
      ['GET', '/api/account/scans'],
    ] as const) {
      const response = await send(
        method,
        path,
        method === 'POST' && path === '/api/sites' ? { url: 'https://example.com/' } : undefined,
      )
      expect(response.status, `${method} ${path}`).toBe(401)
    }
    const ali = await signIn('ali')
    const bea = await signIn('bea')
    const made = await send('POST', '/api/sites', { url: 'https://example.com/a' }, ali)
    const { id } = (await made.json()) as { id: string }
    expect((await send('POST', `/api/sites/${id}/scans`, undefined, bea)).status).toBe(404)
    expect((await send('DELETE', `/api/sites/${id}`, undefined, bea)).status).toBe(404)
    expect((await send('DELETE', '/api/sites/not-an-id', undefined, ali)).status).toBe(404)
    expect((await send('DELETE', `/api/sites/${id}`, undefined, ali)).status).toBe(204)
    expect((await send('DELETE', `/api/sites/${id}`, undefined, ali)).status).toBe(404)
  })

  it('does not exist with accounts off', async () => {
    const { send } = setup({ accounts: false })
    for (const path of ['/api/sites', '/api/account/scans']) {
      expect((await send('GET', path)).status).toBe(404)
    }
    expect((await send('POST', '/api/sites', { url: 'https://example.com/' })).status).toBe(404)
  })
})

describe('scans of a signed-in person', () => {
  it('scans a saved site without Turnstile, and lists it in the history with the site', async () => {
    const { send, signIn, asked } = setup({ turnstile: false })
    const cookie = await signIn('ali')
    const site = (await (
      await send('POST', '/api/sites', { url: 'https://example.com/a' }, cookie)
    ).json()) as { id: string }
    const started = await send('POST', `/api/sites/${site.id}/scans`, undefined, cookie)
    expect(started.status).toBe(202)
    const { id } = (await started.json()) as { id: string }
    expect(asked.turnstile).toBe(0)
    const history = AccountScansResponse.parse(
      await (await send('GET', '/api/account/scans', undefined, cookie)).json(),
    )
    expect(history.historyDays).toBe(30)
    expect(history.scans).toEqual([
      expect.objectContaining({ id, siteId: site.id, url: 'https://example.com/a', score: null }),
    ])
    const list = SitesResponse.parse(
      await (await send('GET', '/api/sites', undefined, cookie)).json(),
    )
    expect(list.sites[0]?.lastScan?.id).toBe(id)
  })

  it('skips Turnstile for a good cookie on the scan route, and links the scan', async () => {
    const { signIn, scan, asked, send } = setup({ turnstile: false })
    const cookie = await signIn('ali')
    expect((await scan('https://example.com/free', cookie)).status).toBe(202)
    expect(asked.turnstile).toBe(0)
    const history = AccountScansResponse.parse(
      await (await send('GET', '/api/account/scans', undefined, cookie)).json(),
    )
    expect(history.scans).toHaveLength(1)
  })

  it('treats a bad cookie as an anonymous visitor: Turnstile decides, nothing is linked', async () => {
    const refused = setup({ turnstile: false })
    for (const cookie of [
      'arablyzer.session_token=garbage',
      'arablyzer.session_token=AAAA.BBBB',
      'unrelated=1',
    ]) {
      const response = await refused.scan('https://example.com/', cookie)
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'turnstile-failed' })
    }
    const passed = setup()
    const response = await passed.scan('https://example.com/', 'arablyzer.session_token=garbage')
    expect(response.status).toBe(202)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(passed.asked.turnstile).toBe(1)
  })

  it('treats a signed-out (revoked) cookie as anonymous too', async () => {
    const { send, signIn, scan, asked } = setup({ turnstile: false })
    const cookie = await signIn('ali')
    await send('DELETE', '/api/session', undefined, cookie)
    expect((await scan('https://example.com/', cookie)).status).toBe(403)
    expect(asked.turnstile).toBe(1)
  })

  it('gives the account its own quota, keyed by the account and not the address', async () => {
    const { send, signIn, scan } = setup()
    const ali = await signIn('ali')
    const bea = await signIn('bea')
    // The plan: 3 scans in 60 s, 2 places at once. The anonymous visitor at the same address: 1 and 1.
    const site = (await (
      await send('POST', '/api/sites', { url: 'https://example.com/a' }, ali)
    ).json()) as { id: string }
    expect((await send('POST', `/api/sites/${site.id}/scans`, undefined, ali)).status).toBe(202)
    expect((await scan('https://example.org/', ali)).status).toBe(202)
    // Two places are held; a third scan is refused until one ends, without any bucket being spent.
    const third = await scan('https://example.net/', ali)
    expect(third.status).toBe(429)
    // Another account at the same address has its own.
    expect((await scan('https://example.net/', bea)).status).toBe(202)
    // And the anonymous visitor at that address is still held to the anonymous numbers.
    expect((await scan('https://example.edu/')).status).toBe(202)
    const second = await scan('https://example.edu/two')
    expect(second.status).toBe(429)
  })

  it('refuses past the bucket with a wait, and the wait is the account’s', async () => {
    const { signIn, scan, scans } = setup()
    const cookie = await signIn('ali')
    const refused: Response[] = []
    for (let n = 0; n < 4; n++) {
      // Scans end as they are made, so the places are free again and only the bucket is left.
      const response = await scan(`https://example.com/${n}`, cookie)
      if (response.status === 202) {
        const { id } = (await response.json()) as { id: string }
        await scans.fail(id, new Date())
      } else refused.push(response)
    }
    expect(refused).toHaveLength(1)
    expect(refused[0]?.status).toBe(429)
    expect(Number(refused[0]?.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('takes the person’s scans with them when they erase the account', async () => {
    const { send, signIn, scan, scans } = setup()
    const cookie = await signIn('ali')
    const { id } = (await (await scan('https://example.com/', cookie)).json()) as { id: string }
    expect(await scans.get(id)).not.toBeNull()
    expect((await send('DELETE', '/api/account', { confirm: true }, cookie)).status).toBe(204)
    expect(await scans.get(id)).toBeNull()
  })
})
