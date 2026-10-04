import { createHash } from 'node:crypto'
import type { RenderOutcome } from '@arablyzer/browser'
import type { LabRun } from '@arablyzer/lab'
import {
  collectPage,
  collectPageIsolated,
  collectRobots,
  ENGINES,
  headerValues,
  lossOf,
  type CruxFacts,
  organizationalDomain,
  type KnowledgeGraphFacts,
  type OpenPageRankFacts,
  type SafeBrowsingFacts,
  type DnsFacts,
  type Engine,
  type LinkFacts,
  type PageFacts,
  type RenderedFacts,
  type RobotsFacts,
  type RobotsRule,
  type SearchFacts,
  type SitemapFacts,
} from '@arablyzer/collectors'
import {
  checkUrl,
  DEFAULT_POLICY,
  DEFAULT_TIMEOUT_MS,
  defaultResolver,
  redactUrl,
  safeFetch,
  type EgressPolicy,
  type FetchResult,
  type Resolver,
  type SafeFetchOptions,
} from '@arablyzer/egress'
import {
  Finding,
  MAX_SNIPPET_LENGTH,
  Report,
  SCHEMA_VERSION,
  SEVERITY_ORDER,
  type Facts,
  type LabFact,
  type Notice,
  type Page,
  type Redirect,
  type RenderRun,
  type RuleResult,
  type RuleStatus,
  type Summary,
  type Target,
} from '@arablyzer/report-schema'
import { scoreOf } from '@arablyzer/scoring'
import {
  AI_CRAWLERS,
  challengeOf,
  brandName,
  crawlerAccess,
  detectPlatforms,
  dialectOfPage,
  fitOf,
  fitsCountry,
  inferCountry,
  isMostlyArabic,
  readPage,
  xrayFamilies,
  isPublicUrl,
  matchRobots,
  renderMessage,
  robotsMatcher,
  RULES,
  RULESET_VERSION,
  type CollectorId,
  type DetectorFinding,
  type Evidence,
  type Rule,
} from '@arablyzer/rules'
import { boundSelector, boundText, boundValues } from './bounds'
import { SCAN_BUDGET_MS } from './budgets'
import { fetchCrux, type CruxOptions } from './crux'
import { fetchOpenPageRank, type OpenPageRankOptions } from './open-page-rank'
import { fetchKnowledgeGraph, type KnowledgeGraphOptions } from './knowledge-graph'
import { fetchSafeBrowsing, type SafeBrowsingOptions } from './safe-browsing'
import { lookupDns, txtResolverFor } from './dns'
import { checkLinks, MAX_LINKS } from './links'
import { runSearchTest } from './search-test'
import { ENGINE_VERSION, USER_AGENT } from './identity'
import { notice, type NoticeCode } from './notices'
import { progressEmitter, type ProgressListener, type ScanProgress } from './progress'
import { fetchSitemaps, SITEMAP_TIMEOUT_MS } from './sitemap'

export { ENGINE_VERSION, USER_AGENT }
/** Keeps reports small; the rest of a rule's findings are counted in findingsOmitted. */
export const MAX_FINDINGS_PER_RULE = 20
/** Google reads the first 500 KiB of robots.txt; RFC 9309 asks crawlers to read at least that. */
export const ROBOTS_MAX_BYTES = 500 * 1024
/** RFC 9309 §2.3.1.2: follow at least five redirects for robots.txt (Google stops there). */
export const ROBOTS_MAX_REDIRECTS = 5

const PAGE_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
const ROBOTS_ACCEPT = 'text/plain,*/*;q=0.8'
/** Heuristic for the little-text notice: fewer visible letters than this, while scripts load. */
const LITTLE_TEXT_LETTERS = 50
/** Below this, an engine is not started: it could not load a page in time. */
const MIN_RENDER_MS = 2_000
const ENGINE_NAMES: Readonly<Record<Engine, string>> = {
  chromium: 'Chromium',
  firefox: 'Firefox',
  webkit: 'WebKit',
}

/** The Lighthouse the lab package pins; named here too, for a run whose package did not load. */
const LIGHTHOUSE_VERSION = '13.5.0'

/** Lighthouse's lab metrics (M1.3b): information, never judged. */
export interface LabRequest {
  /** 60 s by default (LAB_TIMEOUT_MS), never more; what the scan's budget leaves otherwise. */
  readonly timeoutMs?: number
  /** Chromium's binary; ARABLYZER_CHROMIUM_PATH, else Playwright's Chromium. */
  readonly executablePath?: string
}

/** Below this, Lighthouse is not started: it could not load and measure a page in time. */
const MIN_LAB_MS = 20_000

/** Rendering in a browser (M1.1): the engines, one after the other. */
export interface RenderRequest {
  readonly engines: readonly Engine[]
  readonly screenshots?: boolean
  /**
   * The Arabic X-ray: the render goes through the Arabic words for the ones drawn wrongly, and keeps
   * a small picture of the first screen, to draw them on (report fact `xray`). A whole scan asks for
   * it; a tool's scan does not.
   */
  readonly xray?: boolean
  /** Receives each engine's screenshot of the first screen, when screenshots are asked for. */
  readonly onScreenshot?: (engine: Engine, png: Uint8Array) => void
  /** Browser binaries by engine; the ARABLYZER_<ENGINE>_PATH variables by default. */
  readonly executablePaths?: Partial<Record<Engine, string>>
  /** Per engine; BUILD-PLAN §11 by default (30 s for the first, 20 s for each further one). */
  readonly timeoutMs?: number
  readonly extraEngineTimeoutMs?: number
  /**
   * Whether the network here reaches nothing but the egress proxy; ARABLYZER_NETWORK_ISOLATED by
   * default. Without it, engines that need isolation (WebKit) are refused.
   */
  readonly networkIsolated?: boolean
}

export interface ScanOptions {
  /** Rule ids to run; all rules by default. Unknown ids throw a TypeError. */
  readonly ruleIds?: readonly string[]
  /** The rule set to choose from; tests pass their own. */
  readonly rules?: readonly Rule[]
  readonly policy?: EgressPolicy
  readonly resolver?: Resolver
  /**
   * The DNS-over-HTTPS resolver (RFC 8484) that the TXT lookups of the DNS rules go to, as its
   * URL: asked with safeFetch under the scan's policy, so vetted like every request and through
   * its egress proxy, if it has one. Without it, the scan's own resolver asks (c-ares), where the
   * process asks DNS itself; behind an egress proxy, which resolves every name, the scan has no
   * way to ask, and its DNS rules are left out (a notice says so), as rules that need a browser
   * are when the scan renders none.
   */
  readonly dohUrl?: string
  /** Per request (BUILD-PLAN §11: 30 s). */
  readonly timeoutMs?: number
  /**
   * Budget for parsing the page's HTML, which blocks the process while it runs, unless
   * `isolateParse`; timeoutMs by default. Past it, the rules that need the HTML report an error
   * and the scan is partial.
   */
  readonly parseTimeoutMs?: number
  /**
   * Reads the page's HTML in a thread of its own, with a heap of its own (H1 of the pre-launch
   * review): a page whose tree is too much for that heap, or that takes longer than
   * parseTimeoutMs wherever the parse has got to, is too complex, where read in this process it
   * could end it or hold its event loop until it was done. What is read is the same, as the
   * code is. The hosted scanner does; the CLI reads in its own process. `maxHeapMb` is the
   * thread's heap in MB (ISOLATED_HEAP_MB by default).
   */
  readonly isolateParse?: { readonly maxHeapMb?: number }
  /**
   * USER_AGENT by default. robots.txt names the bot by its part before the first "/", and a
   * group naming it can keep the scan from a page.
   */
  readonly userAgent?: string
  readonly signal?: AbortSignal
  /**
   * Render the page in a browser too. Without it, rules that need `render` are left out (a
   * notice says so), and naming one in ruleIds throws a TypeError.
   */
  readonly render?: RenderRequest
  /**
   * Real-user data from the Chrome UX Report, asked with this key (M1.3b) when a rule the scan
   * runs needs `crux`. Without it, those rules do not apply, and a notice says so. A page on a
   * private address is not asked about.
   */
  readonly crux?: CruxOptions
  /**
   * Google Safe Browsing, asked with this key when a rule the scan runs needs `safe-browsing`: the
   * page's URL and origin go to Google. Without it, those rules do not apply, and a notice says
   * so. A page on a private address is not asked about. Nothing is kept from one scan to the next.
   */
  readonly safeBrowsing?: SafeBrowsingOptions
  /**
   * Google's Knowledge Graph, asked with this key when a rule the scan runs needs `knowledge-graph`:
   * the site's brand name, as the page gives it, goes to Google, in Arabic and in English. Without
   * it, those rules do not apply, and a notice says so. A page on a private address is not asked
   * about.
   */
  readonly knowledgeGraph?: KnowledgeGraphOptions
  /**
   * Open PageRank, asked in a whole scan (one with no `ruleIds`) when this is given: the page's
   * domain goes to it, and its score, 0 to 10, to the report. With no key in it a notice says the
   * check is off; a page on a private address, or on a domain that is no one's own (a platform's
   * subdomain), is not asked about.
   */
  readonly openPageRank?: OpenPageRankOptions
  /** Lighthouse's lab metrics, after the render; its package loads only then. */
  readonly lab?: LabRequest
  /**
   * Receives each step as it happens (M2.1b), for a page that follows the scan live. It never
   * changes the report, and cannot break the scan.
   */
  readonly onProgress?: ProgressListener
}

