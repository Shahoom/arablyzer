import type { CrawlComparison, ScanComparison, SiteHistory } from '@arablyzer/api-contract'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, planCatalogFrom } from '@arablyzer/plans'
import {
  MemoryAccountData,
  MemoryCrawlData,
  MemoryInFlight,
  MemoryMonitorData,
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
import { reportOf, type FindingSpec } from './support/reports'

// M4.6: the comparison and history routes: whose reports they read, which pairs they refuse, and
// what a site's history holds.

const SITE = new URL('https://arablyzer.example')
const PLAN = {
  ARABLYZER_PLAN_ACCOUNT_SCANS: '3',
  ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '60',
  ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '2',
  ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '3',
  ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '30',
  ARABLYZER_PLAN_ACCOUNT_CRAWL_PAGES: '20',
}
const ANONYMOUS = { ...DEVELOPMENT_LIMITS, perConnection: { scans: 1, seconds: 60 }, inFlight: 1 }
const NOW = new Date('2026-10-09T12:00:00.000Z')
const DAY = 86_400_000
const SHOP = 'https://shop.example/'
const id = (name: string) => name.padEnd(22, '_')

function setup(options: { accounts?: boolean; monitoring?: boolean } = {}) {
  const tables: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] }
  const scans = new MemoryScanStore()
  const data = new MemoryAccountData(scans)
  const crawls = new MemoryCrawlData()
  const monitors = new MemoryMonitorData(data, scans)
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
    ...(options.monitoring === false
      ? {}
      : {
          monitors,
          sender: { send: () => Promise.resolve({ status: 204, ok: true }) },
          mail: { available: false, send: () => Promise.resolve(false) },
        }),
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
    now: () => NOW,
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
    const cookie = response.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
    const me = (await (await send('GET', '/api/account', undefined, cookie)).json()) as {
      id: string
    }
    return { cookie, userId: me.id }
  }
  const addSite = async (cookie: string, url = SHOP) =>
    ((await (await send('POST', '/api/sites', { url }, cookie)).json()) as { id: string }).id
  /** A finished scan the person keeps, `days` before now. */
  const keep = async (
    userId: string,
    name: string,
    days: number,
    report: ReturnType<typeof reportOf> | null,
    options: { url?: string; source?: 'manual' | 'monitor'; tool?: string } = {},
  ) => {
    const at = new Date(NOW.getTime() - days * DAY)
    const url = options.url ?? SHOP
    await scans.create({
      id: id(name),
      url,
      createdAt: at,
      ...(options.tool === undefined ? {} : { tool: options.tool }),
    })
    if (report === null) await scans.fail(id(name), at)
    else {
      await scans.start(id(name), at)
      await scans.finish(id(name), report, at)
    }
    await data.link({
      userId,
      scanId: id(name),
      url,
      source: options.source ?? 'manual',
      createdAt: at,
    })
    return id(name)
  }
  return { send, signIn, addSite, keep, crawls, scans }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const finding = (ruleId: string, selector?: string): FindingSpec =>
  selector === undefined ? { ruleId } : { ruleId, selector }

