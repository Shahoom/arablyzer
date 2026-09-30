import type { Finding, Report, RuleStatus } from '@arablyzer/report-schema'
import { formatDate } from './dates'
import { renderHead } from './head'
import { escapeHtml } from './html'
import { localePath, PATHS, type Lang } from './site'
import { STRINGS } from './strings'
import { document } from './tool-page'

/**
 * A scan report as a page. User reports are never indexed (BUILD-PLAN §6.5), so they carry
 * noindex and no canonical or hreflang; nofollow, because they quote other sites. Every value
 * comes from a scanned page, so every value is escaped, and shown() makes its controls visible.
 */
export function renderReportPage(report: Report, lang: Lang): string {
  const t = STRINGS[lang].report
  const { target, summary } = report
  const text = (value: string) => escapeHtml(shown(value))
  const ruleLink = (id: string, title: string) =>
    `<a href="${escapeHtml(localePath(lang, PATHS.rule(id)))}">${text(title)}</a>`
  const head = renderHead({
    title: `${t.title}: ${shown(target.url)}`,
    robots: 'noindex, nofollow',
  })

  const counts: [RuleStatus, number][] = [
    ['fail', summary.fail],
    ['pass', summary.pass],
    ['needs-review', summary.needsReview],
    ['not-applicable', summary.notApplicable],
    ['error', summary.error],
  ]
  const byRule = new Map<string, Finding[]>()
  for (const finding of report.findings) {
    byRule.set(finding.ruleId, [...(byRule.get(finding.ruleId) ?? []), finding])
  }
  const problems = report.rules
    .filter((rule) => byRule.has(rule.id))
    .map((rule) =>
      [
        '<article>',
        `<h3>${ruleLink(rule.id, rule.title[lang])}</h3>`,
        `<p>${escapeHtml(t.severity[rule.severity])}</p>`,
        `<ul>${(byRule.get(rule.id) ?? []).map((finding) => `<li>${findingHtml(finding, lang, target.finalUrl)}</li>`).join('')}</ul>`,
        ...(rule.findingsOmitted === undefined ? [] : [`<p>… +${rule.findingsOmitted}</p>`]),
        '</article>',
      ].join('\n'),
    )
  // As the CLI does: a failed scan checked nothing, so it neither lists problems nor claims none.
  const failed = report.scan.status === 'failed'
  const errors = report.rules.filter((rule) => rule.status === 'error')

  const body = [
    '<main>',
    `<h1>${escapeHtml(t.title)}</h1>`,
    `<p>${escapeHtml(t.scannedPage)} <span dir="ltr">${text(target.url)}</span></p>`,
    `<p>${escapeHtml(t.scan[report.scan.status])}${target.http.status === null ? '' : ` · HTTP ${target.http.status}`} · <time datetime="${escapeHtml(target.fetchedAt)}">${formatDate(target.fetchedAt.slice(0, 10), lang)}</time></p>`,
    '<section id="summary">',
    `<h2>${escapeHtml(t.summary)}</h2>`,
    ...(report.score.overall === null
      ? []
      : [
          `<p>${escapeHtml(t.score(report.score.overall, report.score.partial, report.score.rules.ran, report.score.rules.total))}</p>`,
        ]),
    `<ul>${counts
      .filter(([, count]) => count > 0)
      .map(([status, count]) => `<li>${count} ${escapeHtml(t.status[status])}</li>`)
      .join('')}</ul>`,
    '</section>',
    ...(failed
      ? []
      : [
          '<section id="findings">',
          `<h2>${escapeHtml(t.findings)}</h2>`,
          ...(problems.length === 0 ? [`<p>${escapeHtml(t.noFindings)}</p>`] : problems),
          '</section>',
        ]),
    ...(failed || errors.length === 0
      ? []
      : [
          '<section id="errors">',
          `<h2>${escapeHtml(t.ruleErrors)}</h2>`,
          `<ul>${errors
            .map(
              (rule) =>
                `<li>${ruleLink(rule.id, rule.title[lang])} <code dir="ltr">${text(rule.error ?? 'error')}</code></li>`,
            )
            .join('')}</ul>`,
          '</section>',
        ]),
    ...(report.scan.notices.length === 0
      ? []
      : [
          '<section id="notices">',
          `<h2>${escapeHtml(t.notices)}</h2>`,
          `<ul>${report.scan.notices.map((notice) => `<li>${text(notice.message[lang])}</li>`).join('')}</ul>`,
          '</section>',
        ]),
    '</main>',
  ]
  return document(lang, head, body)
}

/** The finding's evidence; its URL only when it is not the scanned page (robots.txt, say). */
function findingHtml(finding: Finding, lang: Lang, pageUrl: string | null): string {
  const t = STRINGS[lang].report
  const text = (value: string) => escapeHtml(shown(value))
  const { url, selector, location, snippet } = finding.evidence
  const where = [
    ...(url === undefined || url === pageUrl ? [] : [`<span dir="ltr">${text(url)}</span>`]),
    ...(selector === undefined ? [] : [`<code dir="ltr">${text(selector)}</code>`]),
    ...(location === undefined ? [] : [`${escapeHtml(t.line)} ${location.line}`]),
  ]
  return [
    `<p>${text(finding.message[lang])}</p>`,
    ...(where.length === 0 ? [] : [`<p>${where.join(' · ')}</p>`]),
    ...(snippet === undefined
      ? []
      : [`<pre dir="ltr"><code>${escapeHtml(shown(snippet, true))}</code></pre>`]),
  ].join('')
}

/**
 * Text from a scanned page, with what could reorder or hide it made visible, as the CLI does:
 * whitespace controls become spaces (in code, tabs and line breaks stay), and other C0 and C1
 * controls, line and paragraph separators, and bidi embeddings, overrides and isolates show as
 * \uXXXX. The bidi marks Arabic text uses (U+200E, U+200F, U+061C) stay.
 */
function shown(text: string, code = false): string {
  let out = ''
  for (const char of text) {
    const c = char.charCodeAt(0)
    if (code && (c === 0x09 || c === 0x0a)) out += char
    else if (c >= 0x09 && c <= 0x0d) out += ' '
    else if (
      c < 0x20 ||
      (c >= 0x7f && c <= 0x9f) ||
      c === 0x2028 ||
      c === 0x2029 ||
      (c >= 0x202a && c <= 0x202e) ||
      (c >= 0x2066 && c <= 0x2069)
    ) {
      out += `\\u${c.toString(16).toUpperCase().padStart(4, '0')}`
    } else out += char
  }
  return out
}