/** The selected rules, sorted by id; a TypeError names any unknown id. */
export function selectRules(rules: readonly Rule[], ids?: readonly string[]): Rule[] {
  const sorted = [...rules].sort((a, b) => a.id.localeCompare(b.id, 'en'))
  if (ids === undefined) return sorted
  const unknown = ids.filter((id) => !sorted.some((rule) => rule.id === id))
  if (unknown.length > 0) throw new TypeError(`Unknown rule id: ${unknown.join(', ')}`)
  return sorted.filter((rule) => ids.includes(rule.id))
}

/**
 * Scans one URL (docs/design/phase-0.md §3). Deterministic: the same responses give the same
 * report, apart from fetchedAt and durationMs. robots.txt comes first, for the page and for any
 * page a redirect leads to: a page its site asks the bot not to check is never fetched (M2.4
 * plan §2).
 */
export async function scan(url: string, options: ScanOptions = {}): Promise<Report> {
  if (url.trim() === '') throw new TypeError('A URL is required')
  // timeoutMs itself is checked by safeFetch.
  const parseTimeoutMs = options.parseTimeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (
    options.parseTimeoutMs !== undefined &&
    !(Number.isFinite(parseTimeoutMs) && parseTimeoutMs > 0)
  ) {
    throw new TypeError(`parseTimeoutMs must be a positive number, got ${String(parseTimeoutMs)}`)
  }
  const started = performance.now()
  const progress = progressEmitter(options.onProgress)
  const userAgent = options.userAgent ?? USER_AGENT
  // The name robots.txt gives the bot: ArablyzerBot, for USER_AGENT.
  const bot = productToken(userAgent)
  const policy = options.policy ?? DEFAULT_POLICY
  // Chosen once, so robots.txt, the page and the DNS lookups resolve names the same way.
  const resolver = options.resolver ?? defaultResolver(policy)
  // How the DNS rules' TXT lookups are asked; without a way, the rules are left out of the scan.
  const txt = txtResolverFor({
    policy,
    resolver,
    userAgent,
    ...(options.dohUrl === undefined ? {} : { dohUrl: options.dohUrl }),
  })
  const { rules, renderSkipped, engineSkipped, dnsSkipped } = chooseRules(
    options.rules ?? RULES,
    options.ruleIds,
    options.render?.engines,
    txt !== undefined,
  )
  progress({ step: 'start', engines: [...(options.render?.engines ?? [])] })
  // The default rules, for a site found on a public address under --allow-private.
  const lockdown: EgressPolicy = { ...policy, allowPrivate: false }
  const base: SafeFetchOptions = {
    userAgent,
    policy,
    resolver,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }

  const finish = (
    target: Target,
    parts: {
      status: 'complete' | 'partial' | 'failed'
      notices: Notice[]
      page: Page | null
      results: RuleResult[]
      findings: Finding[]
      facts: Facts
      render?: RenderRun[]
      /** Whether the scan reached the page; not, it has no score. Reached unless said. */
      reached?: boolean
    },
  ): Report =>
    Report.parse({
      schemaVersion: SCHEMA_VERSION,
      generator: { name: 'arablyzer', version: ENGINE_VERSION, rulesetVersion: RULESET_VERSION },
      target,
      scan: {
        status: parts.status,
        durationMs: Math.round(performance.now() - started),
        notices: parts.notices,
        ...(parts.render === undefined ? {} : { render: parts.render }),
      },
      page: parts.page,
      summary: summarize(parts.results),
      score: scoreOf(parts.results, (options.rules ?? RULES).length, parts.reached ?? true),
      rules: parts.results,
      findings: parts.findings,
      facts: parts.facts,
    })

  const failed = (target: Target, notices: Notice[], error: string): Report =>
    finish(target, {
      status: 'failed',
      notices,
      page: null,
      results: rules.map((rule) => ruleResult(rule, 'error', { error })),
      findings: [],
      facts: {},
    })

  // Where the site asks the bot not to check the page, the scan stops and keeps nothing of it.
  const optedOut = (target: Target, robots: RobotsFacts, rule: RobotsRule): Report =>
    failed(
      target,
      [
        notice('opted-out', {
          bot,
          robots: robots.url,
          line: String(rule.line),
          rule: boundText(rule.text, MAX_SNIPPET_LENGTH),
        }),
      ],
      'opted-out',
    )

  // Each site's robots.txt, read once, the first time the scan comes to one of its pages.
  const robotsBySite = new Map<string, RobotsRead>()
  /**
   * robots.txt for a page's site, and the rule by which it keeps the bot from that page, if
   * any (M2.4 plan §2). Inside the page's fetch, the read gets that fetch's signal.
   */
  const robotsFor = async (
    pageUrl: string,
    fetchPolicy: EgressPolicy,
    signal?: AbortSignal,
  ): Promise<{ readonly read: RobotsRead; readonly rule: RobotsRule | null }> => {
    const site = new URL(pageUrl).origin
    let read = robotsBySite.get(site)
    if (read === undefined) {
      read = await fetchRobots(pageUrl, {
        ...base,
        policy: fetchPolicy,
        ...(signal === undefined ? {} : { signal }),
      })
      robotsBySite.set(site, read)
      progress({
        step: 'robots',
        outcome: read.facts.outcome,
        status: 'status' in read.facts ? read.facts.status : null,
      })
    }
    return { read, rule: optOutRule(read.facts, bot, pageUrl) }
  }

  // robots.txt before the page, so a page its site asks the bot not to check is never asked
  // for. A URL the egress rules refuse before any lookup has none to read: the page's fetch
  // says why.
  const requested = checkUrl(url, policy)
  let first: RobotsRead | null = null
  if (requested.ok) {
    const { read, rule } = await robotsFor(requested.url.href, policy)
    if (rule !== null) {
      return optedOut(
        {
          url: redactUrl(url),
          finalUrl: null,
          fetchedAt: read.startedAt,
          userAgent,
          http: { status: null, contentType: null, redirects: [] },
        },
        read.facts,
        rule,
      )
    }
    first = read
  }

  // A redirect the next page's site keeps the bot from: the fetch ends before that page.
  let declined = null as { readonly robots: RobotsFacts; readonly rule: RobotsRule } | null
  const fetched = await safeFetch(url, {
    ...base,
    // Under --allow-private, a site whose robots.txt was on a public address keeps the default
    // rules for its page, so DNS cannot move the page onto a private address.
    policy: first === null || first.privateAccess ? policy : lockdown,
    accept: PAGE_ACCEPT,
    // The next page's site may keep the bot from it too: its robots.txt is read before the
    // redirect is followed, with the chain's lockdown.
    beforeRedirect: async (to, hop) => {
      const { read, rule } = await robotsFor(to, hop.privateAccess ? policy : lockdown, hop.signal)
      if (rule !== null) declined = { robots: read.facts, rule }
      return rule === null
    },
  })
  const response = fetched.response
  const target: Target = {
    url: fetched.requestedUrl,
    finalUrl: response?.url ?? null,
    fetchedAt: fetched.startedAt,
    userAgent,
    http: {
      status: response?.status ?? null,
      contentType: response === null ? null : lastHeader(response.headers, 'content-type'),
      redirects: fetched.redirects.map(({ url: hop, status }) => ({ url: hop, status })),
    },
  }
  if (declined !== null) return optedOut(target, declined.robots, declined.rule)

  progress({
    step: 'page',
    status: target.http.status,
    contentType: target.http.contentType,
    error: fetched.error?.code ?? null,
    ...(response === null ? {} : { host: hostOf(response.url) }),
  })
  if (fetched.error !== null || response === null) {
    return failed(
      target,
      fetched.error === null ? [] : [notice(fetched.error.code)],
      'page-unavailable',
    )
  }

  // Under --allow-private, a chain that started on a public address lost private access; what
  // the scan fetches for the same site keeps that, so DNS cannot move it onto a private address.
  const robotsPolicy = fetched.privateAccess ? policy : lockdown
  // The rules read the robots.txt of the final page's site, read before that page was asked for.
  const { read: robotsRead } = await robotsFor(response.url, robotsPolicy)

  let page: PageFacts
  try {
    const input = {
      url: response.url,
      status: response.status,
      headers: response.headers,
      body: response.body,
      certificate:
        response.certificate === null
          ? null
          : { ...response.certificate, checkedAt: fetched.startedAt },
    }
    page =
      options.isolateParse === undefined
        ? collectPage(input, { deadline: performance.now() + parseTimeoutMs })
        : await collectPageIsolated(input, {
            timeoutMs: parseTimeoutMs,
            ...(options.isolateParse.maxHeapMb === undefined
              ? {}
              : { maxHeapMb: options.isolateParse.maxHeapMb }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
          })
  } catch {
    // A collector bug, or an input it cannot handle: the report says so instead of the scan crashing.
    return failed(target, [notice('page-unreadable')], 'page-unreadable')
  }
  // A bot challenge in place of the page (M2.3c) is not the page: nothing judges it as one, and
  // no browser and no Lighthouse opens it, where its script could get past it (BUILD-PLAN §13).
  const reached = pageReached(page)
  // For the rules that read it, and in the report only then: a scan without them reports as it
  // did before robots.txt came first.
  const robots = rules.some((rule) => rule.needs.includes('robots')) ? robotsRead.facts : undefined
  // The page's links to its own site, for the rules that read them (M2.3c): asked for while the
  // rest of the scan goes on, under the page's own lockdown, and never in a path robots.txt keeps
  // the bot from, as it would keep it from the page.
  const linking =
    rules.some((rule) => rule.needs.includes('links')) &&
    isSuccess(page.status) &&
    page.html !== null
      ? checkLinks(page, {
          base: { ...base, policy: robotsPolicy },
          optedOut: linkOptOut(robotsRead.facts, bot),
        }).catch((): LinkFacts => UNCHECKED_LINKS)
      : undefined
  // Real-user data, when a rule the scan runs reads it: the page's URL goes to Google with the
  // key. A scan none of whose rules reads it (a tool's, M2.2) asks nothing and says nothing of it.
  const readsCrux = rules.some((rule) => rule.needs.includes('crux'))
  const cruxSkipped: NoticeCode | null = !readsCrux
    ? null
    : options.crux === undefined
      ? 'crux-no-key'
      : fetched.privateAccess
        ? 'crux-private'
        : null
  // Real visitors' data is asked of Google, which never touches the site: a page the site
  // answered with a bot challenge has some to be asked for as much as one it sent, and a page it
  // refused any other way has none worth the question (M2.3c).
  const cruxAsked = isSuccess(page.status) || challengeOf(page.headers) !== null
  const crux =
    readsCrux && cruxSkipped === null && options.crux !== undefined && cruxAsked
      ? await fetchCrux(response.url, options.crux, { ...base, policy })
      : undefined
  // Safe Browsing: the same, for the rules that read it; the site is not asked, Google is.
  const readsSafeBrowsing = rules.some((rule) => rule.needs.includes('safe-browsing'))
  const safeBrowsingSkipped: NoticeCode | null = !readsSafeBrowsing
    ? null
    : options.safeBrowsing === undefined
      ? 'safe-browsing-no-key'
      : fetched.privateAccess
        ? 'safe-browsing-private'
        : null
  const safeBrowsing =
    readsSafeBrowsing && safeBrowsingSkipped === null && options.safeBrowsing !== undefined
      ? await fetchSafeBrowsing(response.url, options.safeBrowsing, { ...base, policy })
      : undefined
  // Knowledge Graph: the brand's name goes to Google, for the rules that read it.
  const readsKnowledgeGraph = rules.some((rule) => rule.needs.includes('knowledge-graph'))
  const knowledgeGraphSkipped: NoticeCode | null = !readsKnowledgeGraph
    ? null
    : options.knowledgeGraph === undefined
      ? 'knowledge-graph-no-key'
      : fetched.privateAccess
        ? 'knowledge-graph-private'
        : null
  const brand = isSuccess(page.status) ? brandName(page) : null
  const knowledgeGraph: KnowledgeGraphFacts | undefined =
    readsKnowledgeGraph && knowledgeGraphSkipped === null && options.knowledgeGraph !== undefined
      ? brand === null
        ? { outcome: 'no-name', brand: null, entities: [] }
        : await fetchKnowledgeGraph(brand.name, options.knowledgeGraph, { ...base, policy })
      : undefined
  // Open PageRank: the domain's authority, for a whole scan.
  const rankDomain = organizationalDomain(new URL(response.url).hostname)
  const rankKey = options.openPageRank?.apiKey
  // Only a whole scan the caller set up for it: a tool's scan names its rules and says nothing.
  const wantsRank = options.ruleIds === undefined && options.openPageRank !== undefined
  const openPageRankSkipped: NoticeCode | null = !wantsRank
    ? null
    : rankKey === undefined || rankKey === ''
      ? 'open-page-rank-no-key'
      : fetched.privateAccess
        ? 'open-page-rank-private'
        : null
  const openPageRank: OpenPageRankFacts | undefined =
    wantsRank && openPageRankSkipped === null && rankKey !== undefined && rankDomain !== null
      ? await fetchOpenPageRank(rankDomain, rankKey, options.openPageRank.endpoint, {
          ...base,
          policy,
        })
      : undefined
  if (crux !== undefined) progress({ step: 'crux', outcome: crux.outcome })
  else if (cruxSkipped !== null) progress({ step: 'crux', outcome: 'skipped' })
  // The TXT records the rules that read DNS ask for (M2.3c), and those alone, asked as the scan
  // is set to (txtResolverFor); none for a page on a local or private address.
  const dns =
    isSuccess(page.status) && txt !== undefined
      ? await lookupDns(response.url, rules, {
          txt,
          privateAccess: fetched.privateAccess,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        })
      : undefined
  // The browser gets the same lockdown: a public page never opens private addresses to it.
  const rendering =
    options.render === undefined
      ? undefined
      : reached && page.isHtml
        ? await renderAll(response.url, options.render, {
            policy: robotsPolicy,
            resolver: base.resolver ?? defaultResolver(robotsPolicy),
            started,
            progress,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
          })
        : { runs: [], rendered: [], notices: [], xrayImages: new Map(), challenged: false }

  const links = await linking
  // Lighthouse, after the render: one browser at a time (BUILD-PLAN §18.3.1), behind the same
  // lockdown. Information only, so its failure leaves the scan complete, with a notice. Not after
  // a browser was answered with a bot challenge: Lighthouse's navigation is not one the scan can
  // stop before the page's scripts run, and a challenge's could get past it (BUILD-PLAN §13). A
  // scan that asks for Lighthouse without a render has no such warning to go by.
  const labWanted = reached && page.isHtml ? options.lab : undefined
  const labRequest = rendering?.challenged === true ? undefined : labWanted
  if (labRequest !== undefined) progress({ step: 'lab-start' })
  const lab =
    labRequest === undefined
      ? undefined
      : await measureLab(response.url, labRequest, {
          policy: robotsPolicy,
          resolver: base.resolver ?? defaultResolver(robotsPolicy),
          started,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        })
  // The site's sitemaps, when a rule the scan runs reads them (M2.3c): those its robots.txt names,
  // or /sitemap.xml, with the lockdown the page's chain ended with, and each site's opt-out. They
  // are for search engines, which reach public sites alone: a local site is not asked for them.
  // After the render and Lighthouse, so that waiting for a sitemap cannot shorten either; they wait
  // for what the scan has left, SITEMAP_TIMEOUT_MS at most, and only the network's time counts.
  const sitemapRead =
    rules.some((rule) => rule.needs.includes('sitemap')) && isPublicUrl(response.url)
      ? await fetchSitemaps(robotsRead.facts, new URL(response.url).origin, {
          base: { ...base, policy: robotsPolicy },
          privateAccess: fetched.privateAccess,
          budgetMs: Math.min(SITEMAP_TIMEOUT_MS, SCAN_BUDGET_MS - (performance.now() - started)),
          // A sitemap is a request of the scan's own, made as a crawler would, like a link: a
          // group naming the bot counts, and `User-agent: *` where none names it.
          allowed: async (to, privateAccess, signal) => {
            const { read } = await robotsFor(to, privateAccess ? policy : lockdown, signal)
            return !linkOptOut(read.facts, bot)(to)
          },
        })
      : undefined
  const sitemap =
    sitemapRead !== undefined && 'facts' in sitemapRead ? sitemapRead.facts : undefined
  // The site's own search, for the rules that read it (a tool's scan): after everything else, so
  // that its pauses cannot shorten the render or Lighthouse, and at the page's own lockdown.
  const search: SearchFacts | undefined =
    rules.some((rule) => rule.needs.includes('search')) && reached && page.html !== null
      ? await runSearchTest(page, {
          base: { ...base, policy: robotsPolicy },
          optedOut: linkOptOut(robotsRead.facts, bot),
          platformId: platformOf(page),
        }).catch((): SearchFacts => ({ outcome: 'not-found' }))
      : undefined
  // Some sitemap could not be checked, or robots.txt could not be read, so none is known.
  const sitemapUnread =
    sitemapRead !== undefined &&
    (sitemap === undefined || sitemap.checked.some((check) => check.outcome === 'failed'))
  const notices = [
    ...pageNotices(page, robots),
    ...(renderSkipped ? [notice('render-skipped')] : []),
    ...(engineSkipped.length > 0
      ? [
          notice('render-engine-skipped', {
            engines: engineSkipped.map((engine) => ENGINE_NAMES[engine]).join(', '),
          }),
        ]
      : []),
    ...(rendering?.notices ?? []),
    ...(cruxSkipped === null ? [] : [notice(cruxSkipped)]),
    ...(openPageRankSkipped === null ? [] : [notice(openPageRankSkipped)]),
    ...(openPageRank?.outcome === 'failed'
      ? [notice(openPageRank.refused === true ? 'open-page-rank-refused' : 'open-page-rank-failed')]
      : []),
    ...(knowledgeGraphSkipped === null ? [] : [notice(knowledgeGraphSkipped)]),
    ...(knowledgeGraph?.outcome === 'failed'
      ? [
          notice(
            knowledgeGraph.refused === true ? 'knowledge-graph-refused' : 'knowledge-graph-failed',
          ),
        ]
      : []),
    ...(safeBrowsingSkipped === null ? [] : [notice(safeBrowsingSkipped)]),
    ...(safeBrowsing?.outcome === 'failed'
      ? [notice(safeBrowsing.refused === true ? 'safe-browsing-refused' : 'safe-browsing-failed')]
      : []),
    ...(crux?.outcome === 'not-found' ? [notice('crux-not-found')] : []),
    ...(crux?.outcome === 'failed'
      ? [notice(crux.refused === true ? 'crux-refused' : 'crux-failed')]
      : []),
    ...(sitemapUnread ? [notice('sitemap-unchecked')] : []),
    ...(labWanted !== undefined && labRequest === undefined ? [notice('lab-challenged')] : []),
    ...(lab === undefined || lab.status === 'measured' ? [] : [notice(`lab-${lab.status}`)]),
    ...(lab?.limited === true ? [notice('request-limit', { engine: 'Lighthouse' })] : []),
    ...(dns?.notice === 'dns-unchecked'
      ? [notice('dns-unchecked', { domain: dns.facts.domain })]
      : []),
    ...(dnsSkipped ? [notice('dns-unavailable')] : []),
    ...searchNotices(search),
    ...linkNotices(links, bot),
  ]
  if (lab !== undefined) progress({ step: 'lab', status: lab.status })
  progress({ step: 'rules', rules: rules.length })
  const { results, findings } = evaluateRules(rules, page, {
    robots,
    rendered: rendering?.rendered,
    crux,
    safeBrowsing,
    knowledgeGraph,
    redirects: target.http.redirects,
    dns: dns?.facts,
    links,
    search,
    sitemap,
    sitemapUnknown: sitemapRead !== undefined && 'failed' in sitemapRead,
  })
  // An engine that was asked for and did not render leaves the scan short, whatever the rules.
  const unrendered = rendering?.runs.some((run) => run.status !== 'rendered') ?? false

  return finish(target, {
    // A scan that did not reach the page is short, whatever the rules beside the page said: the
    // CLI exits 2 for it (docs/design/phase-0.md §3), and it has no score (M2.3c review).
    status:
      unrendered || !reached || results.some((result) => result.status === 'error')
        ? 'partial'
        : 'complete',
    reached,
    notices,
    // A challenge's language and script are not the page's.
    page: challengeOf(page.headers) === null ? pageSummary(page) : null,
    results,
    findings,
    facts: {
      ...robotsFacts(robots, page.url),
      ...cruxFacts(crux),
      ...platformFacts(page, rules),
      ...knowledgeGraphFacts(knowledgeGraph),
      ...openPageRankFacts(openPageRank),
      ...arabicFontsFacts(rendering?.rendered, rules),
      ...searchFacts(search),
      ...countryFitFacts(page, rules),
      ...dialectFacts(page, rules),
      ...xrayFacts(rendering),
      ...(lab === undefined ? {} : { lab: labFact(lab) }),
    },
    ...(rendering === undefined ? {} : { render: rendering.runs }),
  })
}

/**
 * Rules for a scan. Without rendering, those that need it are left out; with it, so are those
 * that read only engines the scan does not render in (Chromium alone reports used fonts). Without
 * a way to ask DNS (txtResolverFor), those that read DNS records are left out too. Named by id,
 * any kind is refused instead.
 */
function chooseRules(
  all: readonly Rule[],
  ids: readonly string[] | undefined,
  engines: readonly Engine[] | undefined,
  dnsAvailable = true,
): { rules: Rule[]; renderSkipped: boolean; engineSkipped: Engine[]; dnsSkipped: boolean } {
  // The site's search is asked only by a scan that names its rules (a tool's): never in a whole
  // scan, where a dozen requests to every site's search would be a load nobody asked for.
  const named = selectRules(all, ids).filter(
    (rule) => ids !== undefined || !rule.needs.includes('search'),
  )
  const needDns = named.filter((rule) => rule.needs.includes('dns'))
  if (!dnsAvailable && ids !== undefined && needDns.length > 0) {
    throw new TypeError(
      `These rules need DNS records, and this scan has no way to ask for them: ${needDns
        .map((rule) => rule.id)
        .join(', ')}`,
    )
  }
  const dnsSkipped = !dnsAvailable && needDns.length > 0
  const selected = dnsSkipped ? named.filter((rule) => !needDns.includes(rule)) : named
  const needRender = selected.filter((rule) => rule.needs.includes('render'))
  if (engines === undefined) {
    if (ids !== undefined && needRender.length > 0) {
      throw new TypeError(
        `These rules need the page rendered in a browser: ${needRender.map((rule) => rule.id).join(', ')}`,
      )
    }
    return {
      rules: selected.filter((rule) => !needRender.includes(rule)),
      renderSkipped: needRender.length > 0,
      engineSkipped: [],
      dnsSkipped,
    }
  }
  const unread = needRender.filter(
    (rule) =>
      rule.renderEngines !== undefined &&
      !rule.renderEngines.some((engine) => engines.includes(engine)),
  )
  if (ids !== undefined && unread.length > 0) {
    throw new TypeError(
      `These rules read engines this scan does not render in: ${unread
        .map((rule) => `${rule.id} (${(rule.renderEngines ?? []).join(', ')})`)
        .join(', ')}`,
    )
  }
  const engineSkipped = [...new Set(unread.flatMap((rule) => rule.renderEngines ?? []))]
  return {
    rules: selected.filter((rule) => !unread.includes(rule)),
    renderSkipped: false,
    engineSkipped,
    dnsSkipped,
  }
}

interface Rendering {
  readonly runs: RenderRun[]
  readonly rendered: RenderedFacts[]
  readonly notices: Notice[]
  /** The X-ray's picture of the first screen, by engine. */
  readonly xrayImages: ReadonlyMap<Engine, Uint8Array>
  /** A browser was answered with a bot challenge in place of the page (M2.3c). */
  readonly challenged: boolean
}

/**
 * Renders the page in each engine, one after the other, within what is left of the scan's
 * 120 s (BUILD-PLAN §11). The browser package loads only here, so scans without it never load
 * Playwright.
 */
async function renderAll(
  url: string,
  request: RenderRequest,
  context: {
    readonly policy: EgressPolicy
    readonly resolver: Resolver
    readonly started: number
    readonly progress: (progress: ScanProgress) => void
    readonly signal?: AbortSignal
  },
): Promise<Rendering> {
  const runs: RenderRun[] = []
  const rendered: RenderedFacts[] = []
  const notices: Notice[] = []
  const xrayImages = new Map<Engine, Uint8Array>()
  let challenged = false
  let browser: typeof import('@arablyzer/browser')
  try {
    browser = await import('@arablyzer/browser')
  } catch {
    // Playwright is an optional dependency: without it, no engine is there (M1.3b review).
    for (const engine of request.engines) {
      const run: RenderRun = {
        engine,
        version: null,
        status: 'unavailable',
        durationMs: 0,
        requests: { total: 0, refused: 0 },
      }
      runs.push(run)
      context.progress({ step: 'render', run })
      notices.push(notice('engine-unavailable', { engine: ENGINE_NAMES[engine] }))
    }
    return { runs, rendered, notices, xrayImages: new Map(), challenged: false }
  }
  const { renderPage, RENDER_TIMEOUT_MS, EXTRA_ENGINE_TIMEOUT_MS } = browser
  for (const [index, engine] of request.engines.entries()) {
    const name = ENGINE_NAMES[engine]
    const own =
      index === 0
        ? (request.timeoutMs ?? RENDER_TIMEOUT_MS)
        : (request.extraEngineTimeoutMs ?? EXTRA_ENGINE_TIMEOUT_MS)
    const budget = Math.min(own, SCAN_BUDGET_MS - (performance.now() - context.started))
    if (budget < MIN_RENDER_MS) {
      const run: RenderRun = {
        engine,
        version: null,
        status: 'timeout',
        durationMs: 0,
        requests: { total: 0, refused: 0 },
      }
      runs.push(run)
      context.progress({ step: 'render', run })
      notices.push(notice('render-timeout', { engine: name }))
      continue
    }
    context.progress({ step: 'render-start', engine })
    const [outcome] = await renderPage(url, {
      engines: [engine],
      policy: context.policy,
      resolver: context.resolver,
      timeoutMs: Math.round(budget),
      screenshots: request.screenshots === true,
      ...(request.xray === true ? { xray: xrayFamilies } : {}),
      ...(request.executablePaths === undefined
        ? {}
        : { executablePaths: request.executablePaths }),
      ...(request.networkIsolated === undefined
        ? {}
        : { networkIsolated: request.networkIsolated }),
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    })
    if (outcome === undefined) continue
    const run = renderRun(outcome)
    runs.push(run)
    context.progress({ step: 'render', run })
    if (outcome.facts !== null) {
      rendered.push(outcome.facts)
      if (outcome.facts.truncated) notices.push(notice('render-truncated', { engine: name }))
    }
    if (outcome.screenshot !== null) request.onScreenshot?.(engine, outcome.screenshot)
    if (outcome.xrayImage != null) xrayImages.set(engine, outcome.xrayImage)
    if (outcome.status === 'challenged') {
      challenged = true
      notices.push(
        notice('render-challenged', {
          engine: name,
          service: outcome.challenge?.service ?? '',
          status: String(outcome.challenge?.status ?? ''),
        }),
      )
    }
    if (outcome.status === 'failed') notices.push(notice('render-failed', { engine: name }))
    if (outcome.status === 'timeout') notices.push(notice('render-timeout', { engine: name }))
    if (outcome.status === 'unavailable') {
      notices.push(notice('engine-unavailable', { engine: name }))
    }
    if (outcome.status === 'refused') notices.push(notice('engine-refused', { engine: name }))
    if (outcome.requests.limited) notices.push(notice('request-limit', { engine: name }))
    // Counted like the request limit: in the run's refusals, and told as a notice (M1 review).
    if (outcome.pageRequests.sending > 0) {
      notices.push(notice('request-refused', { engine: name }))
    }
    if (outcome.pageRequests.overHosts > 0) {
      notices.push(notice('host-limit', { engine: name, hosts: String(browser.DEFAULT_MAX_HOSTS) }))
    }
  }
  return { runs, rendered, notices, xrayImages, challenged }
}

/**
 * A render as the report shows it: the page's own requests, and those not let through: refused by
 * the egress proxy, past the request limit or the host limit, or for sending data (M1 review). A
 * render a bot challenge ended is one that failed; the notice says why.
 */
export function renderRun(outcome: RenderOutcome): RenderRun {
  const { made, overLimit, overHosts, sending } = outcome.pageRequests
  return {
    engine: outcome.engine,
    version: outcome.version === null || outcome.version === '' ? null : outcome.version,
    status: outcome.status === 'challenged' ? 'failed' : outcome.status,
    durationMs: outcome.durationMs,
    requests: {
      total: made,
      refused: outcome.requests.refused + overLimit + overHosts + sending,
    },
  }
}

export interface EvaluateOptions {
  /** Rule ids to run; all rules by default. Unknown ids throw a TypeError. */
  readonly ruleIds?: readonly string[]
  /** The rule set to choose from; tests pass their own. */
  readonly rules?: readonly Rule[]
  /** robots.txt for the page's site; without it, rules that need it report an error. */
  readonly robots?: RobotsFacts
  /** The page as engines rendered it; without it, rules that need `render` are left out. */
  readonly rendered?: readonly RenderedFacts[]
  /** Real-user data; without it, rules that need `crux` do not apply. */
  readonly crux?: CruxFacts
  /** What Safe Browsing said; without it, rules that need `safe-browsing` do not apply. */
  readonly safeBrowsing?: SafeBrowsingFacts
  /** What Knowledge Graph said; without it, rules that need `knowledge-graph` do not apply. */
  readonly knowledgeGraph?: KnowledgeGraphFacts
  /**
   * The redirects the page's fetch followed, in order (the report's target.http.redirects);
   * without them, rules that need them do not apply.
   */
  readonly redirects?: readonly Redirect[]
  /** The page's DNS records (M2.3c); without them, rules that need `dns` do not apply. */
  readonly dns?: DnsFacts
  /** How the checks of the page's links ended (M2.3c); without them, rules that need `links` do not apply. */
  readonly links?: LinkFacts
  /** The site's search's answers; without them, rules that need `search` do not apply. */
  readonly search?: SearchFacts
  /** The site's sitemaps; without them, rules that need them do not apply. */
  readonly sitemap?: SitemapFacts
}

export interface Evaluation {
  readonly results: RuleResult[]
  readonly findings: Finding[]
}

/**
 * Runs rules on facts already collected, without the network: what scan() does once it has
 * fetched the page. The SEO self-audit uses it on rendered pages.
 */
export function evaluatePage(page: PageFacts, options: EvaluateOptions = {}): Evaluation {
  // Every engine counts as asked for: a rule whose engines did not render reports an error.
  const { rules } = chooseRules(
    options.rules ?? RULES,
    options.ruleIds,
    options.rendered === undefined ? undefined : ENGINES,
  )
  return evaluateRules(rules, page, options)
}

/** What was collected beside the page, each for the rules that need it. */
interface Collected {
  readonly robots?: RobotsFacts | undefined
  readonly rendered?: readonly RenderedFacts[] | undefined
  readonly crux?: CruxFacts | undefined
  readonly safeBrowsing?: SafeBrowsingFacts | undefined
  readonly knowledgeGraph?: KnowledgeGraphFacts | undefined
  readonly redirects?: readonly Redirect[] | undefined
  readonly dns?: DnsFacts | undefined
  readonly links?: LinkFacts | undefined
  readonly search?: SearchFacts | undefined
  readonly sitemap?: SitemapFacts | undefined
  /**
   * The sitemaps were asked for and robots.txt could not be read, so which they are is not known:
   * the rules that read them could not check. A sitemap that could not be checked is one `failed`
   * check in `sitemap` instead, for the rules to judge the rest.
   */
  readonly sitemapUnknown?: boolean
}

function evaluateRules(rules: readonly Rule[], page: PageFacts, collected: Collected): Evaluation {
  const results: RuleResult[] = []
  const findings: Finding[] = []
  const reached = pageReached(page)
  for (const rule of rules) {
    const outcome = evaluate(rule, page, collected, reached)
    results.push(
      ruleResult(rule, outcome.status, {
        ...(outcome.error === undefined ? {} : { error: outcome.error }),
        findingsOmitted: outcome.omitted,
      }),
    )
    findings.push(...outcome.findings)
  }
  findings.sort(compareFindings)
  return { results, findings }
}

/** robots.txt as a scan read it. */
interface RobotsRead {
  readonly facts: RobotsFacts
  /** When the fetch began: the report's fetchedAt, when the page was never fetched. */
  readonly startedAt: string
  /** Whether private addresses were still open when it ended (FetchResult.privateAccess). */
  readonly privateAccess: boolean
}

async function fetchRobots(pageUrl: string, base: SafeFetchOptions): Promise<RobotsRead> {
  const url = new URL('/robots.txt', pageUrl).href
  const fetched: FetchResult = await safeFetch(url, {
    ...base,
    accept: ROBOTS_ACCEPT,
    maxBytes: ROBOTS_MAX_BYTES,
    onTooLarge: 'truncate',
    maxRedirects: ROBOTS_MAX_REDIRECTS,
  })
  const response = fetched.response
  // A bot challenge in place of robots.txt is not the site's robots.txt: it tells nothing.
  const challenged = response !== null && challengeOf(response.headers) !== null
  return {
    facts: collectRobots({
      url,
      response:
        response === null || challenged
          ? null
          : { status: response.status, body: response.body, truncated: response.truncated },
      errorCode: challenged ? 'bot-challenge' : (fetched.error?.code ?? null),
    }),
    startedAt: fetched.startedAt,
    privateAccess: fetched.privateAccess,
  }
}

/** The name robots.txt gives a bot (RFC 9309 §2.2.1): its user agent before the first "/". */
function productToken(userAgent: string): string {
  return userAgent.split('/', 1)[0]?.trim() ?? ''
}

/**
 * The rule by which robots.txt asks the bot not to check a URL (M2.4 plan §2), or null. Only a
 * group that names the bot counts: `User-agent: *` speaks to crawlers, and a scan someone asks
 * for is a visit, not a crawl. A robots.txt that could not be read asks nothing.
 */
function optOutRule(robots: RobotsFacts, bot: string, url: string): RobotsRule | null {
  if (robots.outcome !== 'fetched') return null
  const match = matchRobots(robots.robots, bot, url)
  return match.group === 'specific' && !match.allowed ? match.rule : null
}

/**
 * Whether robots.txt keeps the bot from a link's address, for many addresses (M2.3c): the
 * crawler's groups are chosen once, and asked of the links to be checked alone. Unlike the page
 * (optOutRule), which someone asked for, a link is a request of the scan's own, made as a crawler
 * would: a group naming the bot counts, and the `User-agent: *` group too where none names it
 * (RFC 9309 §2.2.1). A robots.txt that could not be read asks nothing.
 */
function linkOptOut(robots: RobotsFacts, bot: string): (url: string) => boolean {
  if (robots.outcome !== 'fetched') return () => false
  const match = robotsMatcher(robots.robots, bot)
  return (url) => !match(url).allowed
}

interface Outcome {
  readonly status: RuleStatus
  readonly error?: string
  readonly findings: readonly Finding[]
  readonly omitted?: number
}

/**
 * What a rule reads beside the page itself: robots.txt and the sitemaps are the site's, `response`
 * is the page's answer, whatever it was, and `crux` is what Google holds of the URL's visitors,
 * which was asked for when the page answered a bot challenge too. Their rules run whatever the
 * page answered.
 */
const BESIDE_THE_PAGE: ReadonlySet<CollectorId> = new Set([
  'robots',
  'sitemap',
  'response',
  'crux',
  'safe-browsing',
  'knowledge-graph',
])

function evaluate(rule: Rule, page: PageFacts, collected: Collected, reached: boolean): Outcome {
  const { robots, rendered, crux, safeBrowsing, knowledgeGraph } = collected
  const needsPage = rule.needs.some((need) => !BESIDE_THE_PAGE.has(need))
  const needsRender = rule.needs.includes('render')
  const needsHtml = rule.needs.includes('html') || rule.needs.includes('text') || needsRender
  if (needsPage && !reached) return { status: 'not-applicable', findings: [] }
  if (needsHtml && page.htmlTooComplex) {
    return { status: 'error', error: 'page-too-complex', findings: [] }
  }
  if (needsHtml && (page.html === null || page.text === null)) {
    return { status: 'not-applicable', findings: [] }
  }
  if (rule.needs.includes('robots') && (robots === undefined || robots.outcome === 'failed')) {
    return { status: 'error', error: 'robots-unchecked', findings: [] }
  }
  if (rule.needs.includes('sitemap') && collected.sitemapUnknown === true) {
    return { status: 'error', error: 'sitemap-unchecked', findings: [] }
  }
  // The site's search: not asked (a whole scan, or no search found), nothing to judge.
  const search = rule.needs.includes('search') ? collected.search : undefined
  if (rule.needs.includes('search') && search === undefined) {
    return { status: 'not-applicable', findings: [] }
  }
  // Only for the rules that read them, like the redirects; not asked for, on a local site or
  // without a scan, they leave the rules nothing to judge.
  const sitemap = rule.needs.includes('sitemap') ? collected.sitemap : undefined
  if (rule.needs.includes('sitemap') && sitemap === undefined) {
    return { status: 'not-applicable', findings: [] }
  }
  // Without a key, or for a private page, CrUX was not asked: nothing to judge.
  if (rule.needs.includes('crux') && crux === undefined) {
    return { status: 'not-applicable', findings: [] }
  }
  if (rule.needs.includes('crux') && crux?.outcome === 'failed') {
    return { status: 'error', error: 'crux-unchecked', findings: [] }
  }
  // Safe Browsing was not asked for (no key, or a private page): nothing to judge; asked, with no
  // usable answer, the rule could not check.
  if (rule.needs.includes('safe-browsing') && safeBrowsing === undefined) {
    return { status: 'not-applicable', findings: [] }
  }
  if (rule.needs.includes('safe-browsing') && safeBrowsing?.outcome === 'failed') {
    return { status: 'error', error: 'safe-browsing-unchecked', findings: [] }
  }
  if (rule.needs.includes('knowledge-graph') && knowledgeGraph === undefined) {
    return { status: 'not-applicable', findings: [] }
  }
  if (rule.needs.includes('knowledge-graph') && knowledgeGraph?.outcome === 'failed') {
    return { status: 'error', error: 'knowledge-graph-unchecked', findings: [] }
  }
  // Only for the rules that read them: the others see the evidence they always did.
  const redirects = rule.needs.includes('redirects') ? collected.redirects : undefined
  if (rule.needs.includes('redirects') && redirects === undefined) {
    return { status: 'not-applicable', findings: [] }
  }
  // DNS records (M2.3c): none for a page on a local or private address, nothing to judge; the
  // rule's own lookup without an answer, it could not check.
  const dns = rule.needs.includes('dns') ? collected.dns : undefined
  if (rule.needs.includes('dns')) {
    if (dns === undefined) return { status: 'not-applicable', findings: [] }
    const own = ownLookup(rule, dns)
    if (own === undefined || own.outcome === 'failed') {
      return { status: 'error', error: 'dns-unchecked', findings: [] }
    }
  }
  // The page's links to its own site (M2.3c): none asked for, nothing to judge; links, but none
  // answered, the rule could not check.
  const links = rule.needs.includes('links') ? collected.links : undefined
  if (rule.needs.includes('links')) {
    if (links === undefined) return { status: 'not-applicable', findings: [] }
    if (links.total > 0 && !links.checks.some((check) => check.outcome === 'answered')) {
      return { status: 'error', error: 'links-unchecked', findings: [] }
    }
  }
  // Only the engines the rule can read; none of them rendered means it could not check.
  const seen = needsRender
    ? (rendered ?? []).filter(
        (facts) => rule.renderEngines === undefined || rule.renderEngines.includes(facts.engine),
      )
    : undefined
  if (seen?.length === 0) return { status: 'error', error: 'not-rendered', findings: [] }
  // A rule that reads the page's files sees only the engines that read them.
  const read = rule.needs.includes('files') ? seen?.filter((facts) => facts.filesRead) : seen
  if (read?.length === 0) return { status: 'error', error: 'files-unread', findings: [] }
  const evidence: Evidence = {
    page,
    ...(redirects === undefined ? {} : { redirects }),
    ...(dns === undefined ? {} : { dns }),
    ...(links === undefined ? {} : { links }),
    ...(search === undefined ? {} : { search }),
    ...(robots === undefined ? {} : { robots }),
    ...(read === undefined ? {} : { rendered: read }),
    ...(crux === undefined ? {} : { crux }),
    ...(safeBrowsing === undefined ? {} : { safeBrowsing }),
    ...(knowledgeGraph === undefined ? {} : { knowledgeGraph }),
    ...(sitemap === undefined ? {} : { sitemap }),
  }
  try {
    if (!rule.appliesTo(page, evidence)) return { status: 'not-applicable', findings: [] }
    // Evidence there in part, such as the sitemaps some of which could not be read, may leave the
    // rule nothing to judge; then it is an error, and not a pass.
    const couldNotCheck = rule.couldNotCheck?.(evidence) ?? null
    if (couldNotCheck !== null) return { status: 'error', error: couldNotCheck, findings: [] }
    const detected = rule.detect(evidence)
    const { kept, total } = firstByPosition(detected, MAX_FINDINGS_PER_RULE)
    const status = rule.manualCheck === true ? 'needs-review' : total > 0 ? 'fail' : 'pass'
    return { status, findings: convert(rule, kept, page.url), omitted: total - kept.length }
  } catch {
    // A bug in a rule (a throw, a missing message, output the schema rejects) must not take the
    // whole scan down; the report says which rule failed.
    return { status: 'error', error: 'rule-failed', findings: [] }
  }
}

/** The TXT lookup of the name the rule reads (txtName); undefined when there is none. */
function ownLookup(rule: Rule, dns: DnsFacts): DnsFacts['txt'][number] | undefined {
  try {
    const name = rule.txtName?.(dns.domain)
    return dns.txt.find((lookup) => lookup.name === name)
  } catch {
    return undefined
  }
}

/**
 * The first `limit` findings by position, in a single pass that holds no more than that; ties
 * keep the detector's order. `total` counts them all.
 */
function firstByPosition(
  detected: Iterable<DetectorFinding>,
  limit: number,
): { kept: DetectorFinding[]; total: number } {
  const kept: DetectorFinding[] = []
  let total = 0
  for (const finding of detected) {
    total++
    if (kept.length === limit) {
      const last = kept.at(-1)
      if (last === undefined || comparePosition(finding, last) >= 0) continue
    }
    let index = kept.length
    while (index > 0) {
      const previous = kept[index - 1]
      if (previous === undefined || comparePosition(finding, previous) >= 0) break
      index--
    }
    kept.splice(index, 0, finding)
    if (kept.length > limit) kept.pop()
  }
  return { kept, total }
}

function comparePosition(a: DetectorFinding, b: DetectorFinding): number {
  return (
    (a.location?.line ?? 0) - (b.location?.line ?? 0) || columnOf(a.location) - columnOf(b.location)
  )
}

function columnOf(location: DetectorFinding['location']): number {
  return location !== undefined && 'column' in location ? location.column : 0
}

/**
 * The findings a rule reports → report findings: values bounded, messages rendered, fingerprints
 * unique. Throws when a finding does not fit the report schema.
 */
function convert(rule: Rule, detected: readonly DetectorFinding[], pageUrl: string): Finding[] {
  const seen = new Map<string, number>()
  return detected.map((finding): Finding => {
    const url = finding.url ?? pageUrl
    const parts = [rule.id, url, finding.selector ?? '', finding.message, finding.key ?? '']
    const base = parts.join('\n')
    const occurrence = (seen.get(base) ?? 0) + 1
    seen.set(base, occurrence)
    const values = finding.values === undefined ? {} : boundValues(finding.values)
    const template = (lang: 'ar' | 'en') => {
      const text = rule.copy[lang].messages[finding.message]
      if (text === undefined) throw new Error(`${rule.id}: no ${lang} message "${finding.message}"`)
      return renderMessage(text, values)
    }
    return Finding.parse({
      ruleId: rule.id,
      severity: rule.severity,
      fingerprint: hash(occurrence === 1 ? base : `${base}\n#${occurrence}`),
      message: { ar: template('ar'), en: template('en') },
      evidence: {
        url: boundText(url),
        ...(finding.selector === undefined ? {} : { selector: boundSelector(finding.selector) }),
        ...(finding.snippet === undefined
          ? {}
          : { snippet: boundText(finding.snippet, MAX_SNIPPET_LENGTH) }),
        ...(finding.location === undefined ? {} : { location: finding.location }),
        ...(finding.engines === undefined || finding.engines.length === 0
          ? {}
          : { engines: [...new Set(finding.engines)] }),
        ...(finding.box === undefined ? {} : { box: finding.box }),
        ...(Object.keys(values).length === 0 ? {} : { values }),
      },
    })
  })
}

/** Ties keep the detector's own order: Array.prototype.sort is stable and detectors are deterministic. */
function compareFindings(a: Finding, b: Finding): number {
  return (
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
    a.ruleId.localeCompare(b.ruleId, 'en') ||
    (a.evidence.location?.line ?? 0) - (b.evidence.location?.line ?? 0) ||
    (a.evidence.location?.column ?? 0) - (b.evidence.location?.column ?? 0)
  )
}

function ruleResult(
  rule: Rule,
  status: RuleStatus,
  extra: { error?: string; findingsOmitted?: number } = {},
): RuleResult {
  return {
    id: rule.id,
    version: rule.version,
    category: rule.category,
    severity: rule.severity,
    ...(rule.wcag === undefined || rule.wcag.length === 0 ? {} : { wcag: [...rule.wcag] }),
    status,
    title: { ar: rule.copy.ar.title, en: rule.copy.en.title },
    ...(extra.findingsOmitted === undefined || extra.findingsOmitted === 0
      ? {}
      : { findingsOmitted: extra.findingsOmitted }),
    ...(extra.error === undefined ? {} : { error: extra.error }),
  }
}

/** Rule statuses, and failed rules by severity. */
export function summarize(results: readonly RuleResult[]): Summary {
  const count = (status: RuleStatus) => results.filter((result) => result.status === status).length
  const failed = results.filter((result) => result.status === 'fail')
  const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0, info: 0 }
  for (const result of failed) bySeverity[result.severity]++
  return {
    pass: count('pass'),
    fail: failed.length,
    needsReview: count('needs-review'),
    notApplicable: count('not-applicable'),
    error: count('error'),
    bySeverity,
  }
}

