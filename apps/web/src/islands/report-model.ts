import type { EngineName, ScanEvent } from '@arablyzer/api-contract/codes'
import type { EngineState, ReportStrings } from '@arablyzer/i18n/report'
import type { Finding, Report, RuleResult, Severity } from '@arablyzer/report-schema'

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

/** HTTP answers by which a site refuses a visitor it takes for a bot (the States design, S-01). */
const REFUSALS = new Set([401, 403, 407, 429, 503])

export type Outcome = 'complete' | 'partial' | 'blocked' | 'failed'

/** How the report opens: whole, partial, refused by the site, or failed. */
export function outcomeOf(report: Report): Outcome {
  const status = report.target.http.status
  if (status !== null && REFUSALS.has(status)) return 'blocked'
  return report.scan.status
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
 * The scan's steps, in the order the engine takes them (the approved Audit-Progress design). A
 * step the scan has no use for (no rule reads robots.txt or real-user data, no browser was asked
 * for) leaves the list once a later one began. One step is active at a time: the first not done.
 */
export function stepsOf(progress: Progress, t: ReportStrings['progress']): Step[] {
  const engines = progress.planned
  const renderBegun = engines.some((engine) => progress.engines[engine].state !== 'waiting')
  const pastCrux = renderBegun || progress.rules !== null
  const pastRobots = progress.crux !== null || pastCrux
  const page = progress.page
  const listed: (Omit<Step, 'state'> & { readonly done: boolean; readonly failed?: boolean })[] = [
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
