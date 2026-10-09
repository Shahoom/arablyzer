import {
  collectPageIsolated,
  collectPage,
  collectRobots,
  readSitemapLocs,
  siteLinks,
  sitemapUrl,
  type RobotsFacts,
} from '@arablyzer/collectors'
import {
  checkUrl,
  DEFAULT_POLICY,
  defaultResolver,
  safeFetch,
  type EgressPolicy,
  type Resolver,
  type SafeFetchOptions,
} from '@arablyzer/egress'
import type { Localized, Severity } from '@arablyzer/report-schema'
import { challengeOf, matchRobots, RULES, type CollectorId, type Rule } from '@arablyzer/rules'
import { scoreOf } from '@arablyzer/scoring'
import { USER_AGENT } from './identity'
import { evaluatePage, ROBOTS_MAX_BYTES, ROBOTS_MAX_REDIRECTS } from './scan'
import { gunzip, isGzip, SITEMAP_MAX_BYTES, SITEMAP_MAX_REDIRECTS } from './sitemap'

// What a deep crawl asks of the engine (M4.5): one page at a time, the way a crawler would read
// it, and a site's start addresses. The crawl itself (which pages, how fast, how many) is the
// API's; the engine fetches under the same egress rules as a scan, reads the page's HTML in a
// thread of its own, runs the rules that need the HTML alone, and hands back a few facts.

/** The most links of its own site a page gives the crawl. */
export const CRAWL_LINKS_MAX = 300
/** The most start addresses a site's sitemaps give. */
export const CRAWL_SEEDS_MAX = 5_000
/** The sitemap files read for them, an index and the files it lists together. */
export const CRAWL_SITEMAP_FILES = 10
/** What a rule may need, to run on every page of a crawl: the page itself, and nothing from outside. */
const LIGHT_NEEDS: ReadonlySet<CollectorId> = new Set([
  'http',
  'headers',
  'html',
  'text',
  'response',
])
/** One page's fetch, redirects included. */
export const CRAWL_PAGE_TIMEOUT_MS = 20_000
/** The longest `Crawl-delay` heeded, in seconds: a site asking for more is crawled at this pace. */
export const CRAWL_DELAY_MAX_SECONDS = 10
const ROBOTS_TTL_MS = 10 * 60_000
const MAX_ROBOTS_SITES = 50
const PAGE_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'
const BOT = USER_AGENT.split('/', 1)[0] ?? 'ArablyzerBot'
/** Files a page links to that are not pages. */
const NOT_PAGES =
  /\.(?:pdf|zip|gz|rar|7z|jpe?g|png|gif|webp|avif|svg|ico|bmp|mp[34]|webm|mov|avi|wav|ogg|css|js|mjs|json|xml|txt|csv|xlsx?|docx?|pptx?|woff2?|ttf|otf|eot|apk|dmg|exe)$/i

/** The ids of the rules a crawl runs on every page: the ones that need the page's HTML and nothing else. */
export function lightRuleIds(rules: readonly Rule[] = RULES): string[] {
  return rules.filter((rule) => rule.needs.every((need) => LIGHT_NEEDS.has(need))).map((r) => r.id)
}

export interface IssueCount {
  readonly id: string
  readonly severity: Severity
  readonly count: number
  readonly title: Localized
}

export type PageOutcome = 'ok' | 'blocked' | 'error' | 'not-html' | 'offsite'

export interface PageResult {
  readonly outcome: PageOutcome
  readonly status: number | null
  /** The address the page ended at, after redirects. */
  readonly finalUrl: string | null
  /** A short code: an egress code, `robots`, `robots-unreachable`, `bot-challenge`, `http-<status>`. */
  readonly error: string | null
  readonly title: string | null
  readonly links: readonly string[]
  readonly skeleton: string | null
  readonly issues: readonly IssueCount[]
  readonly score: number | null
  /** The pause the site's robots.txt asks for between two requests, in ms. */
  readonly crawlDelayMs: number | null
}

