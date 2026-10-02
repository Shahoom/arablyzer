import { SCAN_ID_PATTERN, type EngineName, type ScanEvent } from '@arablyzer/api-contract/codes'
import {
  CATEGORIES,
  type CategoryName,
  type EngineState,
  type ReportStrings,
} from '@arablyzer/i18n/report'
import type { ToolAppStrings } from '@arablyzer/i18n/tool-app'
import type { Finding, Notice, Report, RuleResult, Severity } from '@arablyzer/report-schema'

/** The scan's ID, the last part of /r/{id} or /en/r/{id}. */
export function idFromPath(pathname: string): string | null {
  const last =
    pathname
      .split('/')
      .filter((part) => part !== '')
      .at(-1) ?? ''
  return SCAN_ID_PATTERN.test(last) ? last : null
}

/** The engines a free scan renders in, in the order it renders them (M2.1 plan §4). */
export const ENGINES: readonly EngineName[] = ['chromium', 'firefox', 'webkit']

export interface EngineProgress {
  readonly state: EngineState
  readonly version: string | null
  readonly requests: number | null
}

/** What the progress page shows, folded from the scan's events so far. */
export interface Progress {
  readonly queued: number | null
  readonly started: boolean
  /** The engines this scan renders in, once it says; none until then. */
  readonly planned: readonly EngineName[]
  readonly page: Extract<ScanEvent, { type: 'page' }> | null
  readonly robots: Extract<ScanEvent, { type: 'robots' }> | null
  readonly crux: Extract<ScanEvent, { type: 'crux' }> | null
  readonly engines: Readonly<Record<EngineName, EngineProgress>>
  /** Engines that rendered, or failed to, whatever events repeat. */
  readonly enginesDone: number
  readonly rules: number | null
  readonly done: Extract<ScanEvent, { type: 'done' }> | null
  readonly error: boolean
}

export const START: Progress = {
  queued: null,
  started: false,
  planned: [],
  page: null,
  robots: null,
  crux: null,
  engines: {
    chromium: { state: 'waiting', version: null, requests: null },
    firefox: { state: 'waiting', version: null, requests: null },
    webkit: { state: 'waiting', version: null, requests: null },
  },
  enginesDone: 0,
  rules: null,
  done: null,
  error: false,
}

/** One more event on the progress so far. */
export function advance(progress: Progress, event: ScanEvent): Progress {
  switch (event.type) {
    case 'queued':
      return { ...progress, queued: event.ahead }
    case 'started':
      return {
        ...progress,
        started: true,
        planned: ENGINES.filter((engine) => event.engines.includes(engine)),
      }
    case 'page':
      return { ...progress, started: true, page: event }
    case 'robots':
      return { ...progress, robots: event }
    case 'crux':
      return { ...progress, crux: event }
    case 'render-start':
      return {
        ...progress,
        engines: {
          ...progress.engines,
          [event.engine]: { state: 'rendering', version: null, requests: null },
        },
      }
    case 'render': {
      const engines = {
        ...progress.engines,
        [event.engine]: {
          state: event.status,
          version: event.version,
          requests: event.requests.total,
        },
      }
      return {
        ...progress,
        engines,
        enginesDone: ENGINES.filter(
          (engine) => engines[engine].state !== 'waiting' && engines[engine].state !== 'rendering',
        ).length,
      }
    }
    case 'lab-start':
    case 'lab':
      return progress
    case 'rules':
      return { ...progress, rules: event.rules }
    case 'done':
      return { ...progress, done: event }
    case 'error':
      return { ...progress, error: true }
  }
}

/**
 * HTTP answers by which a site refuses a visitor it takes for a bot (the States design, S-01).
 * The engine leaves a link unjudged for the same five (REFUSAL_STATUSES, M2.3c review); the island
 * cannot import the engine, so a test ties the two.
 */
export const REFUSALS: ReadonlySet<number> = new Set([401, 403, 407, 429, 503])

/**
 * The notice of a scan that stopped because the site's robots.txt asks ArablyzerBot not to check
 * the page (packages/engine, notices.ts; M2.4 plan §2).
 */
const OPTED_OUT = 'opted-out'

/** The notice that says the site asked not to be checked, with its rule; null for other reports. */
export function optOutOf(report: Report): Notice | null {
  return report.scan.notices.find((notice) => notice.code === OPTED_OUT) ?? null
}

/**
 * The notice of a page that answered with a bot challenge, which a service may send with any
 * status, 2xx included (packages/engine, notices.ts; M2.3c).
 */