describe('GET /api/compare/scans', () => {
  it('compares two of the person’s scans of one site', async () => {
    const { send, signIn, keep } = setup()
    const { cookie, userId } = await signIn('ali')
    const a = await keep(userId, 'a', 5, reportOf(70, [finding('title'), finding('h1')]))
    const b = await keep(userId, 'b', 1, reportOf(82, [finding('h1'), finding('alt', 'img')]))
    const response = await send('GET', `/api/compare/scans?base=${a}&head=${b}`, undefined, cookie)
    expect(response.status).toBe(200)
    const body = (await response.json()) as ScanComparison
    expect(body.overall).toEqual({ before: 70, after: 82, change: 12 })
    expect(body.counts).toEqual({ new: 1, fixed: 1, worsened: 0, improved: 0, unchanged: 1 })
    expect(body.base.id).toBe(a)
    expect(body.head.id).toBe(b)
  })

  it('answers 401 without a session, 400 for ids that are not ids or are one, 404 for another person’s', async () => {
    const { send, signIn, keep } = setup()
    const ali = await signIn('ali')
    const sara = await signIn('sara')
    const a = await keep(ali.userId, 'a', 5, reportOf(70))
    const b = await keep(ali.userId, 'b', 1, reportOf(80))
    const c = await keep(sara.userId, 'c', 1, reportOf(80))
    expect((await send('GET', `/api/compare/scans?base=${a}&head=${b}`)).status).toBe(401)
    expect(
      (await send('GET', '/api/compare/scans?base=x&head=y', undefined, ali.cookie)).status,
    ).toBe(400)
    expect(
      (await send('GET', `/api/compare/scans?base=${a}&head=${a}`, undefined, ali.cookie)).status,
    ).toBe(400)
    expect(
      (await send('GET', `/api/compare/scans?base=${a}&head=${c}`, undefined, ali.cookie)).status,
    ).toBe(404)
    expect(
      (await send('GET', `/api/compare/scans?base=${a}&head=${id('nope')}`, undefined, ali.cookie))
        .status,
    ).toBe(404)
  })

  it('refuses two sites, a tool’s scan, an unfinished scan and a scan that never got a report with 422', async () => {
    const { send, signIn, keep, scans } = setup()
    const { cookie, userId } = await signIn('ali')
    const a = await keep(userId, 'a', 5, reportOf(70))
    const other = await keep(userId, 'other', 4, reportOf(70), { url: 'https://other.example/' })
    const tool = await keep(userId, 'tool', 3, reportOf(70), { tool: 'hreflang' })
    const failed = await keep(userId, 'failed', 2, null)
    await scans.create({ id: id('queued'), url: SHOP, createdAt: NOW })
    const asked = async (head: string) => {
      const response = await send(
        'GET',
        `/api/compare/scans?base=${a}&head=${head}`,
        undefined,
        cookie,
      )
      return [response.status, await response.json()] as const
    }
    for (const head of [other, tool, failed]) {
      expect(await asked(head)).toEqual([422, { error: 'not-comparable' }])
    }
    // Not linked to the person, so it is not theirs to read.
    expect((await asked(id('queued')))[0]).toBe(404)
  })

  it('compares the scans of a site whose address was saved with a path, by site as well as by address', async () => {
    const { send, signIn, addSite, keep } = setup()
    const { cookie, userId } = await signIn('ali')
    const siteId = await addSite(cookie)
    expect(siteId).toHaveLength(22)
    const a = await keep(userId, 'a', 5, reportOf(70))
    const b = await keep(userId, 'b', 1, reportOf(75))
    expect(
      (await send('GET', `/api/compare/scans?base=${a}&head=${b}`, undefined, cookie)).status,
    ).toBe(200)
  })

  it('is not there with accounts off', async () => {
    const { send } = setup({ accounts: false })
    expect((await send('GET', `/api/compare/scans?base=${id('a')}&head=${id('b')}`)).status).toBe(
      404,
    )
    expect((await send('GET', `/api/compare/crawls?base=${id('a')}&head=${id('b')}`)).status).toBe(
      404,
    )
    expect((await send('GET', `/api/sites/${id('a')}/history`)).status).toBe(404)
  })
})