function pageNotices(page: PageFacts, robots: RobotsFacts | undefined): Notice[] {
  const notices: Notice[] = []
  const challenge = challengeOf(page.headers)
  if (challenge !== null) {
    notices.push(
      notice('bot-challenge', { service: challenge.service, status: String(page.status) }),
    )
  } else if (!isSuccess(page.status)) {
    notices.push(notice('page-status', { status: String(page.status) }))
  } else if (!page.isHtml) {
    notices.push(notice('not-html'))
  } else {
    if (page.htmlTooComplex) notices.push(notice('page-too-complex'))
    else if (page.text !== null && page.html !== null) {
      const loadsScripts = page.html.scripts.some(
        (script) => isJavaScript(script.type) && (script.src !== null || script.text.trim() !== ''),
      )
      if (page.text.letters.total < LITTLE_TEXT_LETTERS && loadsScripts) {
        notices.push(notice('little-text'))
      }
    }
    if (page.htmlTruncated) notices.push(notice('page-truncated'))
  }
  if (robots?.outcome === 'failed') notices.push(notice('robots-unchecked'))
  if (robots?.outcome === 'fetched' && robots.truncated) notices.push(notice('robots-truncated'))
  return notices
}

/**
 * The page's links when their checks failed as a whole, which they are awaited too late to throw:
 * links none of which answered, so the rules that read them report that they could not run,
 * rather than pass a page without links.
 */