const BOT_CHALLENGE = 'bot-challenge'

export type Outcome = 'complete' | 'partial' | 'blocked' | 'opted-out' | 'failed'

/** How the report opens: whole, partial, refused by the site, opted out by it, or failed. */
export function outcomeOf(report: Report): Outcome {
  // The site's own wish comes first, whatever a redirect on the way answered.
  if (optOutOf(report) !== null) return 'opted-out'
  const status = report.target.http.status
  if (status !== null && REFUSALS.has(status)) return 'blocked'
  if (report.scan.notices.some((notice) => notice.code === BOT_CHALLENGE)) return 'blocked'
  return report.scan.status
}

/**
 * The notices a state's card shows under its words: every one for an opt-out, whose notice names
 * the site's rule and where it is, and for a scan that could not run. A scan the site blocked
 * shows the bot challenge that blocked it, when it was one, which names the service; what it says
 * of the status is on the card already (M2.3c review: the challenge's copy says the report shows
 * it).
 */
export function stateNotices(outcome: Outcome, report: Report): Notice[] {
  return outcome === 'blocked'
    ? report.scan.notices.filter((notice) => notice.code === BOT_CHALLENGE)
    : report.scan.notices
}

/** What a tool's result says first (M2.2). */
export type ToolVerdict =
  | 'blocked'
  | 'opted-out'
  | 'problems'
  | 'incomplete'
  | 'review'
  | 'noted'
  | 'passed'
  | 'none-found'
  | 'not-applicable'

/**
 * Whether a rule only lists what it finds (severity info): its findings are notes, never problems,
 * and the score never deducts them (M2.3c review). A finding still makes such a rule `fail`, which
 * is how the report gives it findings to list.
 */
export function isNote(rule: RuleResult): boolean {
  return rule.severity === 'info'
}

/**
 * A tool's result in a word: the site refused the scan, or asked in its robots.txt not to be
 * checked; a rule that judges failed, which is said even when the scan did not finish; the scan did
 * not finish (partial, failed, or a rule that could not run), so the page cannot be said to pass;
 * a rule needs a human's eye; a rule that only lists found something, so there are notes and no
 * problem; every rule that applies passed, or, for a tool whose rules all only list
 * (`reportsOnly`), found nothing; or none applies.
 */
export function toolVerdict(report: Report, reportsOnly = false): ToolVerdict {
  const any = (status: RuleResult['status']) => report.rules.some((rule) => rule.status === status)
  const outcome = outcomeOf(report)
  if (outcome === 'blocked' || outcome === 'opted-out') return outcome
  const failed = report.rules.filter((rule) => rule.status === 'fail')
  if (failed.some((rule) => !isNote(rule))) return 'problems'
  if (report.scan.status !== 'complete' || any('error')) return 'incomplete'
  if (any('needs-review')) return 'review'
  if (failed.length > 0) return 'noted'
  if (!any('pass')) return 'not-applicable'
  return reportsOnly ? 'none-found' : 'passed'
}

/** A tool's result in the page's words (toolVerdict). */
export function toolHeadline(
  report: Report,
  t: ToolAppStrings['result'],
  reportsOnly = false,
): string {
  return {
    blocked: t.blocked,
    'opted-out': t.optedOut,
    problems: t.problems(problemCount(report)),
    incomplete: t.incomplete,
    review: t.review,
    noted: t.notes(noteCount(report)),
    passed: t.passed,
    'none-found': t.noneFound,
    'not-applicable': t.notApplicable,
  }[toolVerdict(report, reportsOnly)]
}

/**
 * What the report says when it lists no problem: that the rules found none, only when every rule
 * finished; that the ones that finished found none, when some could not run; and that nothing can
 * be said, when none finished. A rule that could not run found nothing, and cannot vouch for the
 * page (M2.2a review).
 */
export function noProblemsNote(report: Report): 'none' | 'incomplete' | 'unknown' {
  const errored = report.rules.filter((rule) => rule.status === 'error').length
  if (errored === 0) return 'none'
  return errored === report.rules.length ? 'unknown' : 'incomplete'
}

/** A failed rule's findings: those in the report, and those it left out past its cap; at least one. */
function findingsOf(report: Report, rule: RuleResult): number {
  const found = report.findings.filter((finding) => finding.ruleId === rule.id).length
  return Math.max(found + (rule.findingsOmitted ?? 0), 1)
}

/**
 * The problems a tool's result counts: every finding of its failed rules that judge, those the
 * report left out past its cap too; a failed rule without findings counts once. What a rule that
 * only lists found is a note (noteCount), never a problem.
 */
