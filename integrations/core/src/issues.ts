import type { Report } from '@arablyzer/report-schema'

export const SEVERITIES = ['critical', 'serious', 'moderate', 'minor', 'info'] as const
export type Severity = (typeof SEVERITIES)[number]

export const severityRank = (severity: Severity): number => SEVERITIES.indexOf(severity)

/** A rule that failed, with how often and where it was first found. */
export interface Issue {
  readonly ruleId: string
  readonly severity: Severity
  readonly occurrences: number
  readonly message: { readonly ar: string; readonly en: string }
  /** The first place it was found. */
  readonly example?: { readonly selector?: string; readonly url?: string }
}

/** The report's findings grouped by rule, worst first, then most often, then by name. */
export function groupIssues(report: Pick<Report, 'findings'>): Issue[] {
  const grouped = new Map<string, Issue>()
  for (const finding of report.findings) {
    const known = grouped.get(finding.ruleId)
    if (known !== undefined) {
      grouped.set(finding.ruleId, { ...known, occurrences: known.occurrences + 1 })
      continue
    }
    const { selector, url } = finding.evidence
    const example = {
      ...(selector === undefined ? {} : { selector }),
      ...(url === undefined ? {} : { url }),
    }
    grouped.set(finding.ruleId, {
      ruleId: finding.ruleId,
      severity: finding.severity,
      occurrences: 1,
      message: { ar: finding.message.ar, en: finding.message.en },
      ...(Object.keys(example).length === 0 ? {} : { example }),
    })
  }
  return [...grouped.values()].sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      b.occurrences - a.occurrences ||
      a.ruleId.localeCompare(b.ruleId),
  )
}

/** Whether the score is good, middling or low: the bands of the report page. */
export type ScoreBand = 'good' | 'mid' | 'low'
export const scoreBand = (score: number): ScoreBand =>
  score >= 90 ? 'good' : score >= 50 ? 'mid' : 'low'

/**
 * The worst severity at or above which `failOn` counts a finding. `none` counts none; otherwise a
 * count of the findings that severity or a worse one has, from the report's own summary.
 */
export type FailOn = 'critical' | 'serious' | 'none'
export function countAtOrAbove(
  bySeverity: Readonly<Record<Severity, number>>,
  failOn: FailOn,
): number {
  if (failOn === 'none') return 0
  return SEVERITIES.filter((severity) => severityRank(severity) <= severityRank(failOn)).reduce(
    (sum, severity) => sum + bySeverity[severity],
    0,
  )
}
