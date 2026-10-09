import { describe, expect, it } from 'vitest'
import type { CrawlData, NewCrawl } from '../src/index'

export const NOW = new Date('2026-10-09T12:00:00.000Z')
const MINUTE = 60_000
export const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE)

export interface CrawlHarness {
  readonly crawls: CrawlData
  /** Makes the person and their saved site exist (PostgreSQL needs the rows). */
  readonly user: (id: string) => Promise<void>
  readonly site: (userId: string, siteId: string) => Promise<void>
  /** Makes a scan exist (PostgreSQL keeps a foreign key to it). */
  readonly scan: (scanId: string) => Promise<void>
}

let counter = 0
/** An id of 22 characters, as a scan's or a site's. */
export const id = (prefix: string) => `${prefix}${String(++counter)}`.padEnd(22, '_')

/** The deep crawl contract, run over the memory store and PostgreSQL alike. */
export function crawlContract(make: () => CrawlHarness | Promise<CrawlHarness>): void {
  async function setup() {
    const h = await make()
    const userId = id('u')
    const siteId = id('s')
    await h.user(userId)
    await h.site(userId, siteId)
    const input = (overrides: Partial<NewCrawl> = {}): NewCrawl => ({
      id: id('c'),
      userId,
      siteId,
      startUrl: 'https://shop.example/',
      pageCap: 50,
      delayMs: 1000,
      createdAt: NOW,
      ...overrides,
    })
    return { ...h, userId, siteId, input }
  }
  const found = (path: string, depth = 1, bucket = path.split('/')[1] ?? '') => ({
    url: `https://shop.example${path}`,
    depth,
    bucket,
  })
  const checked = (links: ReturnType<typeof found>[] = []) => ({
    state: 'checked' as const,
    status: 200,
    title: 'T',
    skeleton: 'main',
    issues: [{ id: 'title-missing', severity: 'serious' as const, count: 1 }],
    error: null,
    links,
  })

  describe('starting', () => {
    it('lets an account have one crawl active at a time, even when many start at once', async () => {
      const { crawls, input, userId } = await setup()
      const results = await Promise.all([1, 2, 3, 4].map(() => crawls.create(input())))
      expect(results.filter((r) => r.kind === 'created')).toHaveLength(1)
      const mine = await crawls.forSite(userId, input().siteId ?? '', 10)
      expect(mine).toHaveLength(1)
      expect(mine[0]).toMatchObject({
        state: 'queued',
        origin: 'https://shop.example',
        pageCap: 50,
      })
    })

    it('lets another account crawl at the same time, and the same account once the first has ended', async () => {
      const { crawls, input, user, site } = await setup()
      const other = id('u')
      await user(other)
      await site(other, id('s'))
      const first = await crawls.create(input())
      expect(first.kind).toBe('created')
      expect((await crawls.create({ ...input(), userId: other, siteId: null })).kind).toBe(
        'created',
      )
      if (first.kind !== 'created') return
      await crawls.update(first.crawl.id, { state: 'done', finishedAt: at(1), leaseUntil: null })
      expect((await crawls.create(input())).kind).toBe('created')
    })
  })

  describe('cancelling and removing', () => {
    it('cancels a queued crawl at once and asks a running one to stop, for its owner alone', async () => {
      const { crawls, input, userId, user } = await setup()
      const stranger = id('u')
      await user(stranger)
      const queued = await crawls.create(input())
      if (queued.kind !== 'created') throw new Error('expected a crawl')
      expect(await crawls.requestCancel(stranger, queued.crawl.id, at(1))).toBe(false)
      expect(await crawls.requestCancel(userId, queued.crawl.id, at(1))).toBe(true)
      expect(await crawls.get(queued.crawl.id)).toMatchObject({
        state: 'cancelled',
        finishedAt: at(1),
      })
      expect(await crawls.requestCancel(userId, queued.crawl.id, at(2))).toBe(false)

      const running = await crawls.create(input())
      if (running.kind !== 'created') throw new Error('expected a crawl')
      await crawls.update(running.crawl.id, { state: 'running' })
      expect(await crawls.requestCancel(userId, running.crawl.id, at(1))).toBe(true)
      expect(await crawls.get(running.crawl.id)).toMatchObject({
        state: 'running',
        cancelRequested: true,
      })
    })

    it('removes an ended crawl with its pages, not a running one, and not another account’s', async () => {
      const { crawls, input, userId, user } = await setup()
      const stranger = id('u')
      await user(stranger)
      const made = await crawls.create(input())
      if (made.kind !== 'created') throw new Error('expected a crawl')
      const crawlId = made.crawl.id
      await crawls.add(crawlId, [found('/a')], 100)
      expect(await crawls.remove(userId, crawlId)).toBe('active')
      await crawls.update(crawlId, { state: 'done', finishedAt: at(1) })
      expect(await crawls.remove(stranger, crawlId)).toBe('missing')
      expect(await crawls.remove(userId, crawlId)).toBe('removed')
      expect(await crawls.get(crawlId)).toBeNull()
      expect(await crawls.pages(crawlId)).toEqual([])
    })
  })

  describe('claiming', () => {
    it('hands a crawl to one crawler at a time until its lease ends', async () => {
      const { crawls, input } = await setup()
      const made = await crawls.create(input())
      if (made.kind !== 'created') throw new Error('expected a crawl')
      /** The times this crawl is handed out, taking claims until none is left (others' crawls may be in the same store). */
      const taken = async (now: Date, lease: Date) => {
        let times = 0
        for (
          let claim = await crawls.claim(now, lease);
          claim !== null;
          claim = await crawls.claim(now, lease)
        ) {
          if (claim.id === made.crawl.id) times++
        }
        return times
      }
      const first = await Promise.all([1, 2, 3].map(() => taken(at(0), at(2))))
      expect(first.reduce((a, b) => a + b, 0)).toBe(1)
      expect(await taken(at(1), at(3))).toBe(0)
      // The crawler died: after the lease the crawl is claimed again.
      expect(await taken(at(2), at(4))).toBe(1)
      await crawls.update(made.crawl.id, { state: 'done', finishedAt: at(3) })
      expect(await taken(at(10), at(12))).toBe(0)
    })
  })

  describe('the frontier', () => {
    it('visits each kind of page before one kind twice, shallow first', async () => {
      const { crawls, input } = await setup()
      const made = await crawls.create(input())
      if (made.kind !== 'created') throw new Error('expected a crawl')
      const crawlId = made.crawl.id
      expect(
        await crawls.add(
          crawlId,
          [
            found('/', 0, ''),
            found('/products/a', 1),
            found('/products/b', 1),
            found('/blog/x', 1),
            found('/products/a', 1),
          ],
          100,
        ),
      ).toBe(4)
      const order: string[] = []
      for (let n = 0; n < 4; n++) {
        const next = await crawls.next(crawlId)
        if (next === null) break
        order.push(new URL(next.url).pathname)
        await crawls.record(crawlId, next.url, checked(), 100)
      }
      expect(order).toEqual(['/', '/products/a', '/blog/x', '/products/b'])
      expect(await crawls.next(crawlId)).toBeNull()
      expect(await crawls.get(crawlId)).toMatchObject({ pagesFound: 4, pagesChecked: 4 })
    })

    it('adds the links of a page as found one level deeper, never past the row cap or twice', async () => {
      const { crawls, input } = await setup()
      const made = await crawls.create(input())
      if (made.kind !== 'created') throw new Error('expected a crawl')
      const crawlId = made.crawl.id
      await crawls.add(crawlId, [found('/', 0, '')], 5)
      await crawls.record(
        crawlId,
        'https://shop.example/',
        checked([found('/a'), found('/b'), found('/c'), found('/d'), found('/e'), found('/f')]),
        5,
      )
      const rows = await crawls.pages(crawlId)
      expect(rows).toHaveLength(5)
      expect(rows[0]).toMatchObject({ url: 'https://shop.example/', state: 'checked', status: 200 })
      expect(rows[0]?.issues).toEqual([{ id: 'title-missing', severity: 'serious', count: 1 }])
      expect(rows.slice(1).map((row) => row.state)).toEqual(['found', 'found', 'found', 'found'])
      expect((await crawls.get(crawlId))?.pagesFound).toBe(5)
    })

    it('counts pages asked for, answered or not, and a page robots.txt keeps out is not one', async () => {
      const { crawls, input } = await setup()
      const made = await crawls.create(input())
      if (made.kind !== 'created') throw new Error('expected a crawl')
      const crawlId = made.crawl.id
      await crawls.add(crawlId, [found('/a'), found('/b'), found('/c')], 100)
      await crawls.record(
        crawlId,
        'https://shop.example/a',
        { ...checked(), state: 'failed', status: 404, error: 'http-404' },
        100,
      )
      await crawls.record(
        crawlId,
        'https://shop.example/b',
        { ...checked(), state: 'blocked', status: null, error: 'robots' },
        100,
      )
      expect(await crawls.get(crawlId)).toMatchObject({ pagesFound: 3, pagesChecked: 1 })
    })
  })

  describe('templates and the report’s rows', () => {
    it('stores templates with their pages, lists a template’s pages, keeps scans and titles', async () => {
      const { crawls, input, scan } = await setup()
      const made = await crawls.create(input())
      if (made.kind !== 'created') throw new Error('expected a crawl')
      const crawlId = made.crawl.id
      await crawls.add(crawlId, [found('/products/a'), found('/blog/x'), found('/products/b')], 100)
      await crawls.assign(
        crawlId,
        [
          {
            key: 't1',
            kind: 'product',
            pattern: '/products/:slug',
            found: 2,
            checked: 0,
            representatives: ['https://shop.example/products/a'],
          },
          {
            key: 't2',
            kind: 'article',
            pattern: '/blog/:slug',
            found: 1,
            checked: 0,
            representatives: [],
          },
        ],
        new Map([
          ['https://shop.example/products/a', 't1'],
          ['https://shop.example/products/b', 't1'],
          ['https://shop.example/blog/x', 't2'],
        ]),
      )
      const scanId = id('r')
      await scan(scanId)
      await crawls.setScan(crawlId, 'https://shop.example/products/a', scanId)
      await crawls.setRenderIssues(crawlId, 'https://shop.example/products/a', [
        { id: 'contrast', severity: 'serious', count: 2 },
      ])
      await crawls.update(crawlId, { titles: { 'title-missing': { ar: 'عنوان', en: 'Title' } } })
      await crawls.update(crawlId, { titles: { contrast: { ar: 'تباين', en: 'Contrast' } } })
      const crawl = await crawls.get(crawlId)
      expect(crawl?.templates.map((t) => t.key)).toEqual(['t1', 't2'])
      expect(Object.keys(crawl?.titles ?? {}).sort()).toEqual(['contrast', 'title-missing'])
      const list = await crawls.list(crawlId, { template: 't1', offset: 0, limit: 10 })
      expect(list.map((row) => new URL(row.url).pathname)).toEqual(['/products/a', '/products/b'])
      expect(list[0]?.scanId).toBe(scanId)
      expect(list[0]?.renderIssues).toEqual([{ id: 'contrast', severity: 'serious', count: 2 }])
      expect(await crawls.list(crawlId, { offset: 1, limit: 1 })).toHaveLength(1)
    })
  })

  describe('keeping', () => {
    it('prunes ended crawls older than a date, not active ones, and erases an account’s', async () => {
      const { crawls, input, userId, siteId } = await setup()
      const old = await crawls.create(input())
      if (old.kind !== 'created') throw new Error('expected a crawl')
      await crawls.update(old.crawl.id, { state: 'done', finishedAt: at(-60 * 24 * 10) })
      const active = await crawls.create(input())
      if (active.kind !== 'created') throw new Error('expected a crawl')
      expect(await crawls.prune(at(-60 * 24 * 5))).toBe(1)
      expect(await crawls.get(old.crawl.id)).toBeNull()
      expect(await crawls.get(active.crawl.id)).not.toBeNull()
      await crawls.eraseUser(userId)
      expect(await crawls.forSite(userId, siteId, 10)).toEqual([])
      expect((await crawls.latestPerSite(userId)).size).toBe(0)
    })

    it('tells the newest crawl of each site', async () => {
      const { crawls, input, userId, siteId } = await setup()
      const first = await crawls.create(input({ createdAt: at(0) }))
      if (first.kind !== 'created') throw new Error('expected a crawl')
      await crawls.update(first.crawl.id, { state: 'done', finishedAt: at(1) })
      const second = await crawls.create(input({ createdAt: at(5) }))
      if (second.kind !== 'created') throw new Error('expected a crawl')
      expect((await crawls.latestPerSite(userId)).get(siteId)?.id).toBe(second.crawl.id)
    })
  })
}
