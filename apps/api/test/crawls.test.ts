import { SitesResponse, type CrawlReport } from '@arablyzer/api-contract'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, planCatalogFrom } from '@arablyzer/plans'
import {
  MemoryAccountData,
  MemoryCrawlData,
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
import { DEFAULT_CRAWL_SETTINGS } from '../src/crawl/settings'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle } from './support/google'

// M4.5: the crawl routes: starting, one at a time, reading, cancelling, deleting; another
// person's crawl is a 404; with accounts off, none of it is there.

const SITE = new URL('https://arablyzer.example')
const PLAN = {
  ARABLYZER_PLAN_ACCOUNT_SCANS: '3',
  ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '60',
  ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '2',
  ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '2',
  ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '30',
  ARABLYZER_PLAN_ACCOUNT_CRAWL_PAGES: '20',
}
const ANONYMOUS = { ...DEVELOPMENT_LIMITS, perConnection: { scans: 1, seconds: 60 }, inFlight: 1 }

function setup(options: { accounts?: boolean } = {}) {
  const tables: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] }
  const scans = new MemoryScanStore()
  const data = new MemoryAccountData(scans)
  const crawls = new MemoryCrawlData()
  const auth = createAuth({
    site: SITE,
    secret: 'a'.repeat(40),
    database: memoryAdapter(tables),
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    production: false,
    beforeDelete: async (userId) => {
      await data.eraseUser(userId)
      await crawls.eraseUser(userId)
    },
    log: () => undefined,
  })
  const accounts: AccountsDeps = {
    auth,
    limits: { signIn: { scans: 1000, seconds: 60 } },
    secureCookies: false,
    data,
    plans: planCatalogFrom(PLAN, ANONYMOUS),
    crawls,
    crawlSettings: DEFAULT_CRAWL_SETTINGS,
  }
  const app = createApp({
    limits: ANONYMOUS,
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
    newId: () => 'scan'.padEnd(22, '0'),
    origin: SITE.origin,
    ...(options.accounts === false ? {} : { accounts }),
  })
  const send = (method: string, path: string, body?: unknown, cookie?: string, origin = true) =>
    app.request(path, {
      method,
      headers: {
        ...(origin ? { origin: SITE.origin } : {}),
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
  const addSite = async (cookie: string, url = 'https://shop.example/') => {
    const response = await send('POST', '/api/sites', { url }, cookie)
    return ((await response.json()) as { id: string }).id
  }
  return { send, signIn, addSite, crawls, data }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deep crawl routes', () => {
  it('starts a crawl of a saved site at the plan’s cap, one at a time, and lists it with the site', async () => {
    const { send, signIn, addSite } = setup()
    const cookie = await signIn('ali')
    const siteId = await addSite(cookie)
    const started = await send('POST', `/api/sites/${siteId}/crawls`, undefined, cookie)
    expect(started.status).toBe(202)
    const crawl = (await started.json()) as { id: string; state: string; pageCap: number }
    expect(crawl).toMatchObject({ state: 'queued', pageCap: 20 })
    const second = await send('POST', `/api/sites/${siteId}/crawls`, undefined, cookie)
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ error: 'conflict' })

    const sites = SitesResponse.parse(
      await (await send('GET', '/api/sites', undefined, cookie)).json(),
    )
    expect(sites.crawlPages).toBe(20)
    expect(sites.sites[0]?.crawl).toMatchObject({ id: crawl.id, state: 'queued' })
    const list = (await (
      await send('GET', `/api/sites/${siteId}/crawls`, undefined, cookie)
    ).json()) as {
      crawls: { id: string }[]
    }
    expect(list.crawls.map((c) => c.id)).toEqual([crawl.id])
  })

  it('reads a crawl’s progress before it is grouped, and its report after', async () => {
    const { send, signIn, addSite, crawls } = setup()
    const cookie = await signIn('ali')
    const siteId = await addSite(cookie)
    const id = (
      (await (await send('POST', `/api/sites/${siteId}/crawls`, undefined, cookie)).json()) as {
        id: string
      }
    ).id
    const early = (await (
      await send('GET', `/api/crawls/${id}`, undefined, cookie)
    ).json()) as CrawlReport
    expect(early).toMatchObject({ templates: [], issues: [] })
    expect(early.crawl.state).toBe('queued')

    const rows = ['/p/a', '/p/b', '/p/c'].map((path) => ({
      url: `https://shop.example${path}`,
      depth: 1,
      bucket: '/p/:leaf',
    }))
    await crawls.add(id, rows, 100)
    for (const row of rows) {
      await crawls.record(
        id,
        row.url,
        {
          state: 'checked',
          status: 200,
          title: 'T',
          skeleton: 'main',
          issues: [{ id: 'title-missing', severity: 'serious', count: 1 }],
          error: null,
          links: [],
        },
        100,
      )
    }
    await crawls.update(id, {
      titles: { 'title-missing': { ar: 'العنوان مفقود', en: 'Title missing' } },
    })
    await crawls.assign(
      id,
      [
        {
          key: 't1',
          kind: 'generic',
          pattern: '/p/:slug',
          found: 3,
          checked: 3,
          representatives: [],
        },
      ],
      new Map(rows.map((row) => [row.url, 't1'])),
    )
    await crawls.update(id, { state: 'done', finishedAt: new Date() })
    const report = (await (
      await send('GET', `/api/crawls/${id}`, undefined, cookie)
    ).json()) as CrawlReport
    expect(report.issues).toMatchObject([
      {
        ruleId: 'title-missing',
        severity: 'serious',
        pages: 3,
        templates: [{ template: 't1', pages: 3, checked: 3 }],
      },
    ])
    expect(report.templates[0]).toMatchObject({ key: 't1', topIssues: ['title-missing'] })
    const pages = (await (
      await send('GET', `/api/crawls/${id}/pages?template=t1&offset=0`, undefined, cookie)
    ).json()) as { pages: { url: string }[]; next: number | null }
    expect(pages.pages).toHaveLength(3)
    expect(pages.next).toBeNull()
    expect(
      (await send('GET', `/api/crawls/${id}/pages?template=nope`, undefined, cookie)).status,
    ).toBe(400)
    expect((await send('GET', `/api/crawls/${id}/pages?offset=-1`, undefined, cookie)).status).toBe(
      400,
    )
  })

  it('cancels and deletes, and keeps another person’s crawl to its owner', async () => {
    const { send, signIn, addSite } = setup()
    const cookie = await signIn('ali')
    const other = await signIn('omar')
    const siteId = await addSite(cookie)
    const id = (
      (await (await send('POST', `/api/sites/${siteId}/crawls`, undefined, cookie)).json()) as {
        id: string
      }
    ).id
    for (const [method, path] of [
      ['GET', `/api/crawls/${id}`],
      ['GET', `/api/crawls/${id}/pages`],
      ['POST', `/api/crawls/${id}/cancel`],
      ['DELETE', `/api/crawls/${id}`],
      ['POST', `/api/sites/${siteId}/crawls`],
      ['GET', `/api/sites/${siteId}/crawls`],
    ] as const) {
      expect((await send(method, path, undefined, other)).status, `${method} ${path}`).toBe(404)
    }
    expect((await send('DELETE', `/api/crawls/${id}`, undefined, cookie)).status).toBe(409)
    const cancelled = await send('POST', `/api/crawls/${id}/cancel`, undefined, cookie)
    expect(cancelled.status).toBe(202)
    expect(((await cancelled.json()) as { state: string }).state).toBe('cancelled')
    // An ended crawl cannot be cancelled again, and can be deleted; then a new one may start.
    expect((await send('POST', `/api/crawls/${id}/cancel`, undefined, cookie)).status).toBe(404)
    expect((await send('DELETE', `/api/crawls/${id}`, undefined, cookie)).status).toBe(204)
    expect((await send('GET', `/api/crawls/${id}`, undefined, cookie)).status).toBe(404)
    expect((await send('POST', `/api/sites/${siteId}/crawls`, undefined, cookie)).status).toBe(202)
  })

  it('refuses a request without the site’s origin, or without a session', async () => {
    const { send, signIn, addSite } = setup()
    const cookie = await signIn('ali')
    const siteId = await addSite(cookie)
    expect(
      (await send('POST', `/api/sites/${siteId}/crawls`, undefined, cookie, false)).status,
    ).toBe(400)
    expect((await send('POST', `/api/sites/${siteId}/crawls`)).status).toBe(401)
    expect((await send('GET', '/api/crawls/nope')).status).toBe(401)
    expect((await send('GET', '/api/crawls/nope', undefined, cookie)).status).toBe(404)
  })

  it('leaves nothing of a crawl when the account is erased', async () => {
    const { send, signIn, addSite, crawls } = setup()
    const cookie = await signIn('ali')
    const siteId = await addSite(cookie)
    const id = (
      (await (await send('POST', `/api/sites/${siteId}/crawls`, undefined, cookie)).json()) as {
        id: string
      }
    ).id
    expect(await crawls.get(id)).not.toBeNull()
    expect((await send('DELETE', '/api/account', { confirm: true }, cookie)).status).toBe(204)
    expect(await crawls.get(id)).toBeNull()
  })

  it('is not there with accounts off', async () => {
    const { send } = setup({ accounts: false })
    expect((await send('POST', '/api/sites/x/crawls')).status).toBe(404)
    expect((await send('GET', '/api/crawls/x')).status).toBe(404)
  })
})
