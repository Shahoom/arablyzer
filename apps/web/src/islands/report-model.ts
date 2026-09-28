import type { EngineName, ScanEvent } from '@arablyzer/api-contract/codes'
import type { EngineState } from '@arablyzer/i18n/report'
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
  /** The engines this scan renders in, once it says; all three until then. */
  readonly planned: readonly EngineName[]
  readonly page: Extract<ScanEvent, { type: 'page' }> | null
  readonly robots: Extract<ScanEvent, { type: 'robots' }> | null
  readonly crux: Extract<ScanEvent, { type: 'crux' }> | null
  readonly engines: Readonly<Record<EngineName, EngineProgress>>
  /** Engines the scan rendered or tried, of those it asked for. */
  readonly enginesDone: number
  readonly rules: number | null
  readonly done: Extract<ScanEvent, { type: 'done' }> | null
  readonly error: boolean
}

export const START: Progress = {
  queued: null,
  started: false,
  planned: ENGINES,
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
    case 'render':
      return {
        ...progress,
        engines: {
          ...progress.engines,
          [event.engine]: {
            state: event.status,
            version: event.version,
            requests: event.requests.total,
          },
        },
        enginesDone: progress.enginesDone + 1,
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
