import {
  CHANGE_KINDS,
  MAX_FINDING_CHANGES,
  type CategoryChange,
  type ChangeKind,
  type ComparedScan,
  type EngineChange,
  type EngineName,
  type FindingChange,
  type ScanComparison,
  type ScoreChange,
  type SeverityName,
} from '@arablyzer/api-contract'
import { Category, type Finding, type Report } from '@arablyzer/report-schema'
import type { ScanRecord } from '@arablyzer/store'
import { locatorOf } from './normalize'

// Two whole-page reports of one site, side by side (M4.6): which findings were fixed, appeared,
// got worse, got better or stayed, and what the scores and the three engines say of it.

export const SEVERITY_RANK: Readonly<Record<SeverityName, number>> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
  info: 4,
}
const ENGINES: readonly EngineName[] = ['chromium', 'firefox', 'webkit']

export function scoreChange(before: number | null, after: number | null): ScoreChange {
  return { before, after, change: before !== null && after !== null ? after - before : null }
}

/** A scan the comparison can read: a whole-page scan that ended with a report. */
export type Comparable = ScanRecord & { readonly report: Report }
export function isComparable(scan: ScanRecord | null): scan is Comparable {
  return (
    scan !== null &&
    scan.tool === null &&
    scan.report !== null &&
    (scan.state === 'complete' || scan.state === 'partial')
  )
}

const comparedOf = (scan: Comparable): ComparedScan => ({
  id: scan.id,
  url: scan.url,
  createdAt: scan.createdAt.toISOString(),
  state: scan.state,
  rulesetVersion: scan.report.generator.rulesetVersion,
  rules: { ran: scan.report.score.rules.ran, total: scan.report.score.rules.total },
})

/** The n-th finding with a key on one side is the n-th on the other. */
function keyed(findings: readonly Finding[]): Map<string, Finding> {
  const seen = new Map<string, number>()
  const keyedFindings = new Map<string, Finding>()
  for (const finding of findings) {
    const base = `${finding.ruleId}\u0000${locatorOf(finding.evidence).key}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    keyedFindings.set(`${base}\u0000${n}`, finding)
  }
  return keyedFindings
}

function engineFindings(report: Report, engine: EngineName): number | null {
  if (report.scan.render?.find((run) => run.engine === engine)?.status !== 'rendered') return null
  return report.findings.filter((finding) => finding.evidence.engines?.includes(engine) === true)
    .length
}

const change = (
  kind: ChangeKind,
  finding: Finding,
  before: SeverityName | null,
  after: SeverityName | null,
): FindingChange => ({
  kind,
  ruleId: finding.ruleId,
  severity: finding.severity,
  before,
  after,
  locator: locatorOf(finding.evidence).label,
  message: finding.message,
  engines: finding.evidence.engines ?? [],
})

export function compareScans(base: Comparable, head: Comparable): ScanComparison {
  const was = keyed(base.report.findings)
  const is = keyed(head.report.findings)
  const changes: FindingChange[] = []
  for (const [key, now] of is) {
    const then = was.get(key)
    if (then === undefined) {
      changes.push(change('new', now, null, now.severity))
      continue
    }
    const kind: ChangeKind =
      SEVERITY_RANK[now.severity] < SEVERITY_RANK[then.severity]
        ? 'worsened'
        : SEVERITY_RANK[now.severity] > SEVERITY_RANK[then.severity]
          ? 'improved'
          : 'unchanged'
    changes.push(change(kind, now, then.severity, now.severity))
  }
  for (const [key, then] of was) {
    if (!is.has(key)) changes.push(change('fixed', then, then.severity, null))
  }
  const order = (kind: ChangeKind) => CHANGE_KINDS.indexOf(kind)
  changes.sort(
    (a, b) =>
      order(a.kind) - order(b.kind) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0) ||
      (a.locator ?? '').localeCompare(b.locator ?? ''),
  )
  const counts: Record<ChangeKind, number> = {
    new: 0,
    fixed: 0,
    worsened: 0,
    improved: 0,
    unchanged: 0,
  }
  for (const item of changes) counts[item.kind]++

  const before = base.report.score
  const after = head.report.score
  const categories: CategoryChange[] = Category.options
    .filter((category) => category in before.categories || category in after.categories)
    .map((category) => ({
      category,
      ...scoreChange(before.categories[category] ?? null, after.categories[category] ?? null),
    }))
  const engines: EngineChange[] = ENGINES.map((engine) => ({
    engine,
    before: base.report.scan.render?.find((run) => run.engine === engine)?.status ?? null,
    after: head.report.scan.render?.find((run) => run.engine === engine)?.status ?? null,
    findingsBefore: engineFindings(base.report, engine),
    findingsAfter: engineFindings(head.report, engine),
  })).filter((row) => row.before !== null || row.after !== null)

  return {
    base: comparedOf(base),
    head: comparedOf(head),
    overall: scoreChange(before.overall, after.overall),
    categories,
    engines,
    sameRules:
      base.report.generator.rulesetVersion.split('.')[0] ===
        head.report.generator.rulesetVersion.split('.')[0] &&
      before.rules.ran === after.rules.ran &&
      before.rules.total === after.rules.total,
    counts,
    changes: changes.slice(0, MAX_FINDING_CHANGES),
    omitted: Math.max(0, changes.length - MAX_FINDING_CHANGES),
  }
}
