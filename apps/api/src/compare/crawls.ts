import {
  CHANGE_KINDS,
  MAX_FINDING_CHANGES,
  type ChangeKind,
  type CrawlComparison,
  type CrawlIssueChange,
  type CrawlReport,
  type CrawlShare,
  type CrawlTemplateChange,
  type TemplateKind,
} from '@arablyzer/api-contract'
import { SEVERITY_RANK, scoreChange } from './scans'

// Two crawls of one site, matched by what lasts between them: the rule, whether the browsers
// found it, and the template's address shape (its key, t3, is only the crawl's own).

/** A share of pages that moved this much, in points of the template's pages, has moved for real. */
export const SHARE_STEP = 0.1

const share = (value: CrawlShare | null): number =>
  value === null ? 0 : value.pages / Math.max(1, value.checked)

interface Seen {
  severity: CrawlIssueChange['severity']
  title: CrawlIssueChange['title']
  share: CrawlShare
  templateKind: TemplateKind
}

/** rule, rendered, pattern → how many pages of that template. */
function shares(
  report: CrawlReport,
): Map<string, Seen & { ruleId: string; rendered: boolean; pattern: string }> {
  const patterns = new Map(report.templates.map((template) => [template.key, template]))
  const seen = new Map<string, Seen & { ruleId: string; rendered: boolean; pattern: string }>()
  for (const issue of report.issues) {
    for (const on of issue.templates) {
      const template = patterns.get(on.template)
      if (template === undefined) continue
      const key = `${issue.ruleId}\u0000${issue.rendered ? 'r' : 'h'}\u0000${template.pattern}`
      const kept = seen.get(key)
      if (kept === undefined) {
        seen.set(key, {
          ruleId: issue.ruleId,
          rendered: issue.rendered,
          pattern: template.pattern,
          severity: issue.severity,
          title: issue.title,
          templateKind: template.kind,
          share: { pages: on.pages, checked: on.checked },
        })
      } else {
        kept.share = {
          pages: kept.share.pages + on.pages,
          checked: kept.share.checked + on.checked,
        }
      }
    }
  }
  return seen
}

interface Pattern {
  kind: TemplateKind
  found: number
  checked: number
  scores: number[]
}

function patternsOf(report: CrawlReport): Map<string, Pattern> {
  const patterns = new Map<string, Pattern>()
  for (const template of report.templates) {
    const kept = patterns.get(template.pattern) ?? {
      kind: template.kind,
      found: 0,
      checked: 0,
      scores: [],
    }
    kept.found += template.found
    kept.checked += template.checked
    for (const rep of template.representatives) if (rep.score !== null) kept.scores.push(rep.score)
    patterns.set(template.pattern, kept)
  }
  return patterns
}

const mean = (scores: readonly number[]): number | null =>
  scores.length === 0 ? null : Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length)

export function compareCrawls(base: CrawlReport, head: CrawlReport): CrawlComparison {
  const was = shares(base)
  const is = shares(head)
  const changes: CrawlIssueChange[] = []
  for (const [key, now] of is) {
    const then = was.get(key)
    let kind: ChangeKind = 'new'
    if (then !== undefined) {
      const moved = share(now.share) - share(then.share)
      kind =
        SEVERITY_RANK[now.severity] < SEVERITY_RANK[then.severity] || moved >= SHARE_STEP
          ? 'worsened'
          : SEVERITY_RANK[now.severity] > SEVERITY_RANK[then.severity] || moved <= -SHARE_STEP
            ? 'improved'
            : 'unchanged'
    }
    changes.push({
      kind,
      ruleId: now.ruleId,
      severity: now.severity,
      title: now.title,
      rendered: now.rendered,
      pattern: now.pattern,
      templateKind: now.templateKind,
      before: then?.share ?? null,
      after: now.share,
    })
  }
  for (const [key, then] of was) {
    if (is.has(key)) continue
    changes.push({
      kind: 'fixed',
      ruleId: then.ruleId,
      severity: then.severity,
      title: then.title,
      rendered: then.rendered,
      pattern: then.pattern,
      templateKind: then.templateKind,
      before: then.share,
      after: null,
    })
  }
  const order = (kind: ChangeKind) => CHANGE_KINDS.indexOf(kind)
  changes.sort(
    (a, b) =>
      order(a.kind) - order(b.kind) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      share(b.after ?? b.before) - share(a.after ?? a.before) ||
      (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0) ||
      (a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0),
  )
  const counts: Record<ChangeKind, number> = {
    new: 0,
    fixed: 0,
    worsened: 0,
    improved: 0,
    unchanged: 0,
  }
  for (const item of changes) counts[item.kind]++

  const thenTemplates = patternsOf(base)
  const nowTemplates = patternsOf(head)
  const templates: CrawlTemplateChange[] = [
    ...new Set([...nowTemplates.keys(), ...thenTemplates.keys()]),
  ].map((pattern) => {
    const then = thenTemplates.get(pattern)
    const now = nowTemplates.get(pattern)
    return {
      pattern,
      kind: (now ?? then)?.kind ?? 'generic',
      before: then === undefined ? null : { found: then.found, checked: then.checked },
      after: now === undefined ? null : { found: now.found, checked: now.checked },
      score: scoreChange(mean(then?.scores ?? []), mean(now?.scores ?? [])),
    }
  })
  const all = (report: CrawlReport) =>
    report.templates.flatMap((template) =>
      template.representatives.flatMap((rep) => (rep.score === null ? [] : [rep.score])),
    )
  return {
    base: base.crawl,
    head: head.crawl,
    score: scoreChange(mean(all(base)), mean(all(head))),
    templates,
    counts,
    changes: changes.slice(0, MAX_FINDING_CHANGES),
    omitted: Math.max(0, changes.length - MAX_FINDING_CHANGES),
  }
}
