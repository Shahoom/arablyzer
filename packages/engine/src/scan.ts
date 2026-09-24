import { createHash } from 'node:crypto'
import {
  collectPage,
  collectRobots,
  headerValues,
  type PageFacts,
  type RobotsFacts,
} from '@arablyzer/collectors'
import {
  DEFAULT_POLICY,
  DEFAULT_TIMEOUT_MS,
  defaultResolver,
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
  type Notice,
  type Page,
  type RuleResult,
  type RuleStatus,
  type Summary,
} from '@arablyzer/report-schema'
import {
  AI_CRAWLERS,
  crawlerAccess,
  renderMessage,
  RULES,
  RULESET_VERSION,
  type DetectorFinding,
  type Rule,
} from '@arablyzer/rules'
import { boundSelector, boundText, boundValues } from './bounds'
import { notice } from './notices'

export const ENGINE_VERSION = '0.1.0'
/** BUILD-PLAN §1. Arablyzer always identifies itself and never poses as another crawler. */
export const USER_AGENT = 'ArablyzerBot/1.0 (+https://arablyzer.com/bot)'
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

export interface ScanOptions {
  /** Rule ids to run; all rules by default. Unknown ids throw a TypeError. */
  readonly ruleIds?: readonly string[]
  /** The rule set to choose from; tests pass their own. */
  readonly rules?: readonly Rule[]
  readonly policy?: EgressPolicy
  readonly resolver?: Resolver
  /** Per request (BUILD-PLAN §11: 30 s). */
  readonly timeoutMs?: number
  /**
   * Budget for parsing the page's HTML, which blocks the process while it runs; timeoutMs by
   * default. Past it, the rules that need the HTML report an error and the scan is partial.
   */
  readonly parseTimeoutMs?: number
  readonly userAgent?: string
  readonly signal?: AbortSignal
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
 * report, apart from fetchedAt and durationMs.
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
  const rules = selectRules(options.rules ?? RULES, options.ruleIds)
  const userAgent = options.userAgent ?? USER_AGENT
  const policy = options.policy ?? DEFAULT_POLICY
  const base: SafeFetchOptions = {
    userAgent,
    policy,
    // Chosen once, so the robots.txt fetch resolves names the way the page fetch did.
    resolver: options.resolver ?? defaultResolver(policy),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }

  const fetched = await safeFetch(url, { ...base, accept: PAGE_ACCEPT })
  const response = fetched.response
  const target = {
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
  const finish = (parts: {
    status: 'complete' | 'partial' | 'failed'
    notices: Notice[]
    page: Page | null
    results: RuleResult[]
    findings: Finding[]
    facts: Facts
  }): Report =>
    Report.parse({
      schemaVersion: SCHEMA_VERSION,
      generator: { name: 'arablyzer', version: ENGINE_VERSION, rulesetVersion: RULESET_VERSION },
      target,
      scan: {
        status: parts.status,
        durationMs: Math.round(performance.now() - started),
        notices: parts.notices,
      },
      page: parts.page,
      summary: summarize(parts.results),
      rules: parts.results,
      findings: parts.findings,
      facts: parts.facts,
    })

  const failed = (notices: Notice[], error: string): Report =>
    finish({
      status: 'failed',
      notices,
      page: null,
      results: rules.map((rule) => ruleResult(rule, 'error', { error })),
      findings: [],
      facts: {},
    })

  if (fetched.error !== null || response === null) {
    return failed(fetched.error === null ? [] : [notice(fetched.error.code)], 'page-unavailable')
  }

  let page: PageFacts
  try {
    page = collectPage(
      {
        url: response.url,
        status: response.status,
        headers: response.headers,
        body: response.body,
      },
      { deadline: performance.now() + parseTimeoutMs },
    )
  } catch {
    // A collector bug, or an input it cannot handle: the report says so instead of the scan crashing.
    return failed([notice('page-unreadable')], 'page-unreadable')
  }
  // Under --allow-private, a chain that started on a public address lost private access; the
  // robots.txt fetch for the same site keeps that, so DNS cannot move it onto a private address.
  const robotsPolicy = fetched.privateAccess ? policy : { ...policy, allowPrivate: false }
  const robots = rules.some((rule) => rule.needs.includes('robots'))
    ? await fetchRobots(response.url, { ...base, policy: robotsPolicy })
    : undefined

  const notices = pageNotices(page, robots)
  const { results, findings } = evaluateRules(rules, page, robots)

  return finish({
    status: results.some((result) => result.status === 'error') ? 'partial' : 'complete',
    notices,
    page: pageSummary(page),
    results,
    findings,
    facts: robotsFacts(robots, page.url),
  })
}

export interface EvaluateOptions {
  /** Rule ids to run; all rules by default. Unknown ids throw a TypeError. */
  readonly ruleIds?: readonly string[]
  /** The rule set to choose from; tests pass their own. */
  readonly rules?: readonly Rule[]
  /** robots.txt for the page's site; without it, rules that need it report an error. */
  readonly robots?: RobotsFacts
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
  return evaluateRules(selectRules(options.rules ?? RULES, options.ruleIds), page, options.robots)
}

function evaluateRules(
  rules: readonly Rule[],
  page: PageFacts,
  robots: RobotsFacts | undefined,
): Evaluation {
  const results: RuleResult[] = []
  const findings: Finding[] = []
  for (const rule of rules) {
    const outcome = evaluate(rule, page, robots)
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

async function fetchRobots(pageUrl: string, base: SafeFetchOptions): Promise<RobotsFacts> {
  const url = new URL('/robots.txt', pageUrl).href
  const fetched: FetchResult = await safeFetch(url, {
    ...base,
    accept: ROBOTS_ACCEPT,
    maxBytes: ROBOTS_MAX_BYTES,
    onTooLarge: 'truncate',
    maxRedirects: ROBOTS_MAX_REDIRECTS,
  })
  const response = fetched.response
  return collectRobots({
    url,
    response:
      response === null
        ? null
        : { status: response.status, body: response.body, truncated: response.truncated },
    errorCode: fetched.error?.code ?? null,
  })
}

interface Outcome {
  readonly status: RuleStatus
  readonly error?: string
  readonly findings: readonly Finding[]
  readonly omitted?: number
}

function evaluate(rule: Rule, page: PageFacts, robots: RobotsFacts | undefined): Outcome {
  const needsPage = rule.needs.some((need) => need !== 'robots')
  const needsHtml = rule.needs.includes('html') || rule.needs.includes('text')
  if (needsPage && !isSuccess(page.status)) return { status: 'not-applicable', findings: [] }
  if (needsHtml && page.htmlTimedOut) {
    return { status: 'error', error: 'page-too-complex', findings: [] }
  }
  if (needsHtml && (page.html === null || page.text === null)) {
    return { status: 'not-applicable', findings: [] }
  }
  if (rule.needs.includes('robots') && (robots === undefined || robots.outcome === 'failed')) {
    return { status: 'error', error: 'robots-unchecked', findings: [] }
  }
  try {
    if (!rule.appliesTo(page)) return { status: 'not-applicable', findings: [] }
    const detected = rule.detect(robots === undefined ? { page } : { page, robots })
    const { kept, total } = firstByPosition(detected, MAX_FINDINGS_PER_RULE)
    const status = rule.manualCheck === true ? 'needs-review' : total > 0 ? 'fail' : 'pass'
    return { status, findings: convert(rule, kept, page.url), omitted: total - kept.length }
  } catch {
    // A bug in a rule (a throw, a missing message, output the schema rejects) must not take the
    // whole scan down; the report says which rule failed.
    return { status: 'error', error: 'rule-failed', findings: [] }
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
function summarize(results: readonly RuleResult[]): Summary {
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
  if (!isSuccess(page.status)) notices.push(notice('page-status', { status: String(page.status) }))
  else if (!page.isHtml) notices.push(notice('not-html'))
  else {
    if (page.htmlTimedOut) notices.push(notice('page-too-complex'))
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

function pageSummary(page: PageFacts): Page | null {
  if (page.html === null || page.text === null) return null
  const dir = page.html.root.dir?.trim().toLowerCase() ?? null
  return {
    lang: page.html.root.lang?.trim() ?? null,
    dir: dir === 'ltr' || dir === 'rtl' || dir === 'auto' ? dir : null,
    dominantScript: page.text.dominantScript,
  }
}

/** The AI crawler table for tool pages (design §3 `facts`). */
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

function lastHeader(headers: readonly (readonly [string, string])[], name: string): string | null {
  return headerValues(headers, name).at(-1) ?? null
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}
