import {
  ACCOUNT_SCANS_PATH,
  AddSiteRequest,
  HISTORY_LIMIT,
  SITE_ID_PATTERN,
  SITES_PATH,
  TREND_LENGTH,
  type AccountScan,
  type AccountScansResponse,
  type SiteSummary,
  type SitesResponse,
  type UrlErrorCode,
} from '@arablyzer/api-contract'
import type { EgressPolicy } from '@arablyzer/egress'
import {
  quietly,
  type Crawl,
  type HistoryEntry,
  type Monitor,
  type RunPoint,
  type SavedSite,
} from '@arablyzer/store'
import type { Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { planOf, type AccountsDeps, type AccountUser, type SessionAccess } from './accounts'
import { listedSummary } from './crawls'
import { fromTheSite } from './guards'
import { newSiteId } from './ids'
import { monitorSummary } from './monitor/schedule'
import { parseTarget } from './target'

export interface SitesDeps {
  readonly access: SessionAccess
  readonly accounts: AccountsDeps
  readonly origin: string | undefined
  readonly policy: EgressPolicy
  readonly log: ((message: string) => void) | undefined
  readonly now: () => Date
  /** Starts a scan for a person already known to be signed in (app.ts). */
  readonly startScan: (
    c: Context,
    input: { readonly url: string; readonly turnstileToken: string },
    identity: AccountUser,
  ) => Promise<Response>
}

/** A saved site's address is not scanned yet, so the checks that need no network are all there are. */
const URL_STATUS: Readonly<Record<UrlErrorCode, 400 | 422>> = {
  'invalid-url': 400,
  'unsupported-scheme': 400,
  'url-too-long': 400,
  'credentials-in-url': 400,
  'port-not-allowed': 400,
  'blocked-host': 422,
  'blocked-address': 422,
  'dns-failed': 422,
}

const MAX_BODY_BYTES = 8 * 1024

const scanOf = (entry: HistoryEntry): AccountScan => ({
  id: entry.scanId,
  url: entry.url,
  state: entry.state,
  score: entry.score,
  createdAt: entry.createdAt.toISOString(),
  siteId: entry.siteId,
})

const siteOf = (
  site: SavedSite,
  last: HistoryEntry | undefined,
  monitor: Monitor | undefined,
  trend: readonly RunPoint[] = [],
  crawl?: Crawl,
): SiteSummary => ({
  id: site.id,
  url: site.url,
  createdAt: site.createdAt.toISOString(),
  lastScan: last === undefined ? null : scanOf(last),
  monitor: monitor === undefined ? null : monitorSummary(monitor, trend),
  crawl: crawl === undefined ? null : listedSummary(crawl),
})

/**
 * The saved sites and the history (M4.2): thin routes over `AccountData`, behind the session and
 * the same Origin and size guards as the account routes. A site that is not the caller's is a 404,
 * as one that does not exist is: no one learns another person's ids.
 */
export function mountSites(app: Hono, deps: SitesDeps): void {
  const { access } = deps
  const { data } = access
  const told = quietly('Sites', deps.log)
  const fromTheSiteOnly = fromTheSite({
    origin: deps.origin,
    json: false,
    refuse: (c) => access.fail(c, 'bad-request'),
    foreign: told,
  })
  const fromTheSiteJson = fromTheSite({
    origin: deps.origin,
    json: true,
    refuse: (c) => access.fail(c, 'bad-request'),
    foreign: told,
  })
  const small = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => access.fail(c, 'bad-request'),
  })

  app.get(SITES_PATH, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const { monitors, crawls } = access
    const [sites, latest, watched, trend, crawled] = await Promise.all([
      data.sites(read.user.id),
      data.latestPerSite(read.user.id),
      monitors?.monitors(read.user.id) ?? Promise.resolve([] as Monitor[]),
      monitors?.trend(read.user.id, TREND_LENGTH) ??
        Promise.resolve(new Map<string, RunPoint[]>() as ReadonlyMap<string, RunPoint[]>),
      crawls?.latestPerSite(read.user.id) ??
        Promise.resolve(new Map<string, Crawl>() as ReadonlyMap<string, Crawl>),
    ])
    const plan = planOf(access.plans, read.user.id)
    const body: SitesResponse = {
      sites: sites.map((site) =>
        siteOf(
          site,
          latest.get(site.id),
          watched.find((monitor) => monitor.siteId === site.id),
          trend.get(site.id),
          crawled.get(site.id),
        ),
      ),
      limit: plan.savedSites,
      monitoring: { limit: plan.monitoredSites, everyDays: plan.monitorEveryDays },
      crawlPages: plan.crawlPages,
    }
    return c.json(body)
  })

  app.post(SITES_PATH, fromTheSiteJson, small, async (c) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return access.fail(c, 'bad-request')
    }
    const request = AddSiteRequest.safeParse(raw)
    if (!request.success) return access.fail(c, 'bad-request')
    const read = await access.require(c)
    if (read instanceof Response) return read
    const parsed = parseTarget(request.data.url, deps.policy)
    if (!parsed.ok) return c.json({ error: parsed.code }, URL_STATUS[parsed.code])
    const plan = planOf(access.plans, read.user.id)
    const added = await data.addSite(
      read.user.id,
      { id: newSiteId(), url: parsed.value.url.href, createdAt: deps.now() },
      plan.savedSites,
    )
    if (added.kind === 'limit') {
      return c.json({ error: 'plan-limit', limit: 'savedSites', plan: plan.id }, 403)
    }
    if (added.kind === 'added') return c.json(siteOf(added.site, undefined, undefined), 201)
    const latest = await data.latestPerSite(read.user.id)
    return c.json(siteOf(added.site, latest.get(added.site.id), undefined))
  })

  app.delete(`${SITES_PATH}/:id`, fromTheSiteOnly, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const id = c.req.param('id')
    if (!SITE_ID_PATTERN.test(id) || !(await data.removeSite(read.user.id, id))) {
      return access.fail(c, 'not-found')
    }
    return c.body(null, 204)
  })

  app.post(`${SITES_PATH}/:id/scans`, fromTheSiteOnly, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const id = c.req.param('id')
    const site = SITE_ID_PATTERN.test(id) ? await data.site(read.user.id, id) : null
    if (site === null) return access.fail(c, 'not-found')
    // The person is known: no Turnstile token is asked, and the scan takes the account's quota.
    return deps.startScan(c, { url: site.url, turnstileToken: '' }, read.user)
  })

  app.get(ACCOUNT_SCANS_PATH, async (c) => {
    const read = await access.require(c)
    if (read instanceof Response) return read
    const history = await data.history(read.user.id, HISTORY_LIMIT)
    const body: AccountScansResponse = {
      scans: history.map(scanOf),
      historyDays: planOf(access.plans, read.user.id).historyDays,
    }
    return c.json(body)
  })
}
