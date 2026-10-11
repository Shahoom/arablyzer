import {
  API_V1_PATH,
  type V1Rule,
  type V1RuleDetail,
  type V1Scan,
  type V1Tool,
} from '@arablyzer/api-contract'
import type { Rule } from '@arablyzer/rules'
import type { Tool } from '@arablyzer/tools'
import type { HistoryEntry, ScanRecord } from '@arablyzer/store'

// What /api/v1 shows of the things it names: plain objects, no store type leaks out.

type ScanLike = Pick<ScanRecord, 'id' | 'url' | 'state' | 'createdAt'> & {
  readonly tool: string | null
  readonly score: number | null
}

/** A scan as the API tells it; `origin` is the site's, where the report page is read. */
export function scanOf(scan: ScanLike, origin: string | undefined): V1Scan {
  return {
    id: scan.id,
    url: scan.url,
    state: scan.state,
    tool: scan.tool,
    createdAt: scan.createdAt.toISOString(),
    score: scan.score,
    links: {
      status: `${API_V1_PATH}/scans/${scan.id}`,
      report: `${API_V1_PATH}/scans/${scan.id}/report`,
      page: `${origin ?? ''}/r/${scan.id}`,
    },
  }
}

export const scanOfRecord = (scan: ScanRecord, origin: string | undefined): V1Scan =>
  scanOf(
    { ...scan, score: scan.tool === null ? (scan.report?.score.overall ?? null) : null },
    origin,
  )

export const scanOfEntry = (entry: HistoryEntry, origin: string | undefined): V1Scan =>
  scanOf(
    {
      id: entry.scanId,
      url: entry.url,
      state: entry.state,
      createdAt: entry.createdAt,
      tool: null,
      score: entry.score,
    },
    origin,
  )

export const toolOf = (tool: Tool): V1Tool => ({
  slug: tool.slug,
  kind: tool.kind ?? 'scan',
  category: tool.category,
  title: { ar: tool.copy.ar.title, en: tool.copy.en.title },
  summary: { ar: tool.copy.ar.summary, en: tool.copy.en.summary },
  rules: [...tool.rules],
  runnable: (tool.kind ?? 'scan') === 'scan',
  updated: tool.updated,
})

// The rule library and the tools' pages are read when first asked for: the API does not load the
// whole rule set (and the libraries it uses) to answer a scan or an account.
/** Every tool, sorted by slug. */
export async function allTools(): Promise<V1Tool[]> {
  const { TOOLS } = await import('@arablyzer/tools')
  return TOOLS.map(toolOf)
}

export const ruleOf = (rule: Rule): V1Rule => ({
  id: rule.id,
  category: rule.category,
  severity: rule.severity,
  wcag: rule.wcag === undefined ? null : [...rule.wcag],
  manualCheck: rule.manualCheck === true,
  title: { ar: rule.copy.ar.title, en: rule.copy.en.title },
})

export async function rules(): Promise<readonly Rule[]> {
  return (await import('@arablyzer/rules')).RULES
}

export function ruleDetailOf(rule: Rule): V1RuleDetail {
  const text = (lang: 'ar' | 'en') => {
    const copy = rule.copy[lang]
    return {
      title: copy.title,
      why: copy.sections.why,
      fix: copy.sections.fix,
      detect: copy.sections.detect,
      references: copy.sections.references,
      reviewed: copy.reviewed,
    }
  }
  return { ...ruleOf(rule), copy: { ar: text('ar'), en: text('en') } }
}
