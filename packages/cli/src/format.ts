import type { Finding, Report, RuleStatus, Severity } from '@arablyzer/report-schema'
import { STRINGS, type Lang } from './i18n'

const SGR = { bold: 1, dim: 2, red: 31, green: 32, yellow: 33, cyan: 36 } as const

const SEVERITY_COLOR: Readonly<Record<Severity, number>> = {
  critical: SGR.red,
  serious: SGR.red,
  moderate: SGR.yellow,
  minor: SGR.cyan,
  info: SGR.cyan,
}

/**
 * The human-readable report. Many terminals cannot lay out right-to-left text, so Arabic may show
 * reversed there; --lang en or --json avoid that (docs/design/phase-0.md §3).
 */
export function formatReport(report: Report, lang: Lang, color: boolean): string {
  const t = STRINGS[lang]
  const paint = (code: number, text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text)
  const { target, summary } = report
  const lines: string[] = []

  const destination =
    target.finalUrl !== null && target.finalUrl !== target.url
      ? `${target.url} → ${target.finalUrl}`
      : target.url
  lines.push(paint(SGR.bold, `Arablyzer ${report.generator.version} · ${destination}`))
  const http = target.http.status === null ? '' : `HTTP ${target.http.status} · `
  lines.push(
    `${http}${t.scan[report.scan.status]} · ${(report.scan.durationMs / 1000).toFixed(1)} s`,
  )

  const counts: [RuleStatus, number][] = [
    ['fail', summary.fail],
    ['pass', summary.pass],
    ['needs-review', summary.needsReview],
    ['not-applicable', summary.notApplicable],
    ['error', summary.error],
  ]
  const tally = counts
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${t.status[status]}`)
  if (tally.length > 0) lines.push(tally.join(' · '))

  const byRule = new Map<string, Finding[]>()
  for (const finding of report.findings) {
    byRule.set(finding.ruleId, [...(byRule.get(finding.ruleId) ?? []), finding])
  }
  for (const [ruleId, findings] of byRule) {
    const rule = report.rules.find((result) => result.id === ruleId)
    if (rule === undefined) continue
    lines.push('')
    lines.push(
      `${paint(SEVERITY_COLOR[rule.severity], `✗ ${t.severity[rule.severity]}`)}  ${paint(SGR.bold, ruleId)}  ${rule.title[lang]}`,
    )
    for (const finding of findings) {
      lines.push(`    • ${finding.message[lang]}`)
      const where = evidenceLine(finding, target.finalUrl, t.line)
      if (where !== '') lines.push(paint(SGR.dim, `      ${where}`))
    }
    if (rule.findingsOmitted !== undefined) lines.push(`    … +${rule.findingsOmitted}`)
  }
  if (summary.fail === 0 && report.scan.status !== 'failed') {
    lines.push('', paint(SGR.green, `✓ ${t.noProblems}`))
  }

  const errors = report.rules.filter((rule) => rule.status === 'error')
  if (errors.length > 0 && report.scan.status !== 'failed') {
    lines.push('', paint(SGR.bold, t.ruleErrors))
    for (const rule of errors) lines.push(`  - ${rule.id} (${rule.error ?? 'error'})`)
  }
  if (report.scan.notices.length > 0) {
    lines.push('', paint(SGR.bold, t.notices))
    for (const notice of report.scan.notices) lines.push(`  • ${notice.message[lang]}`)
  }
  return `${lines.join('\n')}\n`
}

function evidenceLine(finding: Finding, pageUrl: string | null, lineLabel: string): string {
  const { url, selector, location, snippet } = finding.evidence
  const parts: string[] = []
  if (url !== undefined && url !== pageUrl) parts.push(url)
  if (selector !== undefined) parts.push(selector)
  if (location !== undefined) parts.push(`${lineLabel} ${location.line}`)
  if (snippet !== undefined) parts.push(snippet)
  return parts.join(' · ')
}
