import { DELETE_TOKEN_PATTERN, type ScanEvent } from '@arablyzer/api-contract'
import { DEFAULT_POLICY, type Resolver } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, type ScanLimits } from '@arablyzer/plans'
import type { Report } from '@arablyzer/report-schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, type ApiDeps } from '../src/app'
import { clientAddress, connectionKey, networkKey } from '../src/client'
import { hashDeleteToken } from '../src/ids'
import { RECORD_GRACE_MS } from '../src/places'
import {
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
  type ScanEvents,
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

// M5, issue #33: a report is opened by its link alone, so whoever made it needs a way to have it
// deleted: a token given once, with the scan's ID, and kept only as its hash.
describe('deleting a report', () => {
  interface Started {
    id: string
    deleteToken: string
  }
  const start = async (
    scanOf: ReturnType<typeof setup>['scanOf'],
    url = 'https://example.com/',
  ): Promise<Started> => (await (await scanOf(url)).json()) as Started
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
  const del = (
    app: ReturnType<typeof setup>['app'],
    id: string,
    headers: Record<string, string> = {},
  ) => app.request(`/api/reports/${id}`, { method: 'DELETE', headers })
  /** The scan store's `delete`, counted, so a test can say it was never asked. */
  const watch = (store: MemoryScanStore) => {
    const asked: string[] = []
    const original = store.delete.bind(store)
    store.delete = (id, hash) => {
      asked.push(id)
      return original(id, hash)
    }
    return asked
  }
  const finished = async (store: MemoryScanStore, id: string) => {
    await store.start(id, NOW)
    await store.finish(id, { scan: { status: 'complete' }, rules: [] } as unknown as Report, NOW)
  }

  describe('the token', () => {
    it('is given with the scan’s ID when it is created, and is not one scan’s twice', async () => {
      const { post, scanOf } = setup({ limits: { ...DEVELOPMENT_LIMITS, inFlight: 5 } })
      const response = await scanOf('https://example.com/')
      expect(response.status).toBe(202)
      const body = (await response.json()) as Started
      expect(Object.keys(body).sort()).toEqual(['deleteToken', 'id'])
      expect(body.deleteToken).toMatch(DELETE_TOKEN_PATTERN)
      const second = (await (await scanOf('https://example.org/')).json()) as Started
      expect(second.deleteToken).not.toBe(body.deleteToken)
      // A tool page's scan has one too.
      const tool = (await (
        await post({ url: 'https://example.com/', turnstileToken: 'human', tool: 'rtl-check' })
      ).json()) as Started
      expect(tool.deleteToken).toMatch(DELETE_TOKEN_PATTERN)
    })

    it('is kept as its hash alone: the store cannot give it back', async () => {
      const { scanOf, store } = setup()
      const { id, deleteToken } = await start(scanOf)
      const hash = hashDeleteToken(deleteToken)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
      expect(hash).not.toContain(deleteToken)
      // What is stored is the hash: the token itself is nothing to the store.
      expect(await store.delete(id, deleteToken)).toBe('forbidden')
      expect(await store.delete(id, hash)).toBe('deleted')
      // SHA-256, whose test vector is known.
      expect(hashDeleteToken('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      )
    })

    it('is never shown again: not with the scan, its report, its events, or an error', async () => {
      const { app, scanOf, store } = setup()
      const { id, deleteToken } = await start(scanOf)
      await finished(store, id)
      const seen = [
        await (await app.request(`/api/scans/${id}`)).text(),
        await (await app.request(`/api/reports/${id}`)).text(),
        await (await app.request(`/api/scans/${id}/events`)).text(),
        await (await del(app, id, bearer('B'.repeat(43)))).text(),
      ].join('\n')
      expect(seen).not.toContain(deleteToken)
      expect(seen).not.toContain(hashDeleteToken(deleteToken))
    })
  })

  describe('DELETE /api/reports/:id', () => {
    it('deletes the scan and its report for its token, and nothing of it is left', async () => {
      const { app, scanOf, store } = setup()
      const { id, deleteToken } = await start(scanOf)
      await finished(store, id)
      expect((await app.request(`/api/reports/${id}`)).status).toBe(200)
      const response = await del(app, id, bearer(deleteToken))
      expect(response.status).toBe(204)
      expect(await response.text()).toBe('')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
      for (const path of [`/api/reports/${id}`, `/api/scans/${id}`, `/api/scans/${id}/events`]) {
        expect((await app.request(path)).status, path).toBe(404)
      }
      expect(await store.get(id)).toBeNull()
      // Once deleted, it is not there to delete again.
      const again = await del(app, id, bearer(deleteToken))
      expect(await refusal(again)).toEqual({ status: 404, body: { error: 'not-found' } })
    })

    it('deletes a scan that has not ended, which the worker then leaves alone', async () => {
      const { app, scanOf, store } = setup()
      const { id, deleteToken } = await start(scanOf)
      expect((await del(app, id, bearer(deleteToken))).status).toBe(204)
      expect(await store.start(id, NOW)).toBe(false)
    })

    it('refuses another scan’s token, and a token that is nobody’s, and keeps the report', async () => {
      const { app, scanOf, store } = setup({ limits: { ...DEVELOPMENT_LIMITS, inFlight: 5 } })
      const first = await start(scanOf)
      const second = await start(scanOf, 'https://example.org/')
      for (const token of [
        second.deleteToken,
        'B'.repeat(43),
        first.deleteToken.slice(0, -1) + 'A',
      ]) {
        const response = await del(app, first.id, bearer(token))
        expect(await refusal(response), token).toEqual({
          status: 403,
          body: { error: 'forbidden' },
        })
      }
      expect(await store.get(first.id)).not.toBeNull()
      expect(await store.get(second.id)).not.toBeNull()
    })

    it('asks for a bearer token, and does not ask the store without one', async () => {
      const { app, scanOf, store } = setup()
      const { id, deleteToken } = await start(scanOf)
      const asked = watch(store)
      for (const authorization of [
        undefined,
        '',
        `Basic ${btoa('user:pass')}`,
        'Bearer',
        'Bearer ',
        'Bearer short',
        `Bearer ${deleteToken}A`,
        `Bearer ${deleteToken.slice(1)}`,
        `Bearer ${deleteToken} ${deleteToken}`,
        `Token ${deleteToken}`,
        deleteToken,
        `Bearer ${deleteToken.slice(0, 42)}=`,
      ]) {
        const response = await del(app, id, authorization === undefined ? {} : { authorization })
        expect(await refusal(response), String(authorization)).toEqual({
          status: 401,
          body: { error: 'unauthorized' },
        })
        expect(response.headers.get('www-authenticate')).toBe('Bearer')
      }
      expect(asked).toEqual([])
      // The scheme is not case-sensitive (RFC 7235).
      expect((await del(app, id, { authorization: `bearer ${deleteToken}` })).status).toBe(204)
    })

    it('answers 404 to an ID it cannot have given, without asking the store', async () => {
      const { app, store } = setup()
      const asked = watch(store)
      for (const id of [
        '1',
        '..%2F..%2Fetc',
        'AbCdEfGhIjKlMnOpQrSt_-x',
        'AbCdEfGhIjKlMnOpQrSt=-',
      ]) {
        const response = await del(app, id, bearer('B'.repeat(43)))
        expect(await refusal(response), id).toEqual({ status: 404, body: { error: 'not-found' } })
      }
      expect(asked).toEqual([])
      const response = await del(app, 'AbCdEfGhIjKlMnOpQrSt_-', bearer('B'.repeat(43)))
      expect(response.status).toBe(404)
      expect(asked).toEqual(['AbCdEfGhIjKlMnOpQrSt_-'])
    })

    it('needs no Origin or type: the token is what allows it, and a page cannot send one', async () => {
      const site = 'https://arablyzer.example'
      const { app } = setup({ origin: site })
      const created = await app.request('/api/scans', {
        method: 'POST',
        headers: { origin: site, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/', turnstileToken: 'human' }),
      })
      const first = (await created.json()) as Started
      // curl sends neither, and may delete the report it made.
      expect((await del(app, first.id, bearer(first.deleteToken))).status).toBe(204)
      // A page on another site cannot send the token: it needs a preflight the API never answers.
      const preflight = await app.request(`/api/reports/${first.id}`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.example',
          'access-control-request-method': 'DELETE',
          'access-control-request-headers': 'authorization',
        },
      })
      expect(preflight.status).toBe(404)
      expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
    })

    it('answers 503 when the store fails, and says so once in a while', async () => {
      const logged: string[] = []
      const { app, scanOf, store } = setup({ log: (message) => logged.push(message) })
      const { id, deleteToken } = await start(scanOf)
      store.delete = () => Promise.reject(new Error('Connection terminated'))
      const response = await del(app, id, bearer(deleteToken))
      expect(await refusal(response)).toEqual({ status: 503, body: { error: 'unavailable' } })
      expect(logged).toEqual(['API: Connection terminated'])
    })

    // Found by running the API: a report deleted right after its scan ended, and a new scan asked
    // for at once, met the deleted scan's place, which looked like a scan about to have a record.
    it('frees the place of the scan it deletes at once, when the visitor who made it deletes it', async () => {
      const { app, scanOf, inFlight } = setup({ limits: { ...DEVELOPMENT_LIMITS, inFlight: 1 } })
      const first = await start(scanOf)
      expect((await scanOf('https://example.org/')).status).toBe(429)
      expect((await del(app, first.id, bearer(first.deleteToken))).status).toBe(204)
      expect(await inFlight.held('key-of-203.0.113.9')).toEqual([])
      expect((await scanOf('https://example.org/')).status).toBe(202)
    })

    it('leaves the place of a scan it does not delete, and one another visitor holds until it is stale', async () => {
      let visitor = 1
      const { app, scanOf, inFlight } = setup({
        limits: { ...DEVELOPMENT_LIMITS, inFlight: 1 },
        address: () => `203.0.113.${visitor}`,
      })
      const first = await start(scanOf)
      // A refused deletion frees nothing.
      expect((await del(app, first.id, bearer('B'.repeat(43)))).status).toBe(403)
      expect((await inFlight.held('key-of-203.0.113.1')).map((place) => place.scanId)).toEqual([
        first.id,
      ])
      // Deleted from another address, the maker's place is not the deleter's to give back: it
      // stays until the scan is found to have no record, once the API's own timeouts have passed.
      visitor = 2
      expect((await del(app, first.id, bearer(first.deleteToken))).status).toBe(204)
      visitor = 1
      expect((await scanOf('https://example.org/')).status).toBe(429)
      await inFlight.release('key-of-203.0.113.1', [first.id])
      await inFlight.hold('key-of-203.0.113.1', first.id, 1, NOW.getTime() - RECORD_GRACE_MS - 1)
      expect((await scanOf('https://example.org/')).status).toBe(202)
    })
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

  // Issue #30: Hono prints a stream's failure with console.error, the whole error and whatever it
  // holds, which for a store's client can be the URL it connects with, and the password in it.
  describe('a stream that fails', () => {
    const SECRET = 'hunter2'
    /** Events whose follower fails the moment it is read, with what it is given. */
    const failingWith = (thrown: unknown, events: ScanEvents): ScanEvents => ({
      publish: events.publish.bind(events),
      since: events.since.bind(events),
      follow: () => ({
        [Symbol.asyncIterator]: () => ({
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          next: () => Promise.reject(thrown),
        }),
      }),
    })
    /** What a Valkey client's error can carry besides its message. */
    const failure = () =>
      Object.assign(new Error('connect ECONNREFUSED 172.19.0.3:6379'), {
        url: `redis://:${SECRET}@valkey:6379`,
        options: { password: SECRET },
      })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('is told in the log by its message alone, never as the error it is', async () => {
      const printed = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const logged: string[] = []
      const { scanOf, deps } = setup()
      const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
      const broken = createApp({
        ...deps,
        log: (message) => logged.push(message),
        events: failingWith(failure(), deps.events),
      })
      const response = await broken.request(`/api/scans/${id}/events`)
      const text = await response.text()
      expect(logged).toEqual(['API events: connect ECONNREFUSED 172.19.0.3:6379'])
      expect(printed).not.toHaveBeenCalled()
      expect(logged.join('\n')).not.toContain(SECRET)
      // The page is not told the store's own words either: a host, a port, a user name.
      expect(text).not.toContain(SECRET)
      expect(text).not.toContain('ECONNREFUSED')
      expect(text).toContain('event: error\ndata: unavailable\n\n')
    })

    it('is told once in a while, as every other failure of the API is', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const logged: string[] = []
      const { scanOf, deps } = setup()
      const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
      const broken = createApp({
        ...deps,
        log: (message) => logged.push(message),
        events: failingWith(failure(), deps.events),
      })
      for (let i = 0; i < 3; i++) await (await broken.request(`/api/scans/${id}/events`)).text()
      expect(logged).toHaveLength(1)
    })

    it('is told by its message too when the scan had ended, and what it held is not printed', async () => {
      const printed = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const logged: string[] = []
      const { scanOf, store, deps } = setup()
      const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
      await store.start(id, NOW)
      await store.finish(id, { scan: { status: 'complete' } } as unknown as Report, NOW)
      const broken = createApp({
        ...deps,
        log: (message) => logged.push(message),
        events: {
          publish: deps.events.publish.bind(deps.events),
          // An event that cannot be written out: JSON has no BigInt.
          since: () =>
            Promise.resolve([{ id: '1', event: { type: 'queued', ahead: 1n } as never }]),
          follow: deps.events.follow.bind(deps.events),
        },
      })
      const text = await (await broken.request(`/api/scans/${id}/events`)).text()
      expect(logged).toEqual(['API events: Do not know how to serialize a BigInt'])
      expect(printed).not.toHaveBeenCalled()
      expect(text).toContain('event: error\ndata: unavailable\n\n')
    })

    it('is told by a message even when what was thrown is not an error', async () => {
      const printed = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const logged: string[] = []
      const { scanOf, deps } = setup()
      const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
      const broken = createApp({
        ...deps,
        log: (message) => logged.push(message),
        events: failingWith(`redis://:${SECRET}@valkey:6379 is down`, deps.events),
      })
      const text = await (await broken.request(`/api/scans/${id}/events`)).text()
      expect(printed).not.toHaveBeenCalled()
      expect(logged.join('\n')).not.toContain(SECRET)
      expect(text).not.toContain(SECRET)
      expect(logged).toHaveLength(1)
    })

    it('frees the visitor’s stream and its scan’s, as any that ends does', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { scanOf, deps } = setup()
      const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
      const broken = createApp({
        ...deps,
        log: () => undefined,
        streams: { perScan: 1, perVisitor: 1, total: 1 },
        events: failingWith(failure(), deps.events),
      })
      for (let i = 0; i < 3; i++) {
        const response = await broken.request(`/api/scans/${id}/events`)
        expect(response.status, String(i)).toBe(200)
        await response.text()
      }
    })
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
