import { INTEGRATIONS_UI } from '@arablyzer/i18n/integrations'
import {
  groupIssues,
  rulePageUrl,
  SEVERITIES,
  type FailOn,
  type SiteLang,
} from '@arablyzer/integrations-core'
import type { Report } from '@arablyzer/report-schema'

// The job summary: markdown for the run's page. Everything that came from the scanned page (a
// message that quotes its text, a selector, an address) is untrusted: it is escaped, so a page
// cannot put its own links, images or HTML into someone's job summary.

const MAX_CELL = 120

/** Plain text as markdown shows it as written: no emphasis, link, image, table or tag from it. */
export function escapeMarkdown(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const short = flat.length > MAX_CELL ? `${flat.slice(0, MAX_CELL - 1)}…` : flat
  return short.replace(/[\\`*_{}[\]()#+!|<>~&]/g, (char) => `\\${char}`)
}

/** A selector or address as code; backticks inside cannot end the span. */
export function codeSpan(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const short = flat.length > MAX_CELL ? `${flat.slice(0, MAX_CELL - 1)}…` : flat
  return `\`${short.replace(/`/g, "'").replace(/\|/g, '\\|')}\``
}

export interface PageResult {
  readonly url: string
  readonly reportUrl: string
  readonly report: Report
  /** Findings at `failOn` or worse. */
  readonly gateCount: number
}

export interface PageProblem {
  readonly url: string
  readonly problem: string
  /** Seconds the service asked to wait, with a 429. */
  readonly retryAfterSeconds?: number
}

export interface SummaryOptions {
  readonly origin: string
  readonly lang: SiteLang
  readonly maxIssues: number
  readonly failOn: FailOn
}

/** A started-and-not-waited scan, or a finished one with its report. */
export type PageOutcome =
  | { readonly kind: 'report'; readonly result: PageResult }
  | { readonly kind: 'started'; readonly url: string; readonly reportUrl: string }
  | { readonly kind: 'problem'; readonly problem: PageProblem }

function pageSection(result: PageResult, options: SummaryOptions): string[] {
  const t = INTEGRATIONS_UI[options.lang].action
  const report = result.report
  const lines = [`## ${t.heading}: ${codeSpan(result.url)}`, '']
  const score = report.score.overall
  lines.push(score === null ? t.noScore : t.score(score), '')
  if (report.score.partial) lines.push(`> ${t.partial}`, '')

  const by = report.summary.bySeverity
  lines.push(`**${t.counts}**`, '')
  lines.push(`| ${SEVERITIES.map((s) => t.severity[s]).join(' | ')} |`)
  lines.push(`|${SEVERITIES.map(() => ' ---: ').join('|')}|`)
  lines.push(`| ${SEVERITIES.map((s) => String(by[s])).join(' | ')} |`, '')

  const issues = groupIssues(report)
  if (issues.length === 0) {
    lines.push(t.noIssues, '')
  } else {
    lines.push(`**${t.topIssues}**`, '')
    lines.push(`| ${t.columns.join(' | ')} |`, `| --- | --- | ---: | --- |`)
    for (const issue of issues.slice(0, options.maxIssues)) {
      const link = `[${escapeMarkdown(issue.ruleId)}](${rulePageUrl(options.origin, options.lang, issue.ruleId)})`
      const example = issue.example?.selector ?? issue.example?.url ?? ''
      lines.push(
        `| ${link}<br>${escapeMarkdown(issue.message[options.lang])} | ${t.severity[issue.severity]} | ${String(issue.occurrences)} | ${example === '' ? '' : codeSpan(example)} |`,
      )
    }
    lines.push('')
    if (issues.length > options.maxIssues) {
      lines.push(t.moreIssues(issues.length - options.maxIssues), '')
    }
  }

  if (options.failOn !== 'none') {
    const word = t.severity[options.failOn].toLowerCase()
    lines.push(
      `**${result.gateCount > 0 ? t.gate.failed(result.gateCount, word) : t.gate.passed(word)}**`,
      '',
    )
  }
  lines.push(`[${t.fullReport}](${result.reportUrl})`, '')
  return lines
}

/** The whole summary of a run, in the language asked for (right to left for Arabic). */
export function renderSummary(outcomes: readonly PageOutcome[], options: SummaryOptions): string {
  const t = INTEGRATIONS_UI[options.lang].action
  const lines: string[] = []
  for (const outcome of outcomes) {
    if (outcome.kind === 'report') {
      lines.push(...pageSection(outcome.result, options))
    } else if (outcome.kind === 'started') {
      lines.push(
        `## ${t.heading}: ${codeSpan(outcome.url)}`,
        '',
        t.started,
        '',
        `[${t.fullReport}](${outcome.reportUrl})`,
        '',
      )
    } else {
      const { problem } = outcome
      lines.push(
        `## ${t.errorHeading}: ${codeSpan(problem.url)}`,
        '',
        `> ${escapeMarkdown(problem.problem)}${
          problem.retryAfterSeconds === undefined
            ? ''
            : ` ${t.retryAfter(problem.retryAfterSeconds)}`
        }`,
        '',
      )
    }
  }
  lines.push(`<sub>${t.footer}</sub>`)
  const body = lines.join('\n')
  return options.lang === 'ar' ? `<div dir="rtl">\n\n${body}\n\n</div>\n` : `${body}\n`
}
