import { collectPage } from '@arablyzer/collectors'
import {
  ENGINE_VERSION,
  evaluatePage,
  pageSummary,
  scoreOf,
  summarize,
  USER_AGENT,
} from '@arablyzer/engine'
import { KEBAB_ID, Report, SCHEMA_VERSION } from '@arablyzer/report-schema'
import { RULES, RULESET_VERSION } from '@arablyzer/rules'
import { TOOLS, type Tool } from '@arablyzer/tools'
import { renderMarkdown } from '../markdown'
import { renderReportPage } from '../report-page'
import { localePath, pageUrl, PATHS, PREVIEW_SITE, type Lang, type Site } from '../site'
import { renderToolPage } from '../tool-page'
import { auditPair, auditReportPage, type ExpectedPage, type PageProblem } from './audit'

const LANGS: readonly Lang[] = ['ar', 'en']

export interface RenderedPage {
  /** The page URL, or "report (ar)" for the report template. */
  readonly page: string
  /** Where the page would be written: tools/<slug>.html, en/tools/<slug>.html, report.ar.html. */
  readonly file: string
  readonly html: string
}

export interface SiteAudit {
  readonly pages: readonly RenderedPage[]
  readonly problems: readonly PageProblem[]
}

/**
 * The CI self-audit (docs/design/phase-0.md §4.7): every tool page in both languages and the
 * report template, rendered and audited, plus the copy of every rule. In Phase 2 the same checks
 * run on the site Astro builds.
 */
export function auditSite(site: Site = PREVIEW_SITE, tools: readonly Tool[] = TOOLS): SiteAudit {
  const pages: RenderedPage[] = []
  const problems: PageProblem[] = []

  const knownPaths = new Set<string>()
  const known = (path: string) => {
    for (const lang of LANGS) knownPaths.add(localePath(lang, path))
  }
  known(PATHS.home)
  known(PATHS.tools)
  for (const tool of tools) known(PATHS.tool(tool.slug))
  for (const rule of RULES) known(PATHS.rule(rule.id))

  for (const tool of tools) {
    if (!KEBAB_ID.test(tool.slug)) {
      problems.push({ page: tool.slug, check: 'content', message: 'slugs are ASCII kebab-case' })
      continue
    }
    const path = PATHS.tool(tool.slug)
    const alternates = { ar: pageUrl(site, 'ar', path), en: pageUrl(site, 'en', path) }
    const [ar, en] = LANGS.map((lang) => {
      const expected: ExpectedPage = {
        lang,
        url: pageUrl(site, lang, path),
        alternates,
        origin: site.origin,
        knownPaths,
      }
      const html = renderToolPage(tool, lang, site)
      pages.push({ page: expected.url, file: `${localePath(lang, path).slice(1)}.html`, html })
      return { html, expected }
    })
    if (ar !== undefined && en !== undefined) problems.push(...auditPair(ar, en))
  }

  // Rule pages come in Phase 2; their copy must already render.
  for (const rule of RULES) {
    for (const lang of LANGS) {
      const { why, fix, detect, references } = rule.copy[lang].sections
      for (const section of [why, fix, detect, references]) {
        try {
          renderMarkdown(section)
        } catch (error) {
          problems.push({
            page: `rules/${rule.id} (${lang})`,
            check: 'content',
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
  }

  const report = sampleReport(tools)
  for (const lang of LANGS) {
    const label = `report (${lang})`
    const html = renderReportPage(report, lang)
    pages.push({ page: label, file: `report.${lang}.html`, html })
    for (const found of auditReportPage(html, lang)) problems.push({ page: label, ...found })
  }
  return { pages, problems }
}

/**
 * A report to render the report template with: a real evaluation of the first HTML example on a
 * tool page that the tool fails, not made-up findings.
 */
export function sampleReport(tools: readonly Tool[] = TOOLS): Report {
  const tool = tools.find((candidate) => candidate.copy.ar.example.wrong.lang === 'html')
  if (tool === undefined)
    throw new Error('No tool has an HTML example to build a sample report from')
  const url = 'https://example.com/'
  const contentType = 'text/html; charset=utf-8'
  const page = collectPage({
    url,
    status: 200,
    headers: [['content-type', contentType]],
    body: new TextEncoder().encode(tool.copy.ar.example.wrong.code),
  })
  const { results, findings } = evaluatePage(page, {
    rules: RULES.filter((rule) => !rule.needs.includes('robots')),
  })
  return Report.parse({
    schemaVersion: SCHEMA_VERSION,
    generator: { name: 'arablyzer', version: ENGINE_VERSION, rulesetVersion: RULESET_VERSION },
    target: {
      url,
      finalUrl: url,
      fetchedAt: `${tool.updated}T00:00:00.000Z`,
      userAgent: USER_AGENT,
      http: { status: 200, contentType, redirects: [] },
    },
    scan: {
      status: results.some((result) => result.status === 'error') ? 'partial' : 'complete',
      durationMs: 0,
      notices: [],
    },
    page: pageSummary(page),
    summary: summarize(results),
    score: scoreOf(results, RULES.length),
    rules: results,
    findings,
    facts: {},
  })
}