export function problemCount(report: Report): number {
  return report.rules
    .filter((rule) => rule.status === 'fail' && !isNote(rule))
    .reduce((sum, rule) => sum + findingsOf(report, rule), 0)
}

/** The notes a tool's result counts: what its rules that only list found, counted as problems are. */
export function noteCount(report: Report): number {
  return report.rules
    .filter((rule) => rule.status === 'fail' && isNote(rule))
    .reduce((sum, rule) => sum + findingsOf(report, rule), 0)
}

const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
  info: 4,
}

export interface RuleFindings {
  readonly rule: RuleResult
  readonly findings: readonly Finding[]
}

/** Failed rules and those that need review, most severe first, each with its findings. */
export function problemsOf(report: Report): RuleFindings[] {
  return report.rules
    .filter((rule) => rule.status === 'fail' || rule.status === 'needs-review')
    .sort(
      (a, b) =>
        Number(a.status === 'needs-review') - Number(b.status === 'needs-review') ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        a.id.localeCompare(b.id, 'en'),
    )
    .map((rule) => ({
      rule,
      findings: report.findings.filter((finding) => finding.ruleId === rule.id),
    }))
}

/** The severity of the worst problem that judges, if there is one; a note is not a problem. */
export function worstProblem(report: Report): Severity | undefined {
  return problemsOf(report).find((entry) => entry.rule.status === 'fail' && !isNote(entry.rule))
    ?.rule.severity
}

/** The overflow diagram's drawing: 520 units wide, with a screen 150 units wide at x = 300. */
const DIAGRAM = { width: 520, screenX: 300, screenWidth: 150 } as const

export interface Diagram {
  readonly screen: { readonly x: number; readonly width: number }
  /** Where the element's box starts and ends, to scale with the screen, within the drawing. */
  readonly start: number
  readonly end: number
  /** The part of the drawing that has something in it: its first unit and its last. */
  readonly from: number
  readonly to: number
}

/**
 * Where an element that reaches past the edge of a phone's screen is drawn against it, to scale
 * (`x` and `width` in the page's pixels, `viewport` the screen's width), and the part of the
 * drawing worth showing: from the box, its label or the screen's near edge, to the screen's far
 * edge or the box's end, so that a phone shows it at about its own size and its labels stay
 * readable.
 */
export function diagramOf(x: number, width: number, viewport: number): Diagram {
  const { screenX, screenWidth } = DIAGRAM
  const scale = screenWidth / viewport
  const start = Math.max(4, screenX + x * scale)
  const end = Math.max(start + 4, Math.min(screenX + (x + width) * scale, DIAGRAM.width - 4))
  const labelLeft = (start + screenX) / 2 - 30
  return {
    screen: { x: screenX, width: screenWidth },
    start,
    end,
    from: Math.max(0, Math.floor(Math.min(start, labelLeft, screenX) - 14)),
    to: Math.min(DIAGRAM.width, Math.ceil(Math.max(end, screenX + screenWidth) + 14)),
  }
}

