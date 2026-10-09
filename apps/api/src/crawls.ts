import {
  CRAWL_ID_PATTERN,
  CRAWL_PAGES_LIMIT,
  SITE_ID_PATTERN,
  TEMPLATE_KEY_PATTERN,
  type CrawlPagesResponse,
  type CrawlsResponse,
} from '@arablyzer/api-contract'
import { quietly, type Crawl, type CrawlData, type ScanStore } from '@arablyzer/store'
import type { Context, Hono } from 'hono'
import { planOf, type AccountsDeps, type SessionAccess } from './accounts'
import { buildReport, pageOf, summaryOf, type ScanFact } from './crawl/report'
import type { CrawlSettings } from './crawl/settings'
import { fromTheSite } from './guards'
import { newCrawlId } from './ids'

export interface CrawlsDeps {
  readonly access: SessionAccess
  readonly accounts: AccountsDeps
  readonly crawls: CrawlData
  readonly store: ScanStore
  readonly settings: CrawlSettings
  readonly origin: string | undefined
  readonly log: ((message: string) => void) | undefined
  readonly now: () => Date
}

/** The crawls a site's list shows. */
const LIST_LIMIT = 10
const MAX_OFFSET = 100_000

/** The representatives a crawl planned, from its templates. */
export const plannedOf = (crawl: Crawl): number =>
  crawl.templates.reduce((sum, template) => sum + template.representatives.length, 0)

/** A crawl as a list shows it: no rows are read, so the browsers' progress is told by the state alone. */
export function listedSummary(crawl: Crawl) {
  const total = plannedOf(crawl)
  return summaryOf(crawl, { done: crawl.state === 'done' ? total : 0, total })
}

/**
 * Deep crawl (M4.5): starting one for a saved site, reading its report, cancelling and deleting.
 * Behind the session and the same Origin guard as the other account routes; a crawl that is not
 * the caller's is a 404, as one that does not exist is.
 */
export function mountCrawls(app: Hono, deps: CrawlsDeps): void {
  const { access, crawls } = deps
  const told = quietly('Crawls', deps.log)
  const guard = fromTheSite({
    origin: deps.origin,
    json: false,
    refuse: (c) => access.fail(c, 'bad-request'),
    foreign: told,
  })

  /** The crawl, when the signed-in person owns it. */
  async function owned(c: Context, userId: string): Promise<Crawl | null> {
    const id = c.req.param('id') ?? ''
    if (!CRAWL_ID_PATTERN.test(id)) return null
    const crawl = await crawls.get(id)
    return crawl?.userId === userId ? crawl : null
  }

  app.post('/api/sites/:id/crawls', guard, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const siteId = c.req.param('id')
    const site = SITE_ID_PATTERN.test(siteId) ? await access.data.site(read.user.id, siteId) : null
    if (site === null) return access.fail(c, 'not-found')
    const plan = planOf(access.plans, read.user.id)
    const started = await crawls.create({
      id: newCrawlId(),
      userId: read.user.id,
      siteId: site.id,
      startUrl: site.url,
      pageCap: plan.crawlPages,
      delayMs: deps.settings.delayMs,
      createdAt: deps.now(),
    })
    if (started.kind === 'active') return access.fail(c, 'conflict')
    return c.json(listedSummary(started.crawl), 202)
  })

  app.get('/api/sites/:id/crawls', async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const siteId = c.req.param('id')
    const site = SITE_ID_PATTERN.test(siteId) ? await access.data.site(read.user.id, siteId) : null
    if (site === null) return access.fail(c, 'not-found')
    const body: CrawlsResponse = {
      crawls: (await crawls.forSite(read.user.id, site.id, LIST_LIMIT)).map(listedSummary),
    }
    return c.json(body)
  })

  app.get('/api/crawls/:id', async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const crawl = await owned(c, read.user.id)
    if (crawl === null) return access.fail(c, 'not-found')
    // Until the pages are grouped there is nothing to tell but the progress, and no row is read.
    if (crawl.templates.length === 0) {
      return c.json({ crawl: summaryOf(crawl, { done: 0, total: 0 }), templates: [], issues: [] })
    }
    const rows = await crawls.pages(crawl.id)
    const scans = new Map<string, ScanFact>()
    for (const row of rows) {
      if (row.scanId === null) continue
      const scan = await deps.store.get(row.scanId)
      if (scan !== null) {
        scans.set(row.scanId, {
          state: scan.state,
          score: scan.tool === null && scan.report !== null ? scan.report.score.overall : null,
        })
      }
    }
    return c.json(buildReport(crawl, rows, scans))
  })

  app.get('/api/crawls/:id/pages', async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const crawl = await owned(c, read.user.id)
    if (crawl === null) return access.fail(c, 'not-found')
    const template = c.req.query('template')
    const offsetText = c.req.query('offset') ?? '0'
    const offset = /^\d{1,6}$/.test(offsetText) ? Number(offsetText) : -1
    if (
      offset < 0 ||
      offset > MAX_OFFSET ||
      (template !== undefined && !TEMPLATE_KEY_PATTERN.test(template))
    ) {
      return access.fail(c, 'bad-request')
    }
    const rows = await crawls.list(crawl.id, {
      ...(template === undefined ? {} : { template }),
      offset,
      limit: CRAWL_PAGES_LIMIT + 1,
    })
    const body: CrawlPagesResponse = {
      pages: rows.slice(0, CRAWL_PAGES_LIMIT).map(pageOf),
      next: rows.length > CRAWL_PAGES_LIMIT ? offset + CRAWL_PAGES_LIMIT : null,
    }
    return c.json(body)
  })

  app.post('/api/crawls/:id/cancel', guard, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const crawl = await owned(c, read.user.id)
    if (crawl === null || !(await crawls.requestCancel(read.user.id, crawl.id, deps.now()))) {
      return access.fail(c, 'not-found')
    }
    const now = await crawls.get(crawl.id)
    return c.json(listedSummary(now ?? crawl), 202)
  })

  app.delete('/api/crawls/:id', guard, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const id = c.req.param('id')
    const removed = CRAWL_ID_PATTERN.test(id) ? await crawls.remove(read.user.id, id) : 'missing'
    if (removed === 'missing') return access.fail(c, 'not-found')
    if (removed === 'active') return access.fail(c, 'conflict')
    return c.body(null, 204)
  })
}
