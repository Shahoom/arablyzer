import type { Engine, Finding, Report, RuleStatus, Severity } from '@arablyzer/report-schema'
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

  const destination = clean(
    target.finalUrl !== null && target.finalUrl !== target.url
      ? `${target.url} → ${target.finalUrl}`
      : target.url,
  )
  lines.push(paint(SGR.bold, `Arablyzer ${report.generator.version} · ${destination}`))
  const http = target.http.status === null ? '' : `HTTP ${target.http.status} · `
  lines.push(
    `${http}${t.scan[report.scan.status]} · ${(report.scan.durationMs / 1000).toFixed(1)} s`,
  )
  for (const run of report.scan.render ?? []) {
    const parts = [
      clean(`${ENGINE_LABEL[run.engine]}${run.version === null ? '' : ` ${run.version}`}`),
      t.render[run.status],
    ]
    if (run.status === 'rendered') {
      parts.push(
        `${(run.durationMs / 1000).toFixed(1)} s`,
        t.requests(run.requests.total, run.requests.refused),
      )
    }
    lines.push(paint(SGR.dim, parts.join(' · ')))
  }

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
      `${paint(SEVERITY_COLOR[rule.severity], `✗ ${t.severity[rule.severity]}`)}  ${paint(SGR.bold, ruleId)}  ${clean(rule.title[lang])}`,
    )
    for (const finding of findings) {
      lines.push(`    • ${clean(finding.message[lang])}`)
      const where = clean(evidenceLine(finding, target.finalUrl, t.line))
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
    for (const notice of report.scan.notices) lines.push(`  • ${clean(notice.message[lang])}`)
  }
  return `${lines.join('\n')}\n`
}

function evidenceLine(finding: Finding, pageUrl: string | null, lineLabel: string): string {
  const { url, selector, location, snippet, engines } = finding.evidence
  const parts: string[] = []
  if (url !== undefined && url !== pageUrl) parts.push(url)
  if (selector !== undefined) parts.push(selector)
  if (location !== undefined) parts.push(`${lineLabel} ${location.line}`)
  if (engines !== undefined) parts.push(engines.map((engine) => ENGINE_LABEL[engine]).join(', '))
  if (snippet !== undefined) parts.push(snippet)
  return parts.join(' · ')
}

const ENGINE_LABEL: Readonly<Record<Engine, string>> = {
  chromium: 'Chromium',
  firefox: 'Firefox',
  webkit: 'WebKit',
}

/** The report as JSON, with the same characters escaped; `\uXXXX` leaves the data unchanged. */
export function formatJson(report: Report): string {
  // JSON.stringify already escapes C0 controls in strings; the only raw ones left are the
  // line breaks between members, which stay.
  let out = ''
  for (const char of JSON.stringify(report, null, 2)) {
    const code = char.charCodeAt(0)
    out += code >= 0x7f && isUnsafe(code) ? escape(code) : char
  }
  return `${out}\n`
}

/**
 * Page text made safe for a terminal (M0.2 review): whitespace controls become spaces, and other
 * C0 and C1 controls, line and paragraph separators, and bidi embeddings, overrides and isolates
 * show as \uXXXX, so a page can neither send escape sequences nor reorder what is printed.
 * The bidi marks Arabic text uses (U+200E, U+200F, U+061C) stay.
 */
export function clean(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code >= 0x09 && code <= 0x0d) out += ' '
    else out += isUnsafe(code) ? escape(code) : char
  }
  return out
}

function isUnsafe(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  )
}

function escape(code: number): string {
  return `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
}
