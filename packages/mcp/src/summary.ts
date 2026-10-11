import type { Report } from '@arablyzer/report-schema'
import type { Scan } from './client'

const SEVERITIES = ['critical', 'serious', 'moderate', 'minor', 'info'] as const
type Severity = (typeof SEVERITIES)[number]

export interface Issue {
  readonly ruleId: string
  readonly severity: Severity
  readonly occurrences: number
  readonly message: { readonly en: string; readonly ar: string }
  /** The first place it was found. */
  readonly example?: {
    readonly selector?: string
    readonly url?: string
    readonly snippet?: string
  }
}

/** What a model needs from a report: the verdict, the counts, and the worst problems first. */
export interface ReportSummary {
  readonly scanId: string
  readonly url: string
  readonly state: Scan['state']
  readonly score: number | null
  /** Some rule could not run, so the score counts only those that did. */
  readonly scorePartial: boolean
  readonly findings: {
    readonly total: number
    readonly bySeverity: Readonly<Record<Severity, number>>
  }
  readonly rules: {
    readonly passed: number
    readonly failed: number
    readonly needsReview: number
    readonly errored: number
  }
  /** The browsers that drew the page. */
  readonly renderedIn: readonly string[]
  readonly issues: readonly Issue[]
  /** More issues than `issues` lists; the report page has them all. */
  readonly moreIssues: number
  readonly reportPage: string
}

const rank = (severity: Severity) => SEVERITIES.indexOf(severity)

/** The report as a summary: issues grouped by rule, worst first, at most `maxIssues` of them. */
export function summarize(scan: Scan, report: Report, maxIssues: number): ReportSummary {
  const grouped = new Map<string, { issue: Issue; count: number }>()
  for (const finding of report.findings) {
    const known = grouped.get(finding.ruleId)
    if (known !== undefined) {
      known.count++
      continue
    }
    const { selector, url, snippet } = finding.evidence
    const example = {
      ...(selector === undefined ? {} : { selector }),
      ...(url === undefined ? {} : { url }),
      ...(snippet === undefined ? {} : { snippet }),
    }
    grouped.set(finding.ruleId, {
      count: 1,
      issue: {
        ruleId: finding.ruleId,
        severity: finding.severity,
        occurrences: 1,
        message: { en: finding.message.en, ar: finding.message.ar },
        ...(Object.keys(example).length === 0 ? {} : { example }),
      },
    })
  }
  const issues = [...grouped.values()]
    .map(({ issue, count }) => ({ ...issue, occurrences: count }))
    .sort(
      (a, b) =>
        rank(a.severity) - rank(b.severity) ||
        b.occurrences - a.occurrences ||
        a.ruleId.localeCompare(b.ruleId),
    )
  return {
    scanId: scan.id,
    url: scan.url,
    state: scan.state,
    score: report.score.overall,
    scorePartial: report.score.partial,
    findings: { total: report.findings.length, bySeverity: report.summary.bySeverity },
    rules: {
      passed: report.summary.pass,
      failed: report.summary.fail,
      needsReview: report.summary.needsReview,
      errored: report.summary.error,
    },
    renderedIn: (report.scan.render ?? [])
      .filter((run) => run.status === 'rendered')
      .map((run) => run.engine),
    issues: issues.slice(0, maxIssues),
    moreIssues: Math.max(0, issues.length - maxIssues),
    reportPage: scan.links.page,
  }
}