const UNCHECKED_LINKS: LinkFacts = {
  total: 1,
  more: false,
  checks: [],
  skipped: { limit: 0, robots: 0 },
}

/**
 * What the report says of the page's links it did not check (M2.3c): past the limit, kept from
 * the bot by robots.txt, or without an answer. None of them counts as broken.
 */
function linkNotices(links: LinkFacts | undefined, bot: string): Notice[] {
  if (links === undefined) return []
  const unanswered = links.checks.filter((check) => check.outcome === 'unanswered').length
  return [
    ...(links.skipped.limit > 0
      ? [
          // Counting stops at MAX_SITE_LINKS: past it the totals are "at least".
          notice(links.more ? 'links-limit-more' : 'links-limit', {
            total: String(links.total),
            limit: String(MAX_LINKS),
            count: String(links.skipped.limit),
          }),
        ]
      : []),
    ...(links.skipped.robots > 0
      ? [notice('links-robots', { count: String(links.skipped.robots), bot })]
      : []),
    ...(unanswered > 0 ? [notice('links-unanswered', { count: String(unanswered) })] : []),
  ]
}

/** The report's `page`: the declared language and direction, and the text's dominant script. */
export function pageSummary(page: PageFacts): Page | null {
  if (page.html === null || page.text === null) return null
  const dir = page.html.root.dir?.trim().toLowerCase() ?? null
  return {
    lang: page.html.root.lang?.trim() ?? null,
    dir: dir === 'ltr' || dir === 'rtl' || dir === 'auto' ? dir : null,
    dominantScript: page.text.dominantScript,
  }
}

