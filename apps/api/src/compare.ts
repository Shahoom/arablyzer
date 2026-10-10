import {
  COMPARE_CRAWLS_PATH,
  COMPARE_SCANS_PATH,
  CRAWL_ID_PATTERN,
  MAX_HISTORY_POINTS,
  NOT_COMPARABLE,
  SCAN_ID_PATTERN,
  SITE_ID_PATTERN,
} from '@arablyzer/api-contract'
import type { Crawl, CrawlData, ScanStore } from '@arablyzer/store'
import type { Context, Hono } from 'hono'
import { planOf, type SessionAccess } from './accounts'
import { compareCrawls } from './compare/crawls'
import { siteHistory } from './compare/history'
import { compareScans, isComparable, type Comparable } from './compare/scans'
import { reportOf } from './crawls'

export interface CompareDeps {
  readonly access: SessionAccess
  readonly store: ScanStore
  readonly now: () => Date
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Why two reports are not compared: not the caller's (or not there), or not of one site / not finished. */
export type PairProblem = 'not-found' | 'not-comparable'

/** Two of the person's scans of one site that ended with a report (also what a comparison PDF reads). */
export async function comparableScans(
  access: SessionAccess,
  store: ScanStore,
  userId: string,
  baseId: string,
  headId: string,
): Promise<{ readonly base: Comparable; readonly head: Comparable } | PairProblem> {
  const linked = await access.data.linkedScans(userId, [baseId, headId])
  const [base, head] = await Promise.all([store.get(baseId), store.get(headId)])
  const baseLink = linked.get(baseId)
  const headLink = linked.get(headId)
  if (baseLink === undefined || headLink === undefined || base === null || head === null) {
    return 'not-found'
  }
  if (!isComparable(base) || !isComparable(head)) return 'not-comparable'
  const sameSite =
    base.url === head.url || (baseLink.siteId !== null && baseLink.siteId === headLink.siteId)
  return sameSite ? { base, head } : 'not-comparable'
}

/** Two of the person's finished crawls of one site. */
export async function comparableCrawls(
  crawls: CrawlData,
  userId: string,
  baseId: string,
  headId: string,
): Promise<{ readonly base: Crawl; readonly head: Crawl } | PairProblem> {
  const [base, head] = await Promise.all([crawls.get(baseId), crawls.get(headId)])
  if (base === null || head === null || base.userId !== userId || head.userId !== userId) {
    return 'not-found'
  }
  if (base.state !== 'done' || head.state !== 'done') return 'not-comparable'
  const sameSite =
    base.origin === head.origin || (base.siteId !== null && base.siteId === head.siteId)
  return sameSite ? { base, head } : 'not-comparable'
}

/**
 * Comparing two reports and a site's score history (M4.6). Read-only and behind the session; what
 * is not the caller's is a 404 as what does not exist is, and two reports that are not of one
 * site, or not finished, or a tool's, are a 422.
 */
export function mountCompare(app: Hono, deps: CompareDeps): void {
  const { access, store } = deps
  const notComparable = (c: Context) => c.json({ error: NOT_COMPARABLE }, 422)

  /** The two ids of the query, checked against a pattern, or null. */
  const idsOf = (c: Context, pattern: RegExp): [string, string] | null => {
    const base = c.req.query('base') ?? ''
    const head = c.req.query('head') ?? ''
    return pattern.test(base) && pattern.test(head) && base !== head ? [base, head] : null
  }

  app.get(COMPARE_SCANS_PATH, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const ids = idsOf(c, SCAN_ID_PATTERN)
    if (ids === null) return access.fail(c, 'bad-request')
    const [baseId, headId] = ids
    const pair = await comparableScans(access, store, read.user.id, baseId, headId)
    if (pair === 'not-found') return access.fail(c, 'not-found')
    if (pair === 'not-comparable') return notComparable(c)
    const { base, head } = pair
    return c.json(compareScans(base, head))
  })

  const { crawls } = access
  if (crawls !== undefined) {
    app.get(COMPARE_CRAWLS_PATH, async (c) => {
      const read = await access.require(c)
      if (read instanceof Response) return read
      const ids = idsOf(c, CRAWL_ID_PATTERN)
      if (ids === null) return access.fail(c, 'bad-request')
      const pair = await comparableCrawls(crawls, read.user.id, ids[0], ids[1])
      if (pair === 'not-found') return access.fail(c, 'not-found')
      if (pair === 'not-comparable') return notComparable(c)
      const { base, head } = pair
      const [was, is] = await Promise.all([
        reportOf(base, crawls, store),
        reportOf(head, crawls, store),
      ])
      return c.json(compareCrawls(was, is))
    })
  }

  app.get('/api/sites/:id/history', async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const id = c.req.param('id')
    const site = SITE_ID_PATTERN.test(id) ? await access.data.site(read.user.id, id) : null
    if (site === null) return access.fail(c, 'not-found')
    const days = planOf(access.plans, read.user.id).historyDays
    const since = new Date(deps.now().getTime() - days * DAY_MS)
    const [points, alerts] = await Promise.all([
      access.data.scorePoints(read.user.id, site.id, since, MAX_HISTORY_POINTS),
      access.monitors?.alerts(read.user.id) ?? Promise.resolve(null),
    ])
    return c.json(
      siteHistory({
        siteId: site.id,
        url: site.url,
        days,
        since,
        points,
        wants: alerts,
      }),
    )
  })
}