/** A number from a finding's values, when it has that one. */
export function valueOf(finding: Finding, key: string): number | null {
  const value = finding.evidence.values?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export type StepState = 'done' | 'active' | 'waiting' | 'failed'

export interface Step {
  readonly key: 'page' | 'robots' | 'crux' | 'render' | 'rules' | 'score'
  readonly label: string
  readonly state: StepState
  readonly detail: string | null
  /** A technical reading, such as "200 · text/html" or "1 / 3", read left to right in Arabic too. */
  readonly ltr: boolean
}

/**
 * The scan's steps, in the order the engine takes them (the approved Audit-Progress design):
 * robots.txt first, since a site can ask ArablyzerBot not to check a page (M2.4 plan §2), then
 * the page. A step the scan has no use for (no rule reads real-user data, no browser was asked
 * for, no robots.txt for a URL refused before any lookup) leaves the list once a later one began.
 * One step is active at a time: the first not done.
 */
export function stepsOf(progress: Progress, t: ReportStrings['progress']): Step[] {
  const engines = progress.planned
  const renderBegun = engines.some((engine) => progress.engines[engine].state !== 'waiting')
  const pastCrux = renderBegun || progress.rules !== null
  const pastRobots = progress.page !== null || progress.crux !== null || pastCrux
  const page = progress.page
  const listed: (Omit<Step, 'state'> & { readonly done: boolean; readonly failed?: boolean })[] = [
    // After a redirect to another site, the robots.txt shown is that site's, the latest read.
    ...(progress.robots === null && pastRobots
      ? []
      : [
          {
            key: 'robots' as const,
            label: t.steps.robots,
            done: progress.robots !== null,
            detail: progress.robots === null ? null : t.robots[progress.robots.outcome],
            ltr: false,
          },
        ]),
    page !== null && page.error !== null
      ? {
          key: 'page',
          label: t.steps.page,
          done: false,
          failed: true,
          detail: t.pageFailed,
          ltr: false,
        }
      : {
          key: 'page',
          label: t.steps.page,
          done: page !== null,
          detail:
            page === null
              ? null
              : [page.status, page.contentType?.split(';')[0]]
                  .filter((part) => part !== null && part !== undefined)
                  .join(' · '),
          ltr: true,
        },
    ...(progress.crux === null && pastCrux
      ? []
      : [
          {
            key: 'crux' as const,
            label: t.steps.crux,
            done: progress.crux !== null,
            detail: progress.crux === null ? null : t.crux[progress.crux.outcome],
            ltr: false,
          },
        ]),
    ...(progress.started && engines.length === 0
      ? []
      : [
          {
            key: 'render' as const,
            label: t.steps.render,
            done:
              (engines.length > 0 && progress.enginesDone >= engines.length) ||
              progress.rules !== null,
            detail: engines.length === 0 ? null : `${progress.enginesDone} / ${engines.length}`,
            ltr: true,
          },
        ]),
    {
      key: 'rules',
      label: t.steps.rules,
      done: progress.rules !== null,
      detail: progress.rules === null ? null : t.rules(progress.rules),
      ltr: false,
    },
    { key: 'score', label: t.steps.score, done: progress.done !== null, detail: null, ltr: false },
  ]
  const open = listed.findIndex((step) => !step.done)
  return listed.map(({ done, failed, ...step }, index) => ({
    ...step,
    state:
      failed === true
        ? 'failed'
        : done
          ? 'done'
          : progress.started && index === open
            ? 'active'
            : 'waiting',
  }))
}

/**
 * What the summary counts, from the rules' results: the failed rules that judge are problems, the
 * failed rules that only list (severity info) are notes, and a rule that needs a human eye is
 * neither (the score deducts none of them). `bySeverity` counts the failed rules, as the report's
 * own summary does.
 */
export interface SummaryCounts {
  readonly problems: number
  readonly notes: number
  readonly review: number
  readonly bySeverity: Readonly<Record<Severity, number>>
}

export function summaryCounts(report: Report): SummaryCounts {
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    info: 0,
  }
  let review = 0
  for (const rule of report.rules) {
    if (rule.status === 'fail') bySeverity[rule.severity]++
    else if (rule.status === 'needs-review') review++
  }
  const { critical, serious, moderate, minor, info } = bySeverity
  return { problems: critical + serious + moderate + minor, notes: info, review, bySeverity }
}

/** What the report's headline says: counts, or why there are none. */
export type Headline =
  | { readonly kind: 'counts'; readonly problems: number; readonly notes: number }
  | { readonly kind: 'review'; readonly count: number }
  | { readonly kind: 'clean' | 'incomplete' | 'unknown' }

/**
 * The headline of the summary. Problems and notes when there are any; else the checks that need a
 * review; else that the rules found nothing, said only as far as the rules that ran can say it
 * (noProblemsNote).
 */
export function headlineOf(report: Report): Headline {
  const { problems, notes, review } = summaryCounts(report)
  if (problems > 0 || notes > 0) return { kind: 'counts', problems, notes }
  if (review > 0) return { kind: 'review', count: review }
  const note = noProblemsNote(report)
  return { kind: note === 'none' ? 'clean' : note }
}

/**
 * The band of a score, for the colour of its bar: the cut-offs Lighthouse draws, 90 and 50. It
 * says nothing the number does not: the bar's length and the number are the score.
 */
export type Band = 'good' | 'mid' | 'low'

export function bandOf(score: number): Band {
  return score >= 90 ? 'good' : score >= 50 ? 'mid' : 'low'
}

/** The categories a report scored, in the three groups its category section shows. */
export interface CategoryRows {
  /** Under 100, the lowest first (the order of the categories breaks a tie). */
  readonly low: readonly { readonly category: CategoryName; readonly value: number }[]
  /** At 100. */
  readonly full: readonly CategoryName[]
  /** No rule of them applied: no score. */
  readonly none: readonly CategoryName[]
}

