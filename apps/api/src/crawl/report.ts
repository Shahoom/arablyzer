import type {
  CrawlIssue,
  CrawlIssueOnTemplate,
  CrawlPage,
  CrawlReport,
  CrawlSummary,
  CrawlTemplate,
  ScanState,
} from '@arablyzer/api-contract'
import type { Crawl, CrawlPageRow, PageIssue } from '@arablyzer/store'

// What a finished (or running) crawl says (M4.5): the summary, the templates, and for each issue
// the pages of each template it sits on. Computed on read from the stored rows, so a
// representative's report that arrives late changes the answer and nothing else.

const SEVERITY_RANK = { critical: 0, serious: 1, moderate: 2, minor: 3, info: 4 } as const
/** The most issues one report lists. */
export const MAX_REPORT_ISSUES = 200
const EXAMPLES = 3
const TOP_ISSUES = 3
const ENDED: ReadonlySet<ScanState> = new Set(['complete', 'partial', 'failed'])

/** What the report knows of a representative's scan. */
export interface ScanFact {
  readonly state: ScanState
  readonly score: number | null
}

export function summaryOf(crawl: Crawl, rendered: { done: number; total: number }): CrawlSummary {
  return {
    id: crawl.id,
    siteId: crawl.siteId,
    origin: crawl.origin,
    state: crawl.state,
    error: crawl.error,
    pagesFound: crawl.pagesFound,
    pagesChecked: crawl.pagesChecked,
    pageCap: crawl.pageCap,
    templates: crawl.templates.length,
    rendered,
    createdAt: crawl.createdAt.toISOString(),
    finishedAt: crawl.finishedAt === null ? null : crawl.finishedAt.toISOString(),
  }
}

/** How many representatives the crawl planned, and how many of their scans have ended. */
export function renderedOf(
  crawl: Crawl,
  rows: readonly CrawlPageRow[],
  scans: ReadonlyMap<string, ScanFact>,
): { done: number; total: number } {
  const planned = new Set(crawl.templates.flatMap((template) => template.representatives))
  let done = 0
  for (const row of rows) {
    if (!planned.has(row.url) || row.scanId === null) continue
    if (ENDED.has(scans.get(row.scanId)?.state ?? 'queued')) done++
  }
  return { done, total: planned.size }
}

interface Tally {
  pages: number
  examples: string[]
}

const worse = (a: PageIssue['severity'], b: PageIssue['severity']) =>
  SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b

export function buildReport(
  crawl: Crawl,
  rows: readonly CrawlPageRow[],
  scans: ReadonlyMap<string, ScanFact>,
): CrawlReport {
  const byKey = new Map(crawl.templates.map((template) => [template.key, template]))
  // rule → rendered? → template → tally
  const issues = new Map<
    string,
    { severity: PageIssue['severity']; rendered: boolean; byTemplate: Map<string, Tally> }
  >()
  const note = (issue: PageIssue, rendered: boolean, template: string, url: string): void => {
    const id = `${rendered ? 'r' : 'h'}:${issue.id}`
    const entry = issues.get(id) ?? {
      severity: issue.severity,
      rendered,
      byTemplate: new Map<string, Tally>(),
    }
    entry.severity = worse(entry.severity, issue.severity)
    const tally = entry.byTemplate.get(template) ?? { pages: 0, examples: [] as string[] }
    tally.pages++
    if (tally.examples.length < EXAMPLES) tally.examples.push(url)
    entry.byTemplate.set(template, tally)
    issues.set(id, entry)
  }
  /** Per template: the representatives whose browser scan has ended, which the rendered issues are counted of. */
  const renderedChecked = new Map<string, number>()
  const planned = new Map<string, Set<string>>()
  for (const template of crawl.templates)
    planned.set(template.key, new Set(template.representatives))
  for (const row of rows) {
    if (row.template === null || row.state !== 'checked') continue
    for (const issue of row.issues) note(issue, false, row.template, row.url)
    if (planned.get(row.template)?.has(row.url) !== true || row.scanId === null) continue
    if (!ENDED.has(scans.get(row.scanId)?.state ?? 'queued')) continue
    renderedChecked.set(row.template, (renderedChecked.get(row.template) ?? 0) + 1)
    for (const issue of row.renderIssues) note(issue, true, row.template, row.url)
  }

  const listed: CrawlIssue[] = [...issues]
    .map(([id, entry]): CrawlIssue => {
      const ruleId = id.slice(2)
      const templates: CrawlIssueOnTemplate[] = [...entry.byTemplate]
        .map(([template, tally]) => ({
          template,
          pages: tally.pages,
          checked: entry.rendered
            ? (renderedChecked.get(template) ?? 0)
            : (byKey.get(template)?.checked ?? 0),
          examples: tally.examples,
        }))
        .sort(
          (a, b) =>
            b.pages / Math.max(1, b.checked) - a.pages / Math.max(1, a.checked) ||
            b.pages - a.pages,
        )
      return {
        ruleId,
        severity: entry.severity,
        title: crawl.titles[ruleId] ?? { ar: ruleId, en: ruleId },
        rendered: entry.rendered,
        pages: templates.reduce((sum, t) => sum + t.pages, 0),
        templates,
      }
    })
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.pages - a.pages ||
        (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0),
    )
    .slice(0, MAX_REPORT_ISSUES)

  const templates: CrawlTemplate[] = crawl.templates.map((template) => {
    const top = listed
      .filter((issue) => issue.templates.some((t) => t.template === template.key))
      .slice(0, TOP_ISSUES)
      .map((issue) => issue.ruleId)
    return {
      key: template.key,
      kind: template.kind,
      pattern: template.pattern,
      found: template.found,
      checked: template.checked,
      topIssues: top,
      representatives: template.representatives.map((url) => {
        const row = rows.find((candidate) => candidate.url === url)
        const scan = row?.scanId == null ? undefined : scans.get(row.scanId)
        return {
          url,
          scanId: row?.scanId ?? null,
          state: scan?.state ?? null,
          score: scan?.score ?? null,
        }
      }),
    }
  })
  return {
    crawl: summaryOf(crawl, renderedOf(crawl, rows, scans)),
    templates,
    issues: listed,
  }
}

export function pageOf(row: CrawlPageRow): CrawlPage {
  return {
    url: row.url,
    depth: row.depth,
    status: row.status,
    state: row.state,
    template: row.template,
    title: row.title,
    issues: [...row.issues, ...row.renderIssues].map((issue) => ({
      ruleId: issue.id,
      severity: issue.severity,
      count: issue.count,
    })),
    scanId: row.scanId,
  }
}
