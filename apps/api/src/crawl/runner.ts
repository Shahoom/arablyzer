import type { CrawlError, Localized } from '@arablyzer/api-contract'
import type { EgressPolicy, Resolver } from '@arablyzer/egress'
import type { PlanCatalog, ScanLimits } from '@arablyzer/plans'
import { ScannerUnavailable, type CrawlClient, type PageAnswer } from '@arablyzer/scanner-client'
import {
  hostLimitKey,
  quietly,
  rowCapOf,
  type AccountData,
  type Crawl,
  type CrawlData,
  type CrawlPageRow,
  type Found,
  type InFlight,
  type PageIssue,
  type PageRecord,
  type RateLimiter,
  type ScanEvents,
  type ScanQueue,
  type ScanStore,
} from '@arablyzer/store'
import { planOf } from '../accounts'
import { monitorQueueRoom } from '../monitor/scheduler'
import { holdPlace } from '../places'
import { parseTarget, resolveTarget } from '../target'
import type { CrawlSettings } from './settings'
import { groupTemplates } from './templates'
import { bucketOf, MAX_QUERY_VARIANTS, normalizeUrl, pathKey } from './url'

export interface CrawlRunnerDeps {
  readonly crawls: CrawlData
  readonly accounts: AccountData
  readonly store: ScanStore
  readonly queue: ScanQueue
  readonly events: ScanEvents
  readonly limiter: RateLimiter
  readonly inFlight: InFlight
  readonly limits: ScanLimits
  readonly plans: PlanCatalog
  readonly policy: EgressPolicy
  readonly resolver: Resolver
  /** The scanner's crawl interface: it fetches, under the egress rules, and reads what the site sent. */
  readonly scanner: CrawlClient
  readonly settings: CrawlSettings
  readonly newId: () => string
  readonly now?: () => Date
  readonly sleep?: (ms: number) => Promise<void>
  readonly log?: (message: string) => void
}

/** How long a crawler holds a crawl before another may take it: longer than one page's read. */
export const LEASE_MS = 3 * 60_000
/** How soon a crawl whose browsers are running is looked at again. */
export const RENDER_LOOK_MS = 15_000
/** How long a scanner that is not there is waited for before the crawl fails. */
export const UNAVAILABLE_MS = 5 * 60_000
/** Reads in a row the scanner could not answer, after which the crawl fails. */
export const MAX_READ_FAILURES = 5
/** The longest the browsers are waited for after the pages are checked. */
export const RENDER_TIMEOUT_MS = 45 * 60_000
/** A crawl that has run this long without ending is failed: something is wrong with it. */
export const MAX_AGE_MS = 4 * 60 * 60_000
/** The longest `Crawl-delay` heeded, in ms (the engine's own cap, for a scanner that sends more). */
export const MAX_SITE_DELAY_MS = 10_000
/** How often ended crawls older than the history are deleted. */
export const PRUNE_EVERY_MS = 60 * 60_000

export interface CrawlRunner {
  /** Takes one crawl nobody holds and works on it until the pages are checked, or its browsers are looked at once. */
  tick(): Promise<void>
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const ENDED = new Set(['complete', 'partial', 'failed'])

class Stop extends Error {
  readonly outcome: 'cancelled' | CrawlError