describe('GET /api/compare/crawls', () => {
  async function finished(
    t: ReturnType<typeof setup>,
    cookie: string,
    siteId: string,
    pages: number,
  ) {
    const started = (await (
      await t.send('POST', `/api/sites/${siteId}/crawls`, undefined, cookie)
    ).json()) as { id: string }
    const rows = Array.from({ length: pages }, (_, n) => ({
      url: `https://shop.example/p/${n}`,
      depth: 1,
      bucket: '/p/:leaf',
    }))
    await t.crawls.add(started.id, rows, 100)
    for (const row of rows) {
      await t.crawls.record(
        started.id,
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
    await t.crawls.update(started.id, { titles: { 'title-missing': { ar: 'ع', en: 'Title' } } })
    await t.crawls.assign(
      started.id,
      [
        {
          key: 't1',
          kind: 'generic',
          pattern: '/p/:slug',
          found: pages,
          checked: pages,
          representatives: [],
        },
      ],
      new Map(rows.map((row) => [row.url, 't1'])),
    )
    await t.crawls.update(started.id, { state: 'done', finishedAt: new Date() })
    return started.id
  }

  it('compares two finished crawls of a site by template, and refuses an unfinished one or another person’s', async () => {
    const t = setup()
    const { cookie } = await t.signIn('ali')
    const siteId = await t.addSite(cookie)
    const first = await finished(t, cookie, siteId, 3)
    const second = await finished(t, cookie, siteId, 5)
    const response = await t.send(
      'GET',
      `/api/compare/crawls?base=${first}&head=${second}`,
      undefined,
      cookie,
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as CrawlComparison
    expect(body.templates).toMatchObject([
      { pattern: '/p/:slug', before: { found: 3 }, after: { found: 5 } },
    ])
    expect(body.changes).toMatchObject([
      {
        kind: 'unchanged',
        ruleId: 'title-missing',
        before: { pages: 3, checked: 3 },
        after: { pages: 5, checked: 5 },
      },
    ])

    const third = (await (
      await t.send('POST', `/api/sites/${siteId}/crawls`, undefined, cookie)
    ).json()) as { id: string }
    const running = await t.send(
      'GET',
      `/api/compare/crawls?base=${first}&head=${third.id}`,
      undefined,
      cookie,
    )
    expect([running.status, await running.json()]).toEqual([422, { error: 'not-comparable' }])

    const sara = await t.signIn('sara')
    const hers = await t.send(
      'GET',
      `/api/compare/crawls?base=${first}&head=${second}`,
      undefined,
      sara.cookie,
    )
    expect(hers.status).toBe(404)
    expect(
      (await t.send('GET', `/api/compare/crawls?base=a&head=b`, undefined, cookie)).status,
    ).toBe(400)
  })
})

describe('GET /api/sites/:id/history', () => {
  it('lists the site’s whole-page scans inside the plan’s window, oldest first, with the monitor’s alerts marked', async () => {
    const t = setup()
    const { cookie, userId } = await t.signIn('ali')
    const siteId = await t.addSite(cookie)
    await t.keep(userId, 'old', 45, reportOf(50)) // outside the 30 days
    await t.keep(userId, 'one', 20, reportOf(90, [], { categories: { speed: 80 } }), {
      source: 'monitor',
    })
    await t.keep(userId, 'two', 10, reportOf(70, [], { categories: { speed: 40 } }), {
      source: 'monitor',
    })
    await t.keep(userId, 'tool', 9, reportOf(10), { tool: 'hreflang' })
    await t.keep(userId, 'three', 2, reportOf(72), { url: SHOP })
    const response = await t.send('GET', `/api/sites/${siteId}/history`, undefined, cookie)
    expect(response.status).toBe(200)
    const body = (await response.json()) as SiteHistory
    expect(body).toMatchObject({ siteId, url: SHOP, days: 30, alerts: true })
    expect(body.points.map((p) => [p.overall, p.source])).toEqual([
      [90, 'monitor'],
      [70, 'monitor'],
      [72, 'manual'],
    ])
    expect(body.points[0]?.categories).toEqual({ speed: 80 })
    expect(body.markers).toMatchObject([{ kind: 'score-drop', from: 90, to: 70 }])
  })

  it('finds nothing of a person once the account is erased', async () => {
    const t = setup()
    const { cookie, userId } = await t.signIn('ali')
    const siteId = await t.addSite(cookie)
    const a = await t.keep(userId, 'a', 5, reportOf(70))
    const b = await t.keep(userId, 'b', 1, reportOf(80))
    expect(
      (await t.send('GET', `/api/compare/scans?base=${a}&head=${b}`, undefined, cookie)).status,
    ).toBe(200)
    expect((await t.send('DELETE', '/api/account', { confirm: true }, cookie)).status).toBe(204)
    // The session is gone with the account, and no scan is left to compare for the id.
    expect((await t.send('GET', `/api/sites/${siteId}/history`, undefined, cookie)).status).toBe(
      401,
    )
    expect(
      (await t.send('GET', `/api/compare/scans?base=${a}&head=${b}`, undefined, cookie)).status,
    ).toBe(401)
    const again = await t.signIn('ali')
    expect(
      (await t.send('GET', `/api/compare/scans?base=${a}&head=${b}`, undefined, again.cookie))
        .status,
    ).toBe(404)
    expect(
      (await t.send('GET', `/api/sites/${siteId}/history`, undefined, again.cookie)).status,
    ).toBe(404)
  })

  it('has no markers without monitoring, and is a 404 for a site that is not the person’s', async () => {
    const t = setup({ monitoring: false })
    const ali = await t.signIn('ali')
    const siteId = await t.addSite(ali.cookie)
    const body = (await (
      await t.send('GET', `/api/sites/${siteId}/history`, undefined, ali.cookie)
    ).json()) as SiteHistory
    expect(body).toMatchObject({ alerts: false, markers: [], points: [] })
    const sara = await t.signIn('sara')
    expect(
      (await t.send('GET', `/api/sites/${siteId}/history`, undefined, sara.cookie)).status,
    ).toBe(404)
    expect((await t.send('GET', `/api/sites/${siteId}/history`)).status).toBe(401)
    expect((await t.send('GET', '/api/sites/short/history', undefined, ali.cookie)).status).toBe(
      404,
    )
  })
})