export interface SeedsResult {
  /** `fetched`: robots.txt read; `none`: the site has none (every page is allowed); `blocked`: it cannot be read, so nothing is. */
  readonly robots: 'fetched' | 'none' | 'blocked'
  readonly crawlDelayMs: number | null
  /** Sitemap files read. */
  readonly sitemaps: number
  /** Pages the sitemaps list, of this origin and allowed by robots.txt. */
  readonly urls: readonly string[]
  readonly more: boolean
}

export interface Crawler {
  /**
   * One page: robots.txt first, then the page. `anyOrigin` lets the start page end on another
   * origin (www, https): its answer says which, and the crawl goes on there.
   */
  page(
    url: string,
    options?: { readonly anyOrigin?: boolean; readonly signal?: AbortSignal },
  ): Promise<PageResult>
  /** The pages the site's sitemaps list, and what its robots.txt asks. */
  seeds(origin: string, signal?: AbortSignal): Promise<SeedsResult>
}

export interface CrawlerOptions {
  readonly policy?: EgressPolicy
  readonly resolver?: Resolver
  readonly userAgent?: string
  readonly timeoutMs?: number
  /** Reads a page's HTML in a thread of its own, as the hosted scanner does. */
  readonly isolateParse?: { readonly maxHeapMb?: number }
  readonly signal?: AbortSignal
  readonly rules?: readonly Rule[]
  readonly now?: () => number
}

interface RobotsEntry {
  readonly facts: RobotsFacts
  readonly delayMs: number | null
  readonly at: number
}

/** The `Crawl-delay` of the group that names the bot, or else `*`, in ms; null for none (or not a number). */
export function crawlDelayOf(body: string, product = BOT): number | null {
  const token = product.toLowerCase()
  let agents: string[] = []
  let collecting = false
  let specific: number | null = null
  let global: number | null = null
  for (const raw of body.split(/\r\n|\r|\n/)) {
    const line = (raw.includes('#') ? raw.slice(0, raw.indexOf('#')) : raw).trim()
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const field = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (field === 'user-agent') {
      if (!collecting) agents = []
      agents.push(value.toLowerCase())
      collecting = true
      continue
    }
    collecting = false
    if (field !== 'crawl-delay' || !/^\d+(?:\.\d+)?$/.test(value)) continue
    const delay = Math.round(Number(value) * 1000)
    if (agents.includes(token)) specific ??= delay
    else if (agents.includes('*')) global ??= delay
  }
  return specific ?? global
}

