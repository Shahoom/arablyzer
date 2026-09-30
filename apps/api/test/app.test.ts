import type { ScanEvent } from '@arablyzer/api-contract'
import { DEFAULT_POLICY, type Resolver } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, type ScanLimits } from '@arablyzer/plans'
import type { Report } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { createApp, type ApiDeps } from '../src/app'
import { clientAddress, connectionKey, networkKey } from '../src/client'
import { RECORD_GRACE_MS } from '../src/places'
import {
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'

/** Names the tests resolve, and what to: no test asks real DNS. */
const DNS: Readonly<Record<string, readonly string[]>> = {
  'example.com': ['93.184.215.14'],
  'shop.example.com': ['93.184.215.15'],
  'example.com.': ['93.184.215.14'],
  'example.org': ['93.184.215.17'],
  'rebind.example.com': ['93.184.215.16', '10.0.0.5'],
  'metadata.example.com': ['169.254.169.254'],
}
const resolver: Resolver = (host) =>
  Promise.resolve(
    (DNS[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
  )

const NOW = new Date('2026-09-28T12:00:00Z')

function setup(overrides: Partial<ApiDeps> & { limits?: ScanLimits } = {}) {
  const store = new MemoryScanStore()
  const queue = new MemoryScanQueue()
  const events = new MemoryScanEvents(20)
  const inFlight = new MemoryInFlight()
  let count = 0
  const turnstileCalls: string[] = []
  const deps: ApiDeps = {
    limits: DEVELOPMENT_LIMITS,
    policy: DEFAULT_POLICY,
    resolver,
    turnstile: (token) => {
      turnstileCalls.push(token)
      return Promise.resolve(token === 'human')
    },
    limiter: new MemoryRateLimiter(),
    store,
    queue,
    events,
    inFlight,
    address: () => '203.0.113.9',
    connectionKey: (address) => `key-of-${address}`,
    newId: () => `scan${String(++count).padStart(18, '0')}`,
    now: () => NOW,
    ...overrides,
  }
  const app = createApp(deps)
  const post = (body: unknown, raw?: string, headers: Record<string, string> = {}) =>
    app.request('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: raw ?? JSON.stringify(body),
    })
  const scanOf = (url: string, token = 'human') => post({ url, turnstileToken: token })
  return { app, deps, store, queue, events, inFlight, post, scanOf, turnstileCalls }
}

async function refusal(response: Response) {
  const body: unknown = await response.json()
  return { status: response.status, body }
}

describe('POST /api/scans', () => {
  it('queues a public page and answers with its unguessable ID', async () => {
    const { scanOf, store, queue, events } = setup()
    const response = await scanOf('https://example.com/page')
    expect(response.status).toBe(202)
    const { id } = (await response.json()) as { id: string }
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(await store.get(id)).toMatchObject({
      url: 'https://example.com/page',
      state: 'queued',
      createdAt: NOW,
      report: null,
    })
    expect(await queue.take(AbortSignal.timeout(100))).toEqual({
      id,
      url: 'https://example.com/page',
    })
    const first = await firstEvent(events, id)
    expect(first).toEqual({ id: '1', event: { type: 'queued', ahead: 0 } })
  })

  it("queues a tool page's scan with its tool, which the scan's summary names", async () => {
    const { app, post, store, queue } = setup()
    const response = await post({
      url: 'https://example.com/',
      turnstileToken: 'human',
      tool: 'rtl-check',
    })
    expect(response.status).toBe(202)
    const { id } = (await response.json()) as { id: string }
    expect((await store.get(id))?.tool).toBe('rtl-check')
    expect(await queue.take(AbortSignal.timeout(100))).toEqual({
      id,
      url: 'https://example.com/',
      tool: 'rtl-check',
    })
    const summary = (await (await app.request(`/api/scans/${id}`)).json()) as { tool?: string }
    expect(summary.tool).toBe('rtl-check')
  })

  it('refuses a tool there is none of, and one that is not a slug', async () => {
    const { post, queue } = setup()
    for (const tool of ['no-such-tool', 'RTL-Check', '../rtl-check', 'x'.repeat(65)]) {
      const response = await post({ url: 'https://example.com/', turnstileToken: 'human', tool })
      expect(await refusal(response), tool).toEqual({ status: 400, body: { error: 'bad-request' } })
    }
    expect(await queue.waiting()).toBe(0)
  })

  it('reads only a small JSON body with the two fields the form sends', async () => {
    const { post } = setup()
    for (const response of [
      await post(null, 'not json'),
      await post({ url: 'https://example.com/' }),
      await post({ url: 'https://example.com/', turnstileToken: 'human', admin: true }),
      await post(
        null,
        JSON.stringify({ url: 'https://example.com/', turnstileToken: 'x'.repeat(9000) }),
      ),
    ]) {
      expect(await refusal(response)).toEqual({ status: 400, body: { error: 'bad-request' } })
    }
  })

  it('refuses URLs as the CLI does, before asking Turnstile', async () => {
    const { scanOf, turnstileCalls } = setup()
    const cases: [string, number, string][] = [
      ['not a url', 400, 'invalid-url'],
      ['ftp://example.com/', 400, 'unsupported-scheme'],
      ['https://user:pass@example.com/', 400, 'credentials-in-url'],
      ['https://example.com:8080/', 400, 'port-not-allowed'],
      ['http://localhost/', 422, 'blocked-host'],
      ['http://intranet/', 422, 'blocked-host'],
      ['http://127.0.0.1/', 422, 'blocked-address'],
    ]
    for (const [url, status, error] of cases) {
      expect(await refusal(await scanOf(url)), url).toEqual({ status, body: { error } })
    }
    expect(turnstileCalls.filter((token) => token !== 'human')).toEqual([])
    // The loopback address passes the syntax checks and is refused by its DNS-free address check.
    expect(turnstileCalls).toHaveLength(1)
  })

  it('refuses a name whose answers include one private address, or none', async () => {
    const { scanOf } = setup()
    expect(await refusal(await scanOf('https://rebind.example.com/'))).toEqual({
      status: 422,
      body: { error: 'blocked-address' },
    })
    expect(await refusal(await scanOf('https://metadata.example.com/'))).toEqual({
      status: 422,
      body: { error: 'blocked-address' },
    })
    expect(await refusal(await scanOf('https://nowhere.example.com/'))).toEqual({
      status: 422,
      body: { error: 'dns-failed' },
    })
  })

  it('refuses when Turnstile does not confirm a person', async () => {
    const { scanOf } = setup()
    expect(await refusal(await scanOf('https://example.com/', 'bot'))).toEqual({
      status: 403,
      body: { error: 'turnstile-failed' },
    })
  })

  it('refuses when it cannot tell who is asking, since it could not keep the limit', async () => {
    const { scanOf } = setup({ address: () => null })
    expect(await refusal(await scanOf('https://example.com/'))).toEqual({
      status: 503,
      body: { error: 'unavailable' },
    })
  })

  it('keeps each connection to its limit, and says when it may scan again', async () => {
    const { scanOf } = setup({
      limits: { ...DEVELOPMENT_LIMITS, perConnection: { scans: 2, seconds: 3600 } },
    })
    expect((await scanOf('https://example.com/1')).status).toBe(202)
    expect((await scanOf('https://example.com/2')).status).toBe(202)
    const third = await scanOf('https://example.com/3')
    expect(third.status).toBe(429)
    expect(third.headers.get('retry-after')).toBe('1800')
    expect(await third.json()).toEqual({ error: 'rate-limited', retryAfterSeconds: 1800 })
  })

  it('keeps each site to its limit, whoever asks and whichever of its names they use', async () => {
    let visitor = 0
    const { scanOf } = setup({
      limits: { ...DEVELOPMENT_LIMITS, perHost: { scans: 1, seconds: 3600 } },
      address: () => `203.0.113.${++visitor}`,
    })
    expect((await scanOf('https://example.com/')).status).toBe(202)
    expect((await scanOf('https://example.com/other')).status).toBe(429)
    expect((await scanOf('https://example.com./')).status).toBe(429)
    expect((await scanOf('https://shop.example.com/')).status).toBe(429)
    expect((await scanOf('https://example.org/')).status).toBe(202)
  })

  // Issue #30: Turnstile was asked before any throttle, so every request, whatever its token,
  // cost a call to Cloudflare, and a visitor could make as many as they liked.
  describe('the throttle before Turnstile', () => {
    const throttled = (attempts: number) => ({
      limits: { ...DEVELOPMENT_LIMITS, attempts: { scans: attempts, seconds: 3600 } },
    })

    it('stops a visitor’s requests before they reach Cloudflare, whatever their tokens', async () => {
      const { scanOf, turnstileCalls } = setup(throttled(3))
      for (let i = 0; i < 3; i++) {
        expect((await scanOf('https://example.com/', `bot-${i}`)).status).toBe(403)
      }
      const fourth = await scanOf('https://example.com/', 'bot-3')
      expect(fourth.status).toBe(429)
      expect(fourth.headers.get('retry-after')).toBe('1200')
      expect(await fourth.json()).toEqual({ error: 'rate-limited', retryAfterSeconds: 1200 })
      expect(turnstileCalls).toEqual(['bot-0', 'bot-1', 'bot-2'])
    })

    it('counts the requests that fail and those that scan alike', async () => {
      const { scanOf, turnstileCalls } = setup(throttled(2))
      expect((await scanOf('https://example.com/', 'bot')).status).toBe(403)
      expect((await scanOf('https://example.com/', 'human')).status).toBe(202)
      expect((await scanOf('https://example.com/', 'human')).status).toBe(429)
      expect(turnstileCalls).toEqual(['bot', 'human'])
    })

    it('counts each visitor by themselves', async () => {
      let visitor = 0
      const { scanOf, turnstileCalls } = setup({
        ...throttled(1),
        address: () => `203.0.113.${++visitor}`,
      })
      for (let i = 0; i < 6; i++) expect((await scanOf('https://example.com/')).status).toBe(202)
      expect(turnstileCalls).toHaveLength(6)
    })

    it('leaves alone the requests refused before any network, which cost nothing to answer', async () => {
      const { scanOf, turnstileCalls } = setup(throttled(1))
      for (let i = 0; i < 5; i++) {
        expect((await scanOf('not a url')).status).toBe(400)
        expect((await scanOf('http://localhost/')).status).toBe(422)
      }
      expect(turnstileCalls).toEqual([])
      // The visitor still has the request the throttle allows.
      expect((await scanOf('https://example.com/')).status).toBe(202)
    })

    it('asks nobody about the visitor when it cannot tell who they are', async () => {
      const { scanOf, turnstileCalls } = setup({ ...throttled(1), address: () => null })
      expect((await scanOf('https://example.com/')).status).toBe(503)
      expect(turnstileCalls).toEqual([])
    })
  })

  it('answers 503 when a store fails, and fails a scan it could not queue', async () => {
    const logged: string[] = []
    const { scanOf, store, events, queue } = setup({ log: (message) => logged.push(message) })
    queue.add = () => Promise.reject(new Error('Connection is closed.'))
    const response = await scanOf('https://example.com/')
    expect(await refusal(response)).toEqual({ status: 503, body: { error: 'unavailable' } })
    const id = `scan${'1'.padStart(18, '0')}`
    expect(await store.get(id)).toMatchObject({ state: 'failed', report: null })
    expect((await events.since(id, null)).map((stored) => stored.event)).toEqual([
      { type: 'queued', ahead: 0 },
      { type: 'error' },
    ])
    expect(logged).toEqual(['API: Connection is closed.'])
    store.get = () => Promise.reject(new Error('Connection terminated'))
    expect((await setupRead(store)).status).toBe(503)
  })

  it('refuses new scans when the queue is full', async () => {
    const { scanOf } = setup({ limits: { ...DEVELOPMENT_LIMITS, queue: 1 } })
    expect((await scanOf('https://example.com/1')).status).toBe(202)
    expect(await refusal(await scanOf('https://example.com/2'))).toEqual({
      status: 503,
      body: { error: 'unavailable' },
    })
  })
})

describe('visitors on IPv6', () => {
  const SECRET = 'a-secret-for-the-tests'
  /** The real keys, from the address the site's server puts last in X-Forwarded-For. */
  const keyed = {
    address: (c: Parameters<ApiDeps['address']>[0]) => clientAddress(c, 'proxy'),
    connectionKey: (address: string, now: Date) => connectionKey(address, SECRET, now),
    networkKey: (address: string, now: Date) => networkKey(address, SECRET, now),
  }
  const scanFrom = (
    post: ReturnType<typeof setup>['post'],
    address: string,
    url = 'https://example.com/',
  ) => post({ url, turnstileToken: 'human' }, undefined, { 'x-forwarded-for': address })

  // Issue #30: a routed /48 has 65,536 /64s, and each was a visitor with a limit of its own.
  it('counts a visitor by their /48: the /64s of one /48 share a limit', async () => {
    const { post } = setup({
      ...keyed,
      limits: {
        ...DEVELOPMENT_LIMITS,
        perConnection: { scans: 2, seconds: 3600 },
        perHost: { scans: 1000, seconds: 3600 },
      },
    })
    expect((await scanFrom(post, '2001:db8:1:1::1')).status).toBe(202)
    expect((await scanFrom(post, '2001:db8:1:2::1')).status).toBe(202)
    const third = await scanFrom(post, '2001:db8:1:3::1')
    expect(third.status).toBe(429)
    expect(third.headers.get('retry-after')).toBe('1800')
    // Another /48, another visitor.
    expect((await scanFrom(post, '2001:db8:2:1::1')).status).toBe(202)
  })

  it('counts the visitors of one /32 together, whichever of its /48s they are in', async () => {
    const { post } = setup({
      ...keyed,
      limits: {
        ...DEVELOPMENT_LIMITS,
        perNetwork: { scans: 2, seconds: 3600 },
        perHost: { scans: 1000, seconds: 3600 },
      },
    })
    expect((await scanFrom(post, '2001:db8:1::1')).status).toBe(202)
    expect((await scanFrom(post, '2001:db8:2::1')).status).toBe(202)
    const third = await scanFrom(post, '2001:db8:3::1')
    expect(await refusal(third)).toEqual({
      status: 429,
      body: { error: 'rate-limited', retryAfterSeconds: 1800 },
    })
    expect(third.headers.get('retry-after')).toBe('1800')
    // Another /32 is another network.
    expect((await scanFrom(post, '2001:db9::1')).status).toBe(202)
  })

  it('has no network for an IPv4 visitor, whose own address is counted', async () => {
    const { post } = setup({
      ...keyed,
      limits: {
        ...DEVELOPMENT_LIMITS,
        perNetwork: { scans: 1, seconds: 3600 },
        perHost: { scans: 1000, seconds: 3600 },
      },
    })
    for (const address of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      expect((await scanFrom(post, address)).status, address).toBe(202)
    }
  })

  it('counts against the network only what the visitor’s own limit let through', async () => {
    const { post } = setup({
      ...keyed,
      limits: {
        ...DEVELOPMENT_LIMITS,
        perConnection: { scans: 1, seconds: 3600 },
        perNetwork: { scans: 2, seconds: 3600 },
        perHost: { scans: 1000, seconds: 3600 },
      },
    })
    expect((await scanFrom(post, '2001:db8:1::1')).status).toBe(202)
    // Refused by the visitor's own limit, so it takes nothing of the network's.
    expect((await scanFrom(post, '2001:db8:1::1')).status).toBe(429)
    expect((await scanFrom(post, '2001:db8:2::1')).status).toBe(202)
    // Two scans have been started in the network, and the network's second is spent.
    expect((await scanFrom(post, '2001:db8:3::1')).status).toBe(429)
  })
})

// Issue #30: the API read whatever body it was sent as JSON, whatever its type, so a page on any
// site could POST to it with a "simple" request, which no preflight guards, and spend a visitor's
// limits or fill the queue from their browsers.
describe('who may start a scan', () => {
  const SITE = 'https://arablyzer.example'
  /** The headers of a request from this origin, with this type; null for none of either. */
  const from = (origin: string | null, type: string | null = 'application/json') => ({
    ...(origin === null ? {} : { origin }),
    ...(type === null ? {} : { 'content-type': type }),
  })
  /**
   * A POST with exactly these headers: a string body would add a text type of its own, so the
   * body is bytes.
   */
  const send = (
    app: ReturnType<typeof setup>['app'],
    headers: Record<string, string>,
    body = JSON.stringify({ url: 'https://example.com/', turnstileToken: 'human' }),
  ) => app.request('/api/scans', { method: 'POST', headers, body: new TextEncoder().encode(body) })

  describe('the body’s type', () => {
    it('takes application/json, in any case, with parameters', async () => {
      const { app } = setup({ limits: { ...DEVELOPMENT_LIMITS, inFlight: 5 } })
      for (const type of [
        'application/json',
        'Application/JSON',
        'application/json; charset=utf-8',
      ]) {
        expect((await send(app, from(null, type))).status, type).toBe(202)
      }
    })

    it('refuses every other type, and none, before it reads the body or asks anyone', async () => {
      const { app, turnstileCalls, queue } = setup()
      for (const type of [
        'text/plain',
        'text/plain;charset=UTF-8',
        'application/x-www-form-urlencoded',
        'multipart/form-data; boundary=x',
        'text/json',
        'application/jsonp',
        'application/json-seq',
        'application/vnd.api+json',
        'application/ json',
        '',
        null,
      ]) {
        const response = await send(app, from(null, type))
        expect(await refusal(response), String(type)).toEqual({
          status: 400,
          body: { error: 'bad-request' },
        })
      }
      expect(turnstileCalls).toEqual([])
      expect(await queue.waiting()).toBe(0)
    })
  })

  describe('the request’s origin', () => {
    it('takes a request from the site, and refuses one from any other origin', async () => {
      const { app, queue } = setup({ origin: SITE })
      expect((await send(app, from(SITE))).status).toBe(202)
      for (const origin of [
        'https://evil.example',
        'null',
        'http://arablyzer.example',
        'https://arablyzer.example:8443',
        'https://arablyzer.example.evil.example',
        'https://www.arablyzer.example',
        'https://arablyzer.example/',
        'https://ARABLYZER.example',
        SITE.toUpperCase(),
        '',
      ]) {
        const response = await send(app, from(origin))
        expect(await refusal(response), origin).toEqual({
          status: 400,
          body: { error: 'bad-request' },
        })
      }
      expect(await queue.waiting()).toBe(1)
    })

    it('refuses a request with no origin: a browser always sends one with a POST', async () => {
      const { app } = setup({ origin: SITE })
      expect((await send(app, from(null))).status).toBe(400)
    })

    it('asks no origin where the site’s is not set, as in development', async () => {
      const { app } = setup()
      expect((await send(app, from('http://localhost:4321'))).status).toBe(202)
      expect((await send(app, from(null))).status).toBe(202)
    })

    it('refuses before Turnstile, before the throttle, and at no cost to the visitor', async () => {
      const { app, turnstileCalls } = setup({
        origin: SITE,
        limits: { ...DEVELOPMENT_LIMITS, attempts: { scans: 1, seconds: 3600 } },
      })
      for (let i = 0; i < 5; i++)
        expect((await send(app, from('https://evil.example'))).status).toBe(400)
      expect(turnstileCalls).toEqual([])
      // Not one of them was counted against the visitor, whose own request is still let through.
      expect((await send(app, from(SITE))).status).toBe(202)
    })

    it('says so in the log, once in a while, and never with what the request sent', async () => {
      const logged: string[] = []
      const { app } = setup({ origin: SITE, log: (message) => logged.push(message) })
      for (let i = 0; i < 4; i++) await send(app, from('https://evil.example/attack?token=secret'))
      expect(logged).toHaveLength(1)
      expect(logged[0]).toMatch(/origin/i)
      expect(logged[0]).not.toContain('evil')
      expect(logged[0]).not.toContain('secret')
    })

    it('answers no preflight, so a page on another site cannot send JSON to it', async () => {
      const { app } = setup({ origin: SITE })
      const response = await app.request('/api/scans', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.example',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      })
      expect(response.status).toBe(404)
      expect(
        [...response.headers.keys()].filter((name) => name.startsWith('access-control')),
      ).toEqual([])
    })
  })
})

describe('the scans a visitor has in flight', () => {
  const capped = (inFlight: number) => ({ limits: { ...DEVELOPMENT_LIMITS, inFlight } })
  /** The key `setup` gives the visitor at 203.0.113.9. */
  const VISITOR = 'key-of-203.0.113.9'

  // Issue #30: one visitor could fill the queue, which holds fifty scans and runs one at a time.
  it('refuses a scan past the visitor’s cap, while their others are queued or running', async () => {
    const { scanOf, queue } = setup(capped(2))
    expect((await scanOf('https://example.com/1')).status).toBe(202)
    expect((await scanOf('https://example.com/2')).status).toBe(202)
    const third = await scanOf('https://example.org/3')
    expect(await refusal(third)).toEqual({ status: 429, body: { error: 'rate-limited' } })
    // No time to try again is told: no one knows when a scan ends.
    expect(third.headers.get('retry-after')).toBeNull()
    expect(await queue.waiting()).toBe(2)
  })

  it('counts a running scan as well as a queued one, and gives the place back when it ends', async () => {
    const { scanOf, store } = setup(capped(1))
    const { id } = (await (await scanOf('https://example.com/1')).json()) as { id: string }
    await store.start(id, NOW)
    expect((await scanOf('https://example.org/2')).status).toBe(429)
    await store.finish(id, { scan: { status: 'complete' } } as unknown as Report, NOW)
    expect((await scanOf('https://example.org/2')).status).toBe(202)
  })

  it('gives the place back of a scan that failed, or ended without a report', async () => {
    const { scanOf, store } = setup(capped(1))
    const first = (await (await scanOf('https://example.com/1')).json()) as { id: string }
    await store.fail(first.id, NOW)
    const second = await scanOf('https://example.org/2')
    expect(second.status).toBe(202)
    const { id } = (await second.json()) as { id: string }
    await store.start(id, NOW)
    await store.finish(id, { scan: { status: 'partial' } } as unknown as Report, NOW)
    expect((await scanOf('https://example.com/3')).status).toBe(202)
  })

  it('counts each visitor by themselves', async () => {
    let visitor = 0
    const { scanOf } = setup({ ...capped(1), address: () => `203.0.113.${++visitor}` })
    for (let i = 0; i < 4; i++) {
      expect((await scanOf(`https://example.com/${i}`)).status, String(i)).toBe(202)
    }
  })

  it('gives the place back of a request refused for its name', async () => {
    const { scanOf, inFlight } = setup(capped(1))
    expect((await scanOf('https://nowhere.example.com/')).status).toBe(422)
    expect((await scanOf('https://rebind.example.com/')).status).toBe(422)
    expect(await inFlight.held(VISITOR)).toEqual([])
    expect((await scanOf('https://example.com/')).status).toBe(202)
  })

  it('gives the place back of a request refused for its site’s limit', async () => {
    const { scanOf, inFlight } = setup({
      limits: { ...DEVELOPMENT_LIMITS, inFlight: 2, perHost: { scans: 1, seconds: 3600 } },
    })
    const first = (await (await scanOf('https://example.com/')).json()) as { id: string }
    expect((await scanOf('https://example.com/other')).status).toBe(429)
    expect((await inFlight.held(VISITOR)).map((place) => place.scanId)).toEqual([first.id])
  })

  it('gives the place back of a request refused because the queue is full', async () => {
    const { scanOf, inFlight } = setup({
      limits: { ...DEVELOPMENT_LIMITS, inFlight: 2, queue: 1 },
    })
    const first = (await (await scanOf('https://example.com/')).json()) as { id: string }
    expect((await scanOf('https://example.org/')).status).toBe(503)
    expect((await inFlight.held(VISITOR)).map((place) => place.scanId)).toEqual([first.id])
  })

  it('gives the place back when the scan cannot be stored or queued', async () => {
    const { scanOf, store, queue, inFlight } = setup({ ...capped(1), log: () => undefined })
    store.create = () => Promise.reject(new Error('Connection terminated'))
    expect((await scanOf('https://example.com/')).status).toBe(503)
    expect(await inFlight.held(VISITOR)).toEqual([])
    store.create = MemoryScanStore.prototype.create.bind(store)
    queue.add = () => Promise.reject(new Error('Connection is closed.'))
    expect((await scanOf('https://example.com/')).status).toBe(503)
    expect(await inFlight.held(VISITOR)).toEqual([])
  })

  it('looks up no name for a visitor at their cap', async () => {
    const asked: string[] = []
    const { scanOf } = setup({
      ...capped(1),
      resolver: (host, ...rest) => {
        asked.push(host)
        return resolver(host, ...rest)
      },
    })
    expect((await scanOf('https://example.com/')).status).toBe(202)
    asked.length = 0
    expect((await scanOf('https://example.org/')).status).toBe(429)
    expect(asked).toEqual([])
  })

  it('holds a burst of requests at once to the cap', async () => {
    const { scanOf, queue } = setup({
      ...capped(2),
      limits: { ...DEVELOPMENT_LIMITS, inFlight: 2, attempts: { scans: 100, seconds: 3600 } },
    })
    const statuses = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => (await scanOf(`https://example.com/${i}`)).status),
    )
    expect(statuses.filter((status) => status === 202)).toHaveLength(2)
    expect(statuses.filter((status) => status === 429)).toHaveLength(10)
    expect(await queue.waiting()).toBe(2)
  })

  // A place is taken before the scan's record is made: a place with no record is a scan that is
  // about to have one, until the API's own timeouts say it is not coming (a scan deleted since).
  it('keeps a place whose scan has no record yet, and drops it once it should have one', async () => {
    const { scanOf, inFlight } = setup(capped(1))
    const at = NOW.getTime()
    await inFlight.hold(VISITOR, 'being-made', 1, at - 1000)
    expect((await scanOf('https://example.com/')).status).toBe(429)
    await inFlight.release(VISITOR, ['being-made'])
    await inFlight.hold(VISITOR, 'deleted-since', 1, at - RECORD_GRACE_MS - 1)
    expect((await scanOf('https://example.com/')).status).toBe(202)
    expect((await inFlight.held(VISITOR)).map((place) => place.scanId)).not.toContain(
      'deleted-since',
    )
  })
})

describe('reading a scan', () => {
  it('shows the scan, then its report once it is done', async () => {
    const { app, scanOf, store } = setup()
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    expect(await (await app.request(`/api/scans/${id}`)).json()).toEqual({
      id,
      url: 'https://example.com/',
      state: 'queued',
      createdAt: NOW.toISOString(),
    })
    expect((await app.request(`/api/reports/${id}`)).status).toBe(409)
    const report = { scan: { status: 'partial' } } as unknown as Report
    await store.start(id, NOW)
    await store.finish(id, report, NOW)
    const answer = await app.request(`/api/reports/${id}`)
    expect(answer.status).toBe(200)
    expect(await answer.json()).toEqual(report)
    expect(answer.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(answer.headers.get('cache-control')).toBe('no-store')
  })

  it('has no report for a scan that could not run, and nothing for an unknown ID', async () => {
    const { app, scanOf, store } = setup()
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    await store.fail(id, NOW)
    expect((await app.request(`/api/reports/${id}`)).status).toBe(404)
    expect((await app.request('/api/reports/AbCdEfGhIjKlMnOpQrSt_-')).status).toBe(404)
    expect((await app.request('/api/scans/..%2F..%2Fetc')).status).toBe(404)
  })
})

describe('GET /api/scans/:id/events', () => {
  it('streams the steps from the start, and ends with the scan', async () => {
    const { app, scanOf, events } = setup()
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    const steps: ScanEvent[] = [
      { type: 'started', engines: ['chromium'] },
      { type: 'page', status: 200, contentType: 'text/html', error: null },
      { type: 'done', state: 'complete' },
    ]
    for (const step of steps) await events.publish(id, step)
    const response = await app.request(`/api/scans/${id}/events`)
    expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/)
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(parse(await response.text())).toEqual([
      { id: '1', event: { type: 'queued', ahead: 0 } },
      { id: '2', event: steps[0] },
      { id: '3', event: steps[1] },
      { id: '4', event: steps[2] },
    ])
  })

  it('resumes after the last event the page saw', async () => {
    const { app, scanOf, events } = setup()
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    await events.publish(id, { type: 'started', engines: ['chromium'] })
    await events.publish(id, { type: 'error' })
    const response = await app.request(`/api/scans/${id}/events`, {
      headers: { 'last-event-id': '2' },
    })
    expect(parse(await response.text())).toEqual([{ id: '3', event: { type: 'error' } }])
  })

  it('ends the stream of a scan that finished without its last event', async () => {
    const { app, scanOf, store } = setup()
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    await store.start(id, NOW)
    await store.finish(id, { scan: { status: 'complete' } } as unknown as Report, NOW)
    const text = await (await app.request(`/api/scans/${id}/events`)).text()
    expect(parse(text).at(-1)).toEqual({ id: null, event: { type: 'done', state: 'complete' } })
  })

  it('ends with error a scan that could not run, when its own end was lost', async () => {
    const { app, scanOf, store } = setup()
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    await store.fail(id, NOW)
    const text = await (await app.request(`/api/scans/${id}/events`)).text()
    expect(parse(text).map((sent) => sent.event)).toEqual([
      { type: 'queued', ahead: 0 },
      { type: 'error' },
    ])
  })

  it('answers 204 to a page that has seen every event of a scan that ended', async () => {
    const { app, scanOf, store, events } = setup()
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    await store.start(id, NOW)
    await store.finish(id, { scan: { status: 'complete' } } as unknown as Report, NOW)
    const last = await events.publish(id, { type: 'done', state: 'complete' })
    const response = await app.request(`/api/scans/${id}/events`, {
      headers: { 'last-event-id': last },
    })
    expect(response.status).toBe(204)
  })

  it('pings while nothing happens, as a named event the page can see', async () => {
    // Streams end after 100 ms here, and the stores' heartbeat comes every 20 ms.
    const { app, scanOf } = setup({ streamMs: 100 })
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    const text = await (await app.request(`/api/scans/${id}/events`)).text()
    expect(text).toContain('event: ping\ndata: \n\n')
  })

  it('sends the real end when it comes after the scan is seen finished', async () => {
    const { deps, scanOf, store, events } = setup()
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    await store.start(id, NOW)
    // The follower hears nothing (its read timed out) just as the scan ends and says so.
    const late = createApp({
      ...deps,
      events: {
        publish: events.publish.bind(events),
        since: events.since.bind(events),
        async *follow() {
          await store.finish(id, { scan: { status: 'partial' } } as unknown as Report, NOW)
          await events.publish(id, { type: 'done', state: 'partial' })
          yield null
        },
      },
    })
    const sent = parse(await (await late.request(`/api/scans/${id}/events`)).text())
    expect(sent.map((one) => one.event)).toEqual([
      { type: 'queued', ahead: 0 },
      { type: 'done', state: 'partial' },
    ])
    expect(sent.at(-1)?.id).toBe('2')
  })

  it('caps the streams open on one scan, and frees each as it ends', async () => {
    const { app, scanOf } = setup({ streams: { perScan: 1, perVisitor: 8, total: 100 } })
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    const first = new AbortController()
    const open = await app.request(`/api/scans/${id}/events`, { signal: first.signal })
    expect(open.status).toBe(200)
    const refused = await app.request(`/api/scans/${id}/events`)
    expect(await refusal(refused)).toEqual({
      status: 429,
      body: { error: 'rate-limited', retryAfterSeconds: 30 },
    })
    first.abort()
    await open.body?.cancel().catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 50))
    const again = new AbortController()
    const reopened = await app.request(`/api/scans/${id}/events`, { signal: again.signal })
    expect(reopened.status).toBe(200)
    again.abort()
    await reopened.body?.cancel().catch(() => undefined)
  })

  it('caps the streams of one visitor across scans', async () => {
    const { app, scanOf } = setup({ streams: { perScan: 8, perVisitor: 1, total: 100 } })
    const ids = []
    for (const url of ['https://example.com/1', 'https://example.com/2']) {
      ids.push(((await (await scanOf(url)).json()) as { id: string }).id)
    }
    const first = new AbortController()
    const open = await app.request(`/api/scans/${ids[0] ?? ''}/events`, { signal: first.signal })
    expect(open.status).toBe(200)
    expect((await app.request(`/api/scans/${ids[1] ?? ''}/events`)).status).toBe(429)
    first.abort()
    await open.body?.cancel().catch(() => undefined)
  })

  it('ends every open stream when the server shuts down', async () => {
    const shutdown = new AbortController()
    const { app, scanOf } = setup({ shutdown: shutdown.signal })
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    const response = await app.request(`/api/scans/${id}/events`)
    setTimeout(() => {
      shutdown.abort()
    }, 30)
    const text = await response.text()
    expect(parse(text).map((sent) => sent.event)).toEqual([{ type: 'queued', ahead: 0 }])
  })
})

/** A read of a scan on a store that fails. */
async function setupRead(store: MemoryScanStore) {
  const { app } = setup({ store })
  return app.request('/api/scans/AbCdEfGhIjKlMnOpQrSt_-')
}

/** The stream's events, with their IDs; its pings aside. */
function parse(text: string): { id: string | null; event: unknown }[] {
  return text
    .split('\n\n')
    .filter((block) => block.includes('data:') && !block.split('\n').includes('event: ping'))
    .map((block) => {
      const lines = block.split('\n')
      const id =
        lines
          .find((line) => line.startsWith('id:'))
          ?.slice(3)
          .trim() ?? null
      const data =
        lines
          .find((line) => line.startsWith('data:'))
          ?.slice(5)
          .trim() ?? ''
      return { id, event: JSON.parse(data) as unknown }
    })
}

async function firstEvent(events: MemoryScanEvents, id: string) {
  const stop = new AbortController()
  for await (const stored of events.follow(id, null, stop.signal)) {
    stop.abort()
    return stored
  }
  return null
}