export function categoryRows(categories: Report['score']['categories']): CategoryRows {
  const low: { category: CategoryName; value: number }[] = []
  const full: CategoryName[] = []
  const none: CategoryName[] = []
  for (const category of CATEGORIES) {
    if (!(category in categories)) continue
    const value = categories[category] ?? null
    if (value === null) none.push(category)
    else if (value >= 100) full.push(category)
    else low.push({ category, value })
  }
  // Array.prototype.sort is stable: equal scores keep the order of CATEGORIES.
  low.sort((a, b) => a.value - b.value)
  return { low, full, none }
}

/** The engines that rendered the page, in the order a scan renders them. */
export function renderedEngines(report: Report): EngineName[] {
  const runs = report.scan.render ?? []
  return ENGINES.filter((engine) =>
    runs.some((run) => run.engine === engine && run.status === 'rendered'),
  )
}

/**
 * The engines that show a problem no other engine shows: an engine that is alone in a finding's
 * evidence. Said only where at least two rendered, so there are others to compare it with.
 */
export function aloneEngines(report: Report): ReadonlySet<EngineName> {
  if (renderedEngines(report).length < 2) return new Set()
  return new Set(
    report.findings.flatMap((finding) => {
      const engines = finding.evidence.engines
      const [only] = engines ?? []
      return engines?.length === 1 && only !== undefined ? [only] : []
    }),
  )
}

/**
 * The one engine every finding of a rule was seen in, when that engine was alone: the rule is a
 * problem of that browser only. Never where fewer than two rendered, or where a finding says no
 * engine (it came from the page's HTML, which every engine reads alike).
 */
export function onlyEngine(findings: readonly Finding[], rendered: number): EngineName | null {
  if (rendered < 2 || findings.length === 0) return null
  const seen = new Set<EngineName>()
  for (const finding of findings) {
    if (finding.evidence.engines === undefined) return null
    for (const engine of finding.evidence.engines) seen.add(engine)
  }
  const [only] = seen
  return seen.size === 1 && only !== undefined ? only : null
}

/**
 * Names as a language lists them: «Chromium وFirefox وWebKit», "Chromium, Firefox, and WebKit".
 * Written out, not asked of Intl.ListFormat: WebKit's Arabic list wraps each name in the bidi
 * isolates U+2068 and U+2069, which Arabic copy does not carry (the page sets direction with dir).
 */
export function listOf(names: readonly string[], lang: 'ar' | 'en'): string {
  const last = names.at(-1)
  if (last === undefined) return ''
  const rest = names.slice(0, -1)
  if (lang === 'ar') return [...rest, last].join(' و')
  if (rest.length === 0) return last
  return rest.length === 1 ? `${rest.join('')} and ${last}` : `${rest.join(', ')}, and ${last}`
}

/**
 * The steps a finished scan took, as its report tells them: the same list as the one the progress
 * page shows while the scan runs (stepsOf), each done, with what the report holds of it. A step the
 * report holds nothing of is left out: robots.txt without its fact, real visitors' data without
 * CrUX's.
 */
export function checklistOf(report: Report, t: ReportStrings['progress']): Step[] {
  const steps: Step[] = []
  const robots = report.facts.robots
  if (robots !== undefined) {
    steps.push({
      key: 'robots',
      label: t.steps.robots,
      state: 'done',
      detail: robots.status === null ? t.robots.unreachable : String(robots.status),
      ltr: robots.status !== null,
    })
  }
  const { status, contentType } = report.target.http
  steps.push(
    status === null
      ? { key: 'page', label: t.steps.page, state: 'failed', detail: t.pageFailed, ltr: false }
      : {
          key: 'page',
          label: t.steps.page,
          state: 'done',
          detail: [status, contentType?.split(';')[0]]
            .filter((part) => part !== undefined && part !== '')
            .join(' · '),
          ltr: true,
        },
  )
  const crux = report.facts.crux
  if (crux !== undefined) {
    steps.push({
      key: 'crux',
      label: t.steps.crux,
      state: 'done',
      detail: t.crux[crux.outcome],
      ltr: false,
    })
  }
  const runs = report.scan.render ?? []
  if (runs.length > 0) {
    const rendered = runs.filter((run) => run.status === 'rendered').length
    steps.push({
      key: 'render',
      label: t.steps.render,
      state: rendered === 0 ? 'failed' : 'done',
      detail: `${rendered} / ${runs.length}`,
      ltr: true,
    })
  }
  steps.push({
    key: 'rules',
    label: t.steps.rules,
    state: 'done',
    detail: t.rules(report.score.rules.ran),
    ltr: false,
  })
  return steps
}