const overOrigin = (url: string, origin: string): boolean => {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

export function createCrawler(options: CrawlerOptions = {}): Crawler {
  const policy = options.policy ?? DEFAULT_POLICY
  const resolver = options.resolver ?? defaultResolver(policy)
  const userAgent = options.userAgent ?? USER_AGENT
  const timeoutMs = options.timeoutMs ?? CRAWL_PAGE_TIMEOUT_MS
  const rules = options.rules ?? RULES
  const ruleIds = lightRuleIds(rules)
  const now = options.now ?? Date.now
  const base: SafeFetchOptions = {
    userAgent,
    policy,
    resolver,
    timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }
  const robots = new Map<string, RobotsEntry>()
  /** The fetch options for one call: the crawler's, and the call's own signal besides. */
  const withSignal = (signal: AbortSignal | undefined): SafeFetchOptions =>
    signal === undefined
      ? base
      : {
          ...base,
          signal: base.signal === undefined ? signal : AbortSignal.any([base.signal, signal]),
        }

  /** A site's robots.txt, read once and kept for ten minutes. */
  async function robotsOf(origin: string, signal?: AbortSignal): Promise<RobotsEntry> {
    const kept = robots.get(origin)
    if (kept !== undefined && now() - kept.at < ROBOTS_TTL_MS) return kept
    const url = `${origin}/robots.txt`
    const fetched = await safeFetch(url, {
      ...withSignal(signal),
      accept: 'text/plain,*/*;q=0.8',
      maxBytes: ROBOTS_MAX_BYTES,
      onTooLarge: 'truncate',
      maxRedirects: ROBOTS_MAX_REDIRECTS,
    })
    const response = fetched.response
    const challenged = response !== null && challengeOf(response.headers) !== null
    const facts = collectRobots({
      url,
      response:
        response === null || challenged
          ? null
          : { status: response.status, body: response.body, truncated: response.truncated },
      errorCode: challenged ? 'bot-challenge' : (fetched.error?.code ?? null),
    })
    const delayMs =
      facts.outcome === 'fetched' && response !== null
        ? crawlDelayOf(new TextDecoder().decode(response.body))
        : null
    const entry = { facts, delayMs, at: now() }
    if (robots.size >= MAX_ROBOTS_SITES) robots.delete(robots.keys().next().value ?? origin)
    robots.set(origin, entry)
    return entry
  }

  /** What robots.txt says of a page for a crawler (RFC 9309): `*` counts, and a file that cannot be read keeps the crawler out. */
  const verdict = (entry: RobotsEntry, url: string): 'allowed' | 'blocked' | 'unreachable' => {
    const { facts } = entry
    if (facts.outcome === 'fetched') {
      return matchRobots(facts.robots, BOT, url).allowed ? 'allowed' : 'blocked'
    }
    return facts.outcome === 'unavailable' ? 'allowed' : 'unreachable'
  }

  const failed = (
    outcome: PageOutcome,
    error: string | null,
    extra: Partial<PageResult> = {},
  ): PageResult => ({
    outcome,
    status: null,
    finalUrl: null,
    error,
    title: null,
    links: [],
    skeleton: null,
    issues: [],
    score: null,
    crawlDelayMs: null,
    ...extra,
  })

  async function page(
    url: string,
    pageOptions: { readonly anyOrigin?: boolean; readonly signal?: AbortSignal } = {},
  ): Promise<PageResult> {
    const call = withSignal(pageOptions.signal)
    const checked = checkUrl(url, policy)
    if (!checked.ok) return failed('error', checked.error.code)
    const origin = checked.url.origin
    const entry = await robotsOf(origin, pageOptions.signal)
    const allowed = verdict(entry, checked.url.href)
    if (allowed !== 'allowed') {
      return failed('blocked', allowed === 'blocked' ? 'robots' : 'robots-unreachable', {
        crawlDelayMs: entry.delayMs,
      })
    }
    const ended: { declined: 'offsite' | 'blocked' | null } = { declined: null }
    const fetched = await safeFetch(checked.url.href, {
      ...call,
      accept: PAGE_ACCEPT,
      beforeRedirect: async (to, hop) => {
        if (!pageOptions.anyOrigin && !overOrigin(to, origin)) {
          ended.declined = 'offsite'
          return false
        }
        const next = await robotsOf(new URL(to).origin, hop.signal)
        if (verdict(next, to) !== 'allowed') {
          ended.declined = 'blocked'
          return false
        }
        return true
      },
    })
    const response = fetched.response
    if (response === null) {
      if (ended.declined === 'offsite')
        return failed('offsite', null, { crawlDelayMs: entry.delayMs })
      if (ended.declined === 'blocked')
        return failed('blocked', 'robots', { crawlDelayMs: entry.delayMs })
      return failed('error', fetched.error?.code ?? 'fetch-failed', { crawlDelayMs: entry.delayMs })
    }
    const common = { status: response.status, finalUrl: response.url, crawlDelayMs: entry.delayMs }
    if (!pageOptions.anyOrigin && !overOrigin(response.url, origin)) {
      return failed('offsite', null, common)
    }
    if (challengeOf(response.headers) !== null) return failed('error', 'bot-challenge', common)
    if (response.status < 200 || response.status > 299) {
      return failed('error', `http-${String(response.status)}`, common)
    }
    const input = {
      url: response.url,
      status: response.status,
      headers: response.headers,
      body: response.body,
      certificate: null,
    }
    let facts
    try {
      facts =
        options.isolateParse === undefined
          ? collectPage(input, { deadline: performance.now() + timeoutMs })
          : await collectPageIsolated(input, {
              timeoutMs,
              ...(options.isolateParse.maxHeapMb === undefined
                ? {}
                : { maxHeapMb: options.isolateParse.maxHeapMb }),
              ...(call.signal === undefined ? {} : { signal: call.signal }),
            })
    } catch {
      return failed('error', 'page-unreadable', common)
    }
    if (!facts.isHtml || facts.html === null) return failed('not-html', null, common)
    const evaluation = evaluatePage(facts, { ruleIds, rules })
    const issues: IssueCount[] = []
    for (const result of evaluation.results) {
      if (result.status !== 'fail') continue
      const count =
        evaluation.findings.filter((finding) => finding.ruleId === result.id).length +
        (result.findingsOmitted ?? 0)
      issues.push({
        id: result.id,
        severity: result.severity,
        count: Math.max(1, count),
        title: result.title,
      })
    }
    const links = siteLinks(facts)
      .links.filter((link) => overOrigin(link, new URL(response.url).origin))
      .filter((link) => !NOT_PAGES.test(new URL(link).pathname))
      .slice(0, CRAWL_LINKS_MAX)
    return {
      outcome: 'ok',
      status: response.status,
      finalUrl: response.url,
      error: null,
      title: facts.html.title === null ? null : facts.html.title.slice(0, 200),
      links,
      skeleton: facts.html.skeleton,
      issues,
      score: scoreOf(evaluation.results, rules.length, true).overall,
      crawlDelayMs: entry.delayMs,
    }
  }

  async function seeds(originUrl: string, signal?: AbortSignal): Promise<SeedsResult> {
    const call = withSignal(signal)
    const checked = checkUrl(originUrl, policy)
    if (!checked.ok)
      return { robots: 'blocked', crawlDelayMs: null, sitemaps: 0, urls: [], more: false }
    const origin = checked.url.origin
    const entry = await robotsOf(origin, signal)
    const { facts } = entry
    if (facts.outcome === 'unreachable' || facts.outcome === 'failed') {
      return { robots: 'blocked', crawlDelayMs: null, sitemaps: 0, urls: [], more: false }
    }
    const named = facts.outcome === 'fetched' ? facts.robots.sitemaps : []
    const queue: string[] = []
    for (const entryName of named) {
      const address = sitemapUrl(entryName.value)
      if (address !== null && !queue.includes(address)) queue.push(address)
    }
    if (queue.length === 0) queue.push(`${origin}/sitemap.xml`)
    const urls: string[] = []
    const seen = new Set<string>()
    let files = 0
    let more = false
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      if (files >= CRAWL_SITEMAP_FILES) {
        more = true
        break
      }
      files++
      const fetched = await safeFetch(next, {
        ...call,
        accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
        maxBytes: SITEMAP_MAX_BYTES,
        maxRedirects: SITEMAP_MAX_REDIRECTS,
        onTooLarge: 'truncate',
      })
      const response = fetched.response
      if (response === null || response.status < 200 || response.status > 299) continue
      if (challengeOf(response.headers) !== null) continue
      const read = isGzip(response.body)
        ? await gunzip(response.body, response.truncated)
        : { body: response.body, truncated: response.truncated }
      if (read === null) continue
      const found = readSitemapLocs(read.body, read.truncated, CRAWL_SEEDS_MAX)
      for (const loc of found.locs) {
        if (found.index) {
          if (!queue.includes(loc) && queue.length < CRAWL_SITEMAP_FILES) queue.push(loc)
          continue
        }
        if (!overOrigin(loc, origin) || seen.has(loc)) continue
        if (verdict(entry, loc) !== 'allowed') continue
        if (urls.length >= CRAWL_SEEDS_MAX) {
          more = true
          break
        }
        seen.add(loc)
        urls.push(loc)
      }
      if (found.more && !found.index) more = true
      if (urls.length >= CRAWL_SEEDS_MAX) break
    }
    return {
      robots: facts.outcome === 'fetched' ? 'fetched' : 'none',
      crawlDelayMs: entry.delayMs,
      sitemaps: files,
      urls,
      more,
    }
  }

  return { page, seeds }
}
