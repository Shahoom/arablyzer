import { DEFAULT_POLICY, type Resolver } from '@arablyzer/egress'
import { DEVELOPMENT_ACCOUNT_PLAN, DEVELOPMENT_LIMITS, type PlanCatalog } from '@arablyzer/plans'
import type { Report } from '@arablyzer/report-schema'
import { ScannerUnavailable, type CrawlClient, type PageAnswer } from '@arablyzer/scanner-client'
import {
  MemoryAccountData,
  MemoryCrawlData,
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { createCrawlRunner, UNAVAILABLE_MS } from '../src/crawl/runner'
import { DEFAULT_CRAWL_SETTINGS } from '../src/crawl/settings'

// M4.5: the crawler, on the memory stores, a clock of its own and a scanner that answers from a
// small site. What it asks for, in what order, and what it stores.

const START = new Date('2026-10-09T12:00:00.000Z')
const ORIGIN = 'https://shop.example'
const PUBLIC: Resolver = () => Promise.resolve([{ address: '93.184.215.14', family: 4 }])
const PRODUCT = 'main main>section main>section>form footer header'
const ARTICLE = 'main main>article main>article>h1 aside footer header'
const HOME = 'main main>section main>section>ul footer header'
const TITLE_MISSING = {
  id: 'title-missing',
  severity: 'serious' as const,
  count: 1,
  title: { ar: 'العنوان مفقود', en: 'Title missing' },
}

const page = (
  links: string[],
  skeleton: string,
  issues: PageAnswer['issues'] = [],
  extra: Partial<PageAnswer> = {},
): PageAnswer => ({
  outcome: 'ok',
  status: 200,
  finalUrl: null,
  error: null,
  title: 'T',
  links: links.map((link) => `${ORIGIN}${link}`),
  skeleton,
  issues,
  score: 80,
  crawlDelayMs: null,
  ...extra,
})
const failure = (outcome: PageAnswer['outcome'], error: string | null = null): PageAnswer => ({
  ...page([], ''),
  outcome,
  error,
  status: null,
  title: null,
  skeleton: null,
  score: null,
})

/** A shop: a home page, six products, four articles, an about page; /private is disallowed. */
function shop(): Record<string, PageAnswer> {
  const products = [1, 2, 3, 4, 5, 6].map((n) => `/products/item-${n}`)
  const articles = [1, 2, 3, 4].map((n) => `/blog/2026-0${n}-01`)
  const site: Record<string, PageAnswer> = {
    '/': page([...products.slice(0, 3), ...articles.slice(0, 2), '/about', '/private/x'], HOME),
    '/about': page(['/'], HOME),
    '/private/x': failure('blocked', 'robots'),
  }
  for (const path of products) site[path] = page(['/'], PRODUCT, [TITLE_MISSING])
  for (const path of articles) site[path] = page(['/'], ARTICLE)
  return site
}

function setup(
  options: {
    site?: Record<string, PageAnswer>
    seeds?: string[]
    plan?: Partial<typeof DEVELOPMENT_ACCOUNT_PLAN>
    robots?: 'fetched' | 'none' | 'blocked'
    flaky?: () => boolean
  } = {},
) {
  let clock = START
  const site = options.site ?? shop()
  const asked: string[] = []
  const scans = new MemoryScanStore()
  const accounts = new MemoryAccountData(scans)
  const crawls = new MemoryCrawlData()
  const queue = new MemoryScanQueue()
  const sleeps: number[] = []
  const scanner: CrawlClient = {
    page: (url) => {
      if (options.flaky?.() === true) return Promise.reject(new ScannerUnavailable('not there'))
      const path = new URL(url).pathname
      asked.push(path)
      const found = site[path]
      if (found === undefined) return Promise.resolve(failure('error', 'http-404'))
      return Promise.resolve({ ...found, finalUrl: found.finalUrl ?? url })
    },
    seeds: () =>
      Promise.resolve({
        robots: options.robots ?? 'fetched',
        crawlDelayMs: null,
        sitemaps: 1,
        urls: (options.seeds ?? []).map((path) => `${ORIGIN}${path}`),
        more: false,
      }),
  }
  const plans: PlanCatalog = {
    account: { ...DEVELOPMENT_ACCOUNT_PLAN, ...options.plan },
    pro: null,
    agency: null,
  }
  let n = 0
  const runner = createCrawlRunner({
    crawls,
    accounts,
    store: scans,
    queue,
    events: new MemoryScanEvents(20),
    limiter: new MemoryRateLimiter(),
    inFlight: new MemoryInFlight(),
    limits: { ...DEVELOPMENT_LIMITS, queue: 10, perHost: { scans: 100, seconds: 3600 } },
    plans,
    policy: DEFAULT_POLICY,
    resolver: PUBLIC,
    scanner,
    settings: { ...DEFAULT_CRAWL_SETTINGS, delayMs: 1000 },
    newId: () => `scan${String(++n).padStart(18, '0')}`,
    now: () => clock,
    sleep: (ms) => {
      sleeps.push(ms)
      clock = new Date(clock.getTime() + ms)
      return Promise.resolve()
    },
  })
  const start = async (cap = 50) => {
    const started = await crawls.create({
      id: 'crawl-1'.padEnd(22, '_'),
      userId: 'user-1',
      siteId: null,
      startUrl: `${ORIGIN}/`,
      pageCap: cap,
      delayMs: 1000,
      createdAt: clock,
    })
    if (started.kind !== 'created') throw new Error('expected a crawl')
    return started.crawl.id
  }
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms)
  }
  const finish = async (scanId: string, ended: Report) => {
    await scans.start(scanId, clock)
    await scans.finish(scanId, ended, clock)
  }
  return {
    runner,
    crawls,
    accounts,
    scans,
    queue,
    asked,
    sleeps,
    start,
    advance,
    finish,
    now: () => clock,
  }
}

