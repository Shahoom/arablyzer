import type { StartProblem } from '@arablyzer/i18n/integrations'
import {
  ApiError,
  groupIssues,
  rulePageUrl,
  scoreBand,
  SEVERITIES,
  type ScoreBand,
  type Severity,
  type SiteLang,
} from '@arablyzer/integrations-core'
import type { Report } from '@arablyzer/report-schema'

/** The address to scan from a tab's: http or https only, without the `#fragment`. Null for anything else. */
export function scanTarget(tabUrl: string | undefined): string | null {
  if (tabUrl === undefined) return null
  let url: URL
  try {
    url = new URL(tabUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  url.hash = ''
  return url.href
}

const PROBLEMS: readonly string[] = [
  'unauthorized',
  'plan_limit',
  'rate_limited',
  'blocked_target',
  'invalid_url',
  'invalid_request',
  'accounts_off',
  'network',
  'unavailable',
  'timeout',
  'scan_failed',
  'bad_response',
]

/** Which message to show for what went wrong. */
export function problemOf(error: unknown): { key: StartProblem; retryAfterSeconds?: number } {
  if (!(error instanceof ApiError)) return { key: 'unavailable' }
  const key = (PROBLEMS.includes(error.code) ? error.code : 'unavailable') as StartProblem
  return error.retryAfterSeconds === undefined
    ? { key }
    : { key, retryAfterSeconds: error.retryAfterSeconds }
}

/** The badge's colour for a score, from the site's own tokens (pass, moderate, critical). */
export const BADGE_COLORS: Readonly<Record<ScoreBand, string>> = {
  good: '#047857',
  mid: '#b45309',
  low: '#e11d48',
}

export interface Badge {
  readonly text: string
  readonly color: string
}
export const badgeFor = (score: number | null): Badge =>
  score === null
    ? { text: '?', color: '#667085' }
    : { text: String(score), color: BADGE_COLORS[scoreBand(score)] }

export interface IssueRow {
  readonly ruleId: string
  readonly severity: Severity
  readonly message: string
  readonly occurrences: number
  /** The rule's page on the site. */
  readonly href: string
}

export interface ResultView {
  readonly score: number | null
  readonly band: ScoreBand | null
  readonly partial: boolean
  readonly counts: readonly { readonly severity: Severity; readonly count: number }[]
  readonly issues: readonly IssueRow[]
  /** Rules with problems beyond the rows. */
  readonly more: number
}

export const MAX_ROWS = 5

/** What the popup shows of a report: the score, the counts, the worst rules. */
export function presentReport(
  report: Report,
  host: string,
  lang: SiteLang,
  maxRows = MAX_ROWS,
): ResultView {
  const all = groupIssues(report)
  const score = report.score.overall
  return {
    score,
    band: score === null ? null : scoreBand(score),
    partial: report.score.partial,
    counts: SEVERITIES.map((severity) => ({
      severity,
      count: report.summary.bySeverity[severity],
    })),
    issues: all.slice(0, maxRows).map((issue) => ({
      ruleId: issue.ruleId,
      severity: issue.severity,
      message: issue.message[lang],
      occurrences: issue.occurrences,
      href: rulePageUrl(host, lang, issue.ruleId),
    })),
    more: Math.max(0, all.length - maxRows),
  }
}