/** The AI crawler table for tool pages (design §3 `facts`). */
/** Runs Lighthouse within what the scan's budget leaves; its package loads only here. */
async function measureLab(
  url: string,
  request: LabRequest,
  context: {
    readonly policy: EgressPolicy
    readonly resolver: Resolver
    readonly started: number
    readonly signal?: AbortSignal
  },
): Promise<LabRun> {
  const none = (status: 'unavailable' | 'skipped', error: string): LabRun => ({
    status,
    lighthouse: LIGHTHOUSE_VERSION,
    chromium: null,
    error,
    durationMs: 0,
    requests: { total: 0, refused: 0 },
    limited: false,
    performance: null,
    metrics: null,
  })
  let lab: typeof import('@arablyzer/lab')
  try {
    lab = await import('@arablyzer/lab')
  } catch (error) {
    // Lighthouse is an optional dependency: without it, the scan goes on (M1.3b review).
    return none('unavailable', error instanceof Error ? (error.message.split('\n')[0] ?? '') : '')
  }
  const { runLab, LAB_TIMEOUT_MS } = lab
  const left = SCAN_BUDGET_MS - (performance.now() - context.started)
  const budget = Math.min(request.timeoutMs ?? LAB_TIMEOUT_MS, LAB_TIMEOUT_MS, left)
  if (budget < MIN_LAB_MS) return none('skipped', 'No time left in the scan')
  return runLab(url, {
    policy: context.policy,
    resolver: context.resolver,
    timeoutMs: Math.round(budget),
    ...(request.executablePath === undefined ? {} : { executablePath: request.executablePath }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  })
}

/** A Lighthouse run as the report gives it: its English error stays in the logs. */
function labFact(run: LabRun): LabFact {
  const { status, lighthouse, chromium, durationMs, requests, performance, metrics } = run
  return { status, lighthouse, chromium, durationMs, requests, performance, metrics }
}

/** CrUX's answer as the report gives it; nothing when it was not asked or did not answer. */
function cruxFacts(crux: CruxFacts | undefined): Facts {
  if (crux === undefined || crux.outcome === 'failed') return {}
  const { outcome, scope, key, period, lcp, inp, cls } = crux
  return { crux: { outcome, scope, key, period, lcp, inp, cls } }
}

/**
 * The platform the page runs on, for the report: only when the scan ran the platform rule on an
 * HTML page. `primary` is the surest CMS or store.
 */
function platformFacts(page: PageFacts, rules: readonly Rule[]): Facts {
  if (page.html === null || !rules.some((rule) => rule.id === 'platform-detected')) return {}
  const technologies = detectPlatforms(page).map(({ id, name, kind, version, confidence }) => ({
    id,
    name,
    kind,
    version,
    confidence,
  }))
  return {
    platform: {
      primary: technologies.find((tech) => tech.kind === 'platform') ?? null,
      technologies,
    },
  }
}

/**
 * The Arabic X-ray: for each engine that counted Arabic words, how many were drawn wrongly, where
 * the broken ones stand in the first screen, and the picture of it; and the share drawn correctly
 * across the engines, which never rounds up to 100 while a word is broken.
 */
function xrayFacts(rendering: Rendering | undefined): Facts {
  const engines = (rendering?.rendered ?? []).flatMap((facts) => {
    const xray = facts.xray
    if (xray === undefined || xray.total === 0) return []
    const image = rendering?.xrayImages.get(facts.engine)
    return [
      {
        engine: facts.engine,
        total: xray.total,
        broken: xray.broken,
        truncated: xray.truncated,
        viewport: { width: facts.viewport.width, height: facts.viewport.height },
        words: xray.words.map((word) => ({
          text: word.text.slice(0, 100),
          kind: word.kind,
          box: { ...word.box },
        })),
        image:
          image === undefined
            ? null
            : `data:image/jpeg;base64,${Buffer.from(image).toString('base64')}`,
      },
    ]
  })
  if (engines.length === 0) return {}
  const total = engines.reduce((sum, engine) => sum + engine.total, 0)
  const broken = engines.reduce((sum, engine) => sum + engine.broken, 0)
  const exact = Math.round((100 * (total - broken)) / total)
  return { xray: { percent: broken > 0 ? Math.min(exact, 99) : 100, engines } }
}

/** How ready the page is for the country it is written for; nothing without the rule or HTML. */
function countryFitFacts(page: PageFacts, rules: readonly Rule[]): Facts {
  if (page.html === null || !rules.some((rule) => rule.id === 'country-fit')) return {}
  const { country, confidence, percent, judged, signals, items } = fitOf(page)
  return {
    countryFit: {
      country,
      confidence,
      percent,
      judged,
      signals: signals.slice(0, 30).map(({ kind, country: signalCountry, value }) => ({
        kind,
        country: signalCountry,
        value: value.slice(0, 100),
      })),
      items: items.map(({ id, status, detail }) => ({ id, status, detail: detail.slice(0, 100) })),
    },
  }
}

/** The dialect of the page's Arabic, for the report; nothing without the rule or Arabic text. */
function dialectFacts(page: PageFacts, rules: readonly Rule[]): Facts {
  if (
    page.html === null ||
    page.text === null ||
    !rules.some((rule) => rule.id === 'dialect-register')
  ) {
    return {}
  }
  if (!isMostlyArabic(page)) return {}
  const dialect = dialectOfPage(page.text.segments)
  const { whole } = dialect
  const inferred = inferCountry(readPage(page))
  const country = inferred.confidence === 'strong' ? inferred.country : null
  return {
    dialect: {
      outcome: whole.label === null ? 'too-little' : 'classified',
      words: whole.words,
      label: whole.label,
      mix: { ...whole.mix },
      hits: { ...whole.hits },
      headings: dialect.headings?.label ?? null,
      markers: whole.seen.map(({ word, dialect: name }) => ({ word, dialect: name })),
      country,
      fits:
        country === null || whole.label === null || whole.label === 'msa'
          ? null
          : fitsCountry(whole.label, country),
    },
  }
}

/** The id of the platform the page runs on, when it is sure of it (`facts.platform.primary.id`). */
function platformOf(page: PageFacts): string | null {
  return (
    detectPlatforms(page).find((tech) => tech.kind === 'platform' && tech.confidence >= 50)?.id ??
    null
  )
}

/** What the search test came to, as a notice, when it tested nothing. */
function searchNotices(search: SearchFacts | undefined): ReturnType<typeof notice>[] {
  switch (search?.outcome) {
    case 'not-found':
      return [notice('search-not-found')]
    case 'robots':
      return [notice('search-robots')]
    case 'unreachable':
      return [notice('search-unreachable')]
    case 'no-words':
      return [notice('search-no-words')]
    default:
      return []
  }
}

/** The search test's result as the report gives it: the words, their variants and what was lost. */
function searchFacts(search: SearchFacts | undefined): Facts {
  if (search?.outcome !== 'tested') return {}
  const { lost, total } = lossOf(search.words)
  return {
    searchTest: {
      via: search.via,
      url: search.url,
      requests: search.requests,
      lost,
      total,
      words: search.words.map((word) => ({
        word: word.word,
        results: word.base.results,
        first: word.base.first,
        variants: word.variants.map(({ kind, query, results, first, outcome, counted }) => ({
          kind,
          query,
          results,
          first,
          outcome,
          counted,
        })),
      })),
    },
  }
}

/**
 * The Arabic web fonts the render loaded with their subset sizes, from the first engine that saw
 * any (Chromium renders first); nothing without the font slimmer rule or a font.
 */
function arabicFontsFacts(
  rendered: readonly RenderedFacts[] | undefined,
  rules: readonly Rule[],
): Facts {
  if (!rules.some((rule) => rule.id === 'ar-font-subset-savings')) return {}
  const fonts = rendered?.find((facts) => facts.webFonts.length > 0)?.webFonts
  if (fonts === undefined) return {}
  return {
    arabicFonts: {
      fonts: fonts.map((font) => ({
        family: font.family,
        url: font.url,
        format: font.format,
        bytes: font.bytes,
        weight: font.weight,
        style: font.style,
        characters: font.usedCharacters,
        subsetBytes: font.subsetBytes,
        unicodeRange: font.unicodeRange,
      })),
    },
  }
}

/** Knowledge Graph's answer as the report gives it; nothing when it was not asked or failed. */
function knowledgeGraphFacts(facts: KnowledgeGraphFacts | undefined): Facts {
  if (facts === undefined || facts.outcome === 'failed') return {}
  const { outcome, brand, entities } = facts
  return {
    knowledgeGraph: {
      outcome,
      brand,
      entities: entities.map((entity) => ({ ...entity, types: [...entity.types] })),
    },
  }
}

/** Open PageRank's rank as the report gives it; nothing when not asked or failed; a score of null when the domain is not in the index yet. */
function openPageRankFacts(facts: OpenPageRankFacts | undefined): Facts {
  if (facts === undefined || facts.outcome === 'failed') return {}
  // Not listed: the domain is not in the index yet; the score is null, and the page says so.
  const { domain, score, position, referringDomains, trend, asOf } = facts
  return { openPageRank: { domain, score, position, referringDomains, trend, asOf } }
}

function robotsFacts(robots: RobotsFacts | undefined, pageUrl: string): Facts {
  if (robots === undefined || robots.outcome === 'failed') return {}
  return {
    robots: {
      url: robots.url,
      status: robots.status,
      aiCrawlers: AI_CRAWLERS.map((crawler) => ({
        token: crawler.token,
        purpose: crawler.purpose,
        allowed: crawlerAccess(robots, crawler.token, pageUrl)?.allowed ?? false,
      })),
    },
  }
}

/** HTML: a script is classic or module JavaScript when its type is empty, a JS MIME type or "module". */
function isJavaScript(type: string | null): boolean {
  const value = type?.trim().toLowerCase() ?? ''
  return value === '' || value === 'module' || /(?:java|ecma)script/.test(value)
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300
}

/**
 * Whether the scan reached the page: a 2xx answer that is not a bot challenge, which some services
 * send as 2xx (AWS WAF's answers 202).
 */
function pageReached(page: PageFacts): boolean {
  return isSuccess(page.status) && challengeOf(page.headers) === null
}

function lastHeader(headers: readonly (readonly [string, string])[], name: string): string | null {
  return headerValues(headers, name).at(-1) ?? null
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

/** A URL's host as the egress package writes it: lowercase, an IPv6 address without its brackets. */
function hostOf(url: string): string {
  const { hostname } = new URL(url)
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname
}