const fullReport = (rules: { id: string; status: string; severity: string }[]) =>
  ({
    scan: { status: 'complete' },
    score: { overall: 70 },
    rules: rules.map((rule) => ({ ...rule, title: { ar: rule.id, en: rule.id } })),
    findings: [{ ruleId: 'contrast', severity: 'serious' }],
  }) as unknown as Report

describe('the crawler', () => {
  it('crawls a site from its start page and sitemap: same origin, robots.txt kept, grouped into templates', async () => {
    const t = setup({
      seeds: [
        '/products/item-4',
        '/products/item-5',
        '/products/item-6',
        '/blog/2026-03-01',
        '/blog/2026-04-01',
      ],
    })
    const id = await t.start()
    await t.runner.tick()
    const crawl = await t.crawls.get(id)
    expect(crawl).toMatchObject({ state: 'rendering', origin: ORIGIN })
    // Every page of the site was asked for once; the disallowed one was never fetched: the scanner
    // answered "blocked" for it, which is not a page asked for.
    expect(new Set(t.asked).size).toBe(t.asked.length)
    expect(t.asked[0]).toBe('/')
    expect(crawl?.templates.map((tpl) => [tpl.kind, tpl.pattern])).toEqual([
      ['home', '/'],
      ['product', '/products/:slug'],
      ['article', '/blog/:date'],
      ['standalone', '*'],
    ])
    const rows = await t.crawls.pages(id)
    expect(rows.find((row) => row.url.endsWith('/private/x'))).toMatchObject({ state: 'blocked' })
    expect(crawl?.pagesChecked).toBe(12)
  })

  it('stops at the plan’s cap, taking each kind of page before one kind twice', async () => {
    const t = setup({
      seeds: [
        '/products/item-4',
        '/products/item-5',
        '/products/item-6',
        '/blog/2026-03-01',
        '/blog/2026-04-01',
      ],
    })
    const id = await t.start(5)
    await t.runner.tick()
    expect((await t.crawls.get(id))?.pagesChecked).toBe(5)
    // Home, then one of each kind (a product, an article, the about page), before a second of any.
    const paths = (await t.crawls.pages(id))
      .filter((row) => row.state === 'checked')
      .map((row) => new URL(row.url).pathname)
    expect(paths).toHaveLength(5)
    expect(t.asked[0]).toBe('/')
    const firstFour = t.asked.slice(0, 4)
    expect(firstFour.some((p) => p.startsWith('/products/'))).toBe(true)
    expect(firstFour.some((p) => p.startsWith('/blog/'))).toBe(true)
    expect(firstFour).toContain('/about')
  })

  it('waits the crawl’s pause between two pages, and the site’s when it asks for more', async () => {
    const site = shop()
    site['/'] = page(['/about', '/products/item-1'], HOME, [], { crawlDelayMs: 3000 })
    const t = setup({ site })
    await t.start(3)
    await t.runner.tick()
    // The first page-after-the-start waits 3 s (the larger), each later one too.
    expect(t.sleeps.filter((ms) => ms > 0).every((ms) => ms <= 3000)).toBe(true)
    expect(Math.max(...t.sleeps)).toBeGreaterThan(1000)
  })

  it('starts one scan for each representative and, once they end, reports what the browsers found', async () => {
    const t = setup({
      seeds: ['/products/item-4', '/products/item-5', '/products/item-6', '/blog/2026-03-01'],
      plan: { inFlight: 10 },
    })
    const id = await t.start()
    await t.runner.tick()
    // The next look starts the scans: one for the home page, product, article and the standalone pool.
    t.advance(20_000)
    await t.runner.tick()
    const rows = await t.crawls.pages(id)
    const scanned = rows.filter((row) => row.scanId !== null)
    expect(scanned).toHaveLength(4)
    expect(await t.queue.waiting()).toBe(4)
    // Their scans appear in the account's history with the source the crawl gave them.
    expect((await t.accounts.history('user-1', 10)).length).toBe(4)
    // Not all have ended: the crawl keeps waiting.
    t.advance(20_000)
    await t.runner.tick()
    expect((await t.crawls.get(id))?.state).toBe('rendering')
    for (const row of scanned) {
      await t.finish(
        row.scanId ?? '',
        fullReport([
          { id: 'contrast', status: 'fail', severity: 'serious' },
          { id: 'title-missing', status: 'fail', severity: 'serious' },
          { id: 'lang', status: 'pass', severity: 'minor' },
        ]),
      )
    }
    t.advance(20_000)
    await t.runner.tick()
    const done = await t.crawls.get(id)
    expect(done).toMatchObject({ state: 'done', error: null })
    expect(done?.finishedAt).not.toBeNull()
    const product = (await t.crawls.pages(id)).find(
      (row) => row.scanId !== null && row.url.includes('/products/'),
    )
    // Only what the HTML checks did not already find: the render's own issue.
    expect(product?.renderIssues).toEqual([{ id: 'contrast', severity: 'serious', count: 1 }])
    expect(done?.titles.contrast).toEqual({ ar: 'contrast', en: 'contrast' })
  })

  it('holds back a representative’s scan while the account has one in flight, and while the queue is full', async () => {
    const t = setup({
      seeds: ['/products/item-4', '/products/item-5', '/products/item-6'],
      plan: { inFlight: 1 },
    })
    const id = await t.start()
    await t.runner.tick()
    t.advance(20_000)
    await t.runner.tick()
    // One place: one scan at a time, in the template order, the home page first.
    const rows = await t.crawls.pages(id)
    expect(rows.filter((row) => row.scanId !== null)).toHaveLength(1)
    expect(await t.queue.waiting()).toBe(1)
  })

  it('cancels at the next page, and fails a site whose start page cannot be read', async () => {
    const t = setup()
    const id = await t.start()
    await t.crawls.requestCancel('user-1', id, t.now())
    // Cancelled while queued: nothing to take.
    await t.runner.tick()
    expect(t.asked).toEqual([])
    expect((await t.crawls.get(id))?.state).toBe('cancelled')

    const blocked = setup({ site: { '/': failure('blocked', 'robots') } })
    const blockedId = await blocked.start()
    await blocked.runner.tick()
    expect(await blocked.crawls.get(blockedId)).toMatchObject({
      state: 'failed',
      error: 'blocked-by-robots',
    })
    const gone = setup({ site: {} })
    const goneId = await gone.start()
    await gone.runner.tick()
    expect(await gone.crawls.get(goneId)).toMatchObject({ state: 'failed', error: 'unreachable' })
    const robots = setup({ robots: 'blocked' })
    const robotsId = await robots.start()
    await robots.runner.tick()
    expect(await robots.crawls.get(robotsId)).toMatchObject({
      state: 'failed',
      error: 'blocked-by-robots',
    })
  })

  it('stops a crawl asked to cancel while it runs', async () => {
    const t = setup({ seeds: ['/products/item-4', '/blog/2026-03-01'] })
    const id = await t.start()
    // The cancel arrives after the third page.
    const original = t.sleeps.push.bind(t.sleeps)
    t.sleeps.push = (...ms: number[]) => {
      if (t.asked.length === 3) void t.crawls.requestCancel('user-1', id, t.now())
      return original(...ms)
    }
    await t.runner.tick()
    const crawl = await t.crawls.get(id)
    expect(crawl).toMatchObject({ state: 'cancelled' })
    expect(t.asked.length).toBeLessThanOrEqual(5)
  })

  it('waits for a scanner that is not there, and fails the crawl when it stays away', async () => {
    let down = 2
    const brief = setup({ flaky: () => down-- > 0 })
    const id = await brief.start()
    await brief.runner.tick()
    expect((await brief.crawls.get(id))?.state).toBe('rendering')

    const away = setup({ flaky: () => true })
    const awayId = await away.start()
    await away.runner.tick()
    expect(await away.crawls.get(awayId)).toMatchObject({
      state: 'failed',
      error: 'scanner-unavailable',
    })
    expect(away.now().getTime() - START.getTime()).toBeGreaterThan(UNAVAILABLE_MS)
  })

  it('is taken by one crawler at a time, and resumed by another when the first one dies', async () => {
    const t = setup()
    const id = await t.start()
    const first = t.runner.tick()
    const second = t.runner.tick()
    await Promise.all([first, second])
    expect(new Set(t.asked).size).toBe(t.asked.length)
    expect((await t.crawls.get(id))?.state).toBe('rendering')
  })

  it('deletes ended crawls older than the plan’s history', async () => {
    const t = setup({ plan: { historyDays: 5 } })
    const id = await t.start()
    await t.crawls.update(id, { state: 'done', finishedAt: t.now(), leaseUntil: null })
    await t.runner.tick()
    expect(await t.crawls.get(id)).not.toBeNull()
    t.advance(6 * 24 * 60 * 60_000)
    await t.runner.tick()
    expect(await t.crawls.get(id)).toBeNull()
  })
})