  constructor(outcome: 'cancelled' | CrawlError) {
    super(outcome)
    this.outcome = outcome
  }
}

/** The failure a start page's answer is: why a site could not be crawled at all. */
function failureOf(answer: PageAnswer): CrawlError {
  if (answer.outcome === 'blocked') return 'blocked-by-robots'
  if (answer.outcome === 'not-html') return 'not-html'
  return 'unreachable'
}

export function createCrawlRunner(deps: CrawlRunnerDeps): CrawlRunner {
  const now = deps.now ?? (() => new Date())
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const told = quietly('Crawler', deps.log)
  const tell = (error: unknown) => {
    told(new Error(message(error)))
  }
  let lastPrune = 0

  const leaseFrom = (at: Date, ms = LEASE_MS) => new Date(at.getTime() + ms)

  /** Asks the scanner; one that is not there is waited for, and the lease kept meanwhile. */
  async function ask<T>(crawl: Crawl, call: () => Promise<T>): Promise<T> {
    const started = now().getTime()
    for (let wait = 1_000; ; wait = Math.min(2 * wait, 15_000)) {
      try {
        return await call()
      } catch (error) {
        if (!(error instanceof ScannerUnavailable)) throw error
        if (now().getTime() - started > UNAVAILABLE_MS) throw new Stop('scanner-unavailable')
        await deps.crawls.update(crawl.id, { leaseUntil: leaseFrom(now()) })
        await sleep(wait)
      }
    }
  }

  function recordOf(
    answer: PageAnswer,
    origin: string,
    depth: number,
    variants: Map<string, number>,
  ): PageRecord {
    const issues: PageIssue[] = answer.issues.map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      count: issue.count,
    }))
    if (answer.outcome === 'ok') {
      const links: Found[] = []
      for (const link of answer.links) {
        const url = normalizeUrl(link, origin)
        if (url === null) continue
        // A path with many query variants (a filter, a calendar) is a few pages, not a thousand.
        if (new URL(url).search !== '') {
          const key = pathKey(url)
          const seen = variants.get(key) ?? 0
          if (seen >= MAX_QUERY_VARIANTS) continue
          variants.set(key, seen + 1)
        }
        links.push({ url, depth: depth + 1, bucket: bucketOf(url) })
      }
      return {
        state: 'checked',
        status: answer.status,
        title: answer.title,
        skeleton: answer.skeleton,
        issues,
        error: null,
        links,
      }
    }
    return {
      state: answer.outcome === 'blocked' ? 'blocked' : 'failed',
      status: answer.status,
      title: null,
      skeleton: null,
      issues: [],
      error: answer.error ?? answer.outcome,
      links: [],
    }
  }

  /** Finds the site's first pages: the start page (the origin may move once, to www or https), then its sitemaps. */
  async function bootstrap(crawl: Crawl, variants: Map<string, number>): Promise<number> {
    const rowCap = rowCapOf(crawl.pageCap)
    const start = await ask(crawl, () => deps.scanner.page(crawl.startUrl, { anyOrigin: true }))
    if (start.outcome !== 'ok' || start.finalUrl === null) throw new Stop(failureOf(start))
    const origin = new URL(start.finalUrl).origin
    const first = normalizeUrl(start.finalUrl, origin) ?? start.finalUrl
    await deps.crawls.update(crawl.id, { origin })
    await deps.crawls.add(crawl.id, [{ url: first, depth: 0, bucket: bucketOf(first) }], rowCap)
    await deps.crawls.record(crawl.id, first, recordOf(start, origin, 0, variants), rowCap)
    await titles(crawl.id, start, new Set())
    const seeds = await ask(crawl, () => deps.scanner.seeds(origin))
    if (seeds.robots === 'blocked') throw new Stop('blocked-by-robots')
    const found: Found[] = []
    for (const address of seeds.urls) {
      const url = normalizeUrl(address, origin)
      if (url === null) continue
      if (new URL(url).search !== '') {
        const key = pathKey(url)
        const seen = variants.get(key) ?? 0
        if (seen >= MAX_QUERY_VARIANTS) continue
        variants.set(key, seen + 1)
      }
      found.push({ url, depth: 1, bucket: bucketOf(url) })
    }
    await deps.crawls.add(crawl.id, found, rowCap)
    const asked = Math.min(
      Math.max(start.crawlDelayMs ?? 0, seeds.crawlDelayMs ?? 0),
      MAX_SITE_DELAY_MS,
    )
    return asked
  }

  /** Remembers the titles of the rules a page's issues name, once each. */
  async function titles(id: string, answer: PageAnswer, known: Set<string>): Promise<void> {
    const fresh: Record<string, Localized> = {}
    for (const issue of answer.issues) {
      if (known.has(issue.id)) continue
      known.add(issue.id)
      fresh[issue.id] = issue.title
    }
    if (Object.keys(fresh).length > 0) await deps.crawls.update(id, { titles: fresh })
  }

  async function finish(
    crawl: Crawl,
    outcome: 'cancelled' | 'failed' | 'done',
    error: CrawlError | null = null,
  ): Promise<void> {
    await deps.crawls.update(crawl.id, {
      state: outcome,
      error,
      finishedAt: now(),
      leaseUntil: null,
    })
  }

  /** The pages: found, asked for one by one at the crawl's pace, until the cap or nothing is left. */
  async function pages(crawl: Crawl): Promise<void> {
    const rowCap = rowCapOf(crawl.pageCap)
    const variants = new Map<string, number>()
    for (const row of await deps.crawls.pages(crawl.id)) {
      if (new URL(row.url).search !== '') {
        const key = pathKey(row.url)
        variants.set(key, (variants.get(key) ?? 0) + 1)
      }
    }
    let pace = crawl.delayMs
    if (crawl.pagesFound === 0) {
      pace = Math.max(pace, await bootstrap(crawl, variants))
    }
    const known = new Set(Object.keys(crawl.titles))
    let lastRead = 0
    let failures = 0
    for (;;) {
      const current = await deps.crawls.get(crawl.id)
      if (current === null) return
      if (current.cancelRequested) throw new Stop('cancelled')
      if (now().getTime() - current.createdAt.getTime() > MAX_AGE_MS) throw new Stop('internal')
      if (current.pagesChecked >= current.pageCap) return
      await deps.crawls.update(crawl.id, { leaseUntil: leaseFrom(now()) })
      const next = await deps.crawls.next(crawl.id)
      if (next === null) return
      const wait = lastRead + pace - now().getTime()
      if (lastRead > 0 && wait > 0) await sleep(wait)
      let record: PageRecord
      try {
        const answer = await ask(crawl, () => deps.scanner.page(next.url))
        failures = 0
        lastRead = now().getTime()
        record = recordOf(answer, current.origin, next.depth, variants)
        await titles(crawl.id, answer, known)
        // The site may ask for more time between pages than the crawl was given.
        pace = Math.max(pace, Math.min(answer.crawlDelayMs ?? 0, MAX_SITE_DELAY_MS))
      } catch (error) {
        if (error instanceof Stop) throw error
        // The scanner could not read this page: it is a failed page, and a scanner that fails
        // five times running is not the page's fault.
        tell(error)
        if (++failures >= MAX_READ_FAILURES) throw new Stop('scanner-unavailable')
        lastRead = now().getTime()
        record = {
          state: 'failed',
          status: null,
          title: null,
          skeleton: null,
          issues: [],
          error: 'scanner',
          links: [],
        }
      }
      await deps.crawls.record(crawl.id, next.url, record, rowCap)
    }
  }

  /** The pages grouped into templates, and the browsers asked for the representatives. */
  async function group(crawl: Crawl): Promise<void> {
    const rows = await deps.crawls.pages(crawl.id)
    const { templates, assignments } = groupTemplates(rows, {
      representatives: deps.settings.representatives,
      rendered: deps.settings.renderedTemplates,
    })
    await deps.crawls.assign(crawl.id, templates, assignments)
    const planned = templates.some((template) => template.representatives.length > 0)
    if (planned) {
      await deps.crawls.update(crawl.id, {
        state: 'rendering',
        renderStartedAt: now(),
        leaseUntil: leaseFrom(now(), RENDER_LOOK_MS),
      })
    } else {
      await finish(crawl, 'done')
    }
  }

  /** Starts the scan of one page the way a monitor's starts: the account's place, the host's bucket, the queue's lower half. */
  async function startScan(crawl: Crawl, url: string): Promise<'started' | 'wait' | 'skip'> {
    const at = now()
    const plan = planOf(deps.plans, crawl.userId)
    const holder = `account:${crawl.userId}`
    const id = deps.newId()
    if (!(await holdPlace(deps, holder, id, plan.inFlight, at.getTime()))) return 'wait'
    let queued = false
    try {
      const parsed = parseTarget(url, deps.policy)
      if (!parsed.ok) return 'skip'
      const resolved = await resolveTarget(parsed.value, deps.policy, deps.resolver)
      if (!resolved.ok) return 'skip'
      const host = await deps.limiter.take(
        hostLimitKey(parsed.value.host),
        deps.limits.perHost,
        at.getTime(),
      )
      if (!host.ok) return 'wait'
      const ahead = await deps.queue.waiting()
      if (ahead >= monitorQueueRoom(deps.limits)) return 'wait'
      // Stored, linked and announced before it is queued, so the worker never starts a scan whose
      // record is not there yet; a failure after the record fails the scan at once.
      await deps.store.create({ id, url: resolved.value, createdAt: at })
      try {
        await deps.accounts.link({
          userId: crawl.userId,
          scanId: id,
          url: resolved.value,
          source: 'crawl',
          createdAt: at,
        })
        await deps.crawls.setScan(crawl.id, url, id)
        await deps.events.publish(id, { type: 'queued', ahead })
        await deps.queue.add({ id, url: resolved.value })
      } catch (error) {
        await deps.store.fail(id, at).catch(() => false)
        await deps.events.publish(id, { type: 'error' }).catch(() => '')
        throw error
      }
      queued = true
      return 'started'
    } finally {
      if (!queued) await deps.inFlight.release(holder, [id]).catch(() => undefined)
    }
  }

  /** The issues a representative's full scan found that the HTML checks did not, with the rules' titles. */
  function renderIssuesOf(
    report: NonNullable<Awaited<ReturnType<ScanStore['get']>>>['report'],
    row: CrawlPageRow,
  ): { issues: PageIssue[]; titles: Record<string, Localized> } {
    const issues: PageIssue[] = []
    const found: Record<string, Localized> = {}
    if (report === null) return { issues, titles: found }
    const html = new Set(row.issues.map((issue) => issue.id))
    for (const rule of report.rules) {
      if (rule.status !== 'fail' || html.has(rule.id)) continue
      const count =
        report.findings.filter((finding) => finding.ruleId === rule.id).length +
        (rule.findingsOmitted ?? 0)
      issues.push({ id: rule.id, severity: rule.severity, count: Math.max(1, count) })
      found[rule.id] = rule.title
    }
    return { issues, titles: found }
  }

  /** One look at the browsers: start what can be started, and when every scan has ended, take in what they found. */
  async function rendering(crawl: Crawl): Promise<void> {
    if (crawl.cancelRequested) throw new Stop('cancelled')
    const at = now()
    const rows = await deps.crawls.pages(crawl.id)
    const byUrl = new Map(rows.map((row) => [row.url, row]))
    let templates = crawl.templates
    let waiting = false
    for (const template of crawl.templates) {
      for (const url of template.representatives) {
        const row = byUrl.get(url)
        if (row?.scanId !== null) continue
        // One start at a time, and the first that has to wait ends the round: the rest wait too.
        if (waiting) continue
        const started = await startScan(crawl, url)
        if (started === 'wait') waiting = true
        if (started === 'skip') {
          templates = templates.map((t) =>
            t.key === template.key
              ? { ...t, representatives: t.representatives.filter((u) => u !== url) }
              : t,
          )
        }
      }
    }
    if (templates !== crawl.templates) {
      await deps.crawls.update(crawl.id, { templates })
      await deps.crawls.assign(crawl.id, templates, new Map())
    }
    const planned = templates.flatMap((template) => template.representatives)
    const fresh = await deps.crawls.pages(crawl.id)
    const reps = fresh.filter((row) => planned.includes(row.url))
    const states = await deps.store.states(
      reps.flatMap((row) => (row.scanId === null ? [] : [row.scanId])),
    )
    const over = reps.every(
      (row) => row.scanId !== null && ENDED.has(states.get(row.scanId) ?? 'queued'),
    )
    const waited = at.getTime() - (crawl.renderStartedAt ?? crawl.createdAt).getTime()
    if (!over && waited < RENDER_TIMEOUT_MS) {
      await deps.crawls.update(crawl.id, { leaseUntil: leaseFrom(at, RENDER_LOOK_MS) })
      return
    }
    const known: Record<string, Localized> = {}
    for (const row of reps) {
      if (row.scanId === null) continue
      const scan = await deps.store.get(row.scanId)
      if (scan?.report == null) continue
      const { issues, titles: found } = renderIssuesOf(scan.report, row)
      await deps.crawls.setRenderIssues(crawl.id, row.url, issues)
      Object.assign(known, found)
    }
    if (Object.keys(known).length > 0) await deps.crawls.update(crawl.id, { titles: known })
    await finish(crawl, 'done')
  }

  async function work(crawl: Crawl): Promise<void> {
    try {
      if (crawl.state === 'rendering') {
        await rendering(crawl)
        return
      }
      if (crawl.state === 'queued') {
        await deps.crawls.update(crawl.id, { state: 'running', startedAt: now() })
      }
      await pages(crawl)
      const latest = await deps.crawls.get(crawl.id)
      if (latest !== null) await group(latest)
    } catch (error) {
      if (error instanceof Stop) {
        if (error.outcome === 'cancelled') await finish(crawl, 'cancelled')
        else await finish(crawl, 'failed', error.outcome)
        return
      }
      throw error
    }
  }

  async function prune(): Promise<void> {
    const at = now().getTime()
    if (at - lastPrune < PRUNE_EVERY_MS) return
    lastPrune = at
    const days = deps.plans.account.historyDays
    await deps.crawls.prune(new Date(at - days * 24 * 60 * 60_000))
  }

  return {
    async tick() {
      await prune().catch(tell)
      const at = now()
      const crawl = await deps.crawls.claim(at, leaseFrom(at))
      if (crawl === null) return
      try {
        await work(crawl)
      } catch (error) {
        // The lease ends by itself and the crawl is taken again: its rows say where it was.
        tell(error)
        if (now().getTime() - crawl.createdAt.getTime() > MAX_AGE_MS) {
          await finish(crawl, 'failed', 'internal').catch(tell)
        }
      }
    },
  }
}
