import type { ScanEvent } from '@arablyzer/api-contract'
import { DEFAULT_POLICY, type Resolver } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, type ScanLimits } from '@arablyzer/plans'
import type { Report } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { createApp, type ApiDeps } from '../src/app'
import {
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'

/** Names the tests resolve, and what to: no test asks real DNS. */
const DNS: Readonly<Record<string, readonly string[]>> = {
  'example.com': ['93.184.215.14'],
  'shop.example.com': ['93.184.215.15'],
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
    address: () => '203.0.113.9',
    connectionKey: (address) => `key-of-${address}`,
    newId: () => `scan${String(++count).padStart(18, '0')}`,
    now: () => NOW,
    ...overrides,
  }
  const app = createApp(deps)
  const post = (body: unknown, raw?: string) =>
    app.request('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    })
  const scanOf = (url: string, token = 'human') => post({ url, turnstileToken: token })
  return { app, deps, store, queue, events, post, scanOf, turnstileCalls }
}

async function refusal(response: Response) {
  return { status: response.status, body: await response.json() }
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

  it('keeps each host to its limit, whoever asks', async () => {
    let visitor = 0
    const { scanOf } = setup({
      limits: { ...DEVELOPMENT_LIMITS, perHost: { scans: 1, seconds: 3600 } },
      address: () => `203.0.113.${++visitor}`,
    })
    expect((await scanOf('https://example.com/')).status).toBe(202)
    expect((await scanOf('https://example.com/other')).status).toBe(429)
    expect((await scanOf('https://shop.example.com/')).status).toBe(202)
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
      { type: 'started' },
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
    await events.publish(id, { type: 'started' })
    await events.publish(id, { type: 'error' })
    const response = await app.request(`/api/scans/${id}/events`, {
      headers: { 'last-event-id': '2' },
    })
    expect(parse(await response.text())).toEqual([{ id: '3', event: { type: 'error' } }])
  })

  it('ends the stream of a scan that finished without its last event', async () => {
    const { app, scanOf, store } = setup()
    const { id } = (await (await scanOf('https://example.com/')).json()) as { id: string }
    await store.finish(id, { scan: { status: 'complete' } } as unknown as Report, NOW)
    const text = await (await app.request(`/api/scans/${id}/events`)).text()
    expect(parse(text).at(-1)).toEqual({ id: null, event: { type: 'done', state: 'complete' } })
  })
})

/** The stream's events, with their IDs. */
function parse(text: string): { id: string | null; event: unknown }[] {
  return text
    .split('\n\n')
    .filter((block) => block.includes('data:'))
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
