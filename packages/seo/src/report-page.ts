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
 * comes from a scanned page, so every value is escaped.
 */
export function renderReportPage(report: Report, lang: Lang): string {
  const t = STRINGS[lang].report
  const { target, summary } = report
  const head = renderHead({
    title: `${t.title}: ${target.url}`,
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
        `<h3><a href="${localePath(lang, PATHS.rule(rule.id))}">${escapeHtml(rule.title[lang])}</a></h3>`,
        `<p>${escapeHtml(t.severity[rule.severity])}</p>`,
        `<ul>${(byRule.get(rule.id) ?? []).map((finding) => `<li>${findingHtml(finding, lang)}</li>`).join('')}</ul>`,
        ...(rule.findingsOmitted === undefined ? [] : [`<p>… +${rule.findingsOmitted}</p>`]),
        '</article>',
      ].join('\n'),
    )

  const body = [
    '<main>',
    `<h1>${escapeHtml(t.title)}</h1>`,
    `<p>${escapeHtml(t.scannedPage)} <span dir="ltr">${escapeHtml(target.url)}</span></p>`,
    `<p>${escapeHtml(t.scan[report.scan.status])}${target.http.status === null ? '' : ` · HTTP ${target.http.status}`} · <time datetime="${escapeHtml(target.fetchedAt)}">${formatDate(target.fetchedAt.slice(0, 10), lang)}</time></p>`,
    '<section id="summary">',
    `<h2>${escapeHtml(t.summary)}</h2>`,
    `<ul>${counts
      .filter(([, count]) => count > 0)
      .map(([status, count]) => `<li>${count} ${escapeHtml(t.status[status])}</li>`)
      .join('')}</ul>`,
    '</section>',
    '<section id="findings">',
    `<h2>${escapeHtml(t.findings)}</h2>`,
    ...(problems.length === 0 ? [`<p>${escapeHtml(t.noFindings)}</p>`] : problems),
    '</section>',
    ...(report.scan.notices.length === 0
      ? []
      : [
          '<section id="notices">',
          `<h2>${escapeHtml(t.notices)}</h2>`,
          `<ul>${report.scan.notices.map((notice) => `<li>${escapeHtml(notice.message[lang])}</li>`).join('')}</ul>`,
          '</section>',
        ]),
    '</main>',
  ]
  return document(lang, head, body)
}

function findingHtml(finding: Finding, lang: Lang): string {
  const t = STRINGS[lang].report
  const { url, selector, location, snippet } = finding.evidence
  const where = [
    ...(url === undefined ? [] : [`<span dir="ltr">${escapeHtml(url)}</span>`]),
    ...(selector === undefined ? [] : [`<code dir="ltr">${escapeHtml(selector)}</code>`]),
    ...(location === undefined ? [] : [`${escapeHtml(t.line)} ${location.line}`]),
  ]
  return [
    `<p>${escapeHtml(finding.message[lang])}</p>`,
    ...(where.length === 0 ? [] : [`<p>${where.join(' · ')}</p>`]),
    ...(snippet === undefined ? [] : [`<pre dir="ltr"><code>${escapeHtml(snippet)}</code></pre>`]),
  ].join('')
}
