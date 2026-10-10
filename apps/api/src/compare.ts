import {
  COMPARE_CRAWLS_PATH,
  COMPARE_SCANS_PATH,
  CRAWL_ID_PATTERN,
  MAX_HISTORY_POINTS,
  NOT_COMPARABLE,
  SCAN_ID_PATTERN,
  SITE_ID_PATTERN,
} from '@arablyzer/api-contract'
import type { ScanStore } from '@arablyzer/store'
import type { Context, Hono } from 'hono'
import { planOf, type SessionAccess } from './accounts'
import { compareCrawls } from './compare/crawls'
import { siteHistory } from './compare/history'
import { compareScans, isComparable } from './compare/scans'
import { reportOf } from './crawls'

export interface CompareDeps {
  readonly access: SessionAccess
  readonly store: ScanStore
  readonly now: () => Date
}

const DAY_MS = 24 * 60 * 60 * 1000

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
    const linked = await access.data.linkedScans(read.user.id, ids)
    const [base, head] = await Promise.all([store.get(baseId), store.get(headId)])
    const baseLink = linked.get(baseId)
    const headLink = linked.get(headId)
    if (baseLink === undefined || headLink === undefined || base === null || head === null) {
      return access.fail(c, 'not-found')
    }
    if (!isComparable(base) || !isComparable(head)) return notComparable(c)
    const sameSite =
      base.url === head.url || (baseLink.siteId !== null && baseLink.siteId === headLink.siteId)
    if (!sameSite) return notComparable(c)
    return c.json(compareScans(base, head))
  })

  const { crawls } = access
  if (crawls !== undefined) {
    app.get(COMPARE_CRAWLS_PATH, async (c) => {
      const read = await access.require(c)
      if (read instanceof Response) return read
      const ids = idsOf(c, CRAWL_ID_PATTERN)
      if (ids === null) return access.fail(c, 'bad-request')
      const [base, head] = await Promise.all(ids.map((id) => crawls.get(id)))
      if (
        base === undefined ||
        head === undefined ||
        base === null ||
        head === null ||
        base.userId !== read.user.id ||
        head.userId !== read.user.id
      ) {
        return access.fail(c, 'not-found')
      }
      if (base.state !== 'done' || head.state !== 'done') return notComparable(c)
      const sameSite =
        base.origin === head.origin || (base.siteId !== null && base.siteId === head.siteId)
      if (!sameSite) return notComparable(c)
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
