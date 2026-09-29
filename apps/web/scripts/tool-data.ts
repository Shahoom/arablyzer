import type { ToolTag } from '@arablyzer/i18n'
import { ruleById, SERVER_RESPONSE_RULES } from '@arablyzer/rules'
import { renderInline, renderMarkdown } from '@arablyzer/seo/markdown'
import { TOOL_CATEGORIES, TOOL_HEADINGS, TOOLS, type Tool, type ToolCopy } from '@arablyzer/tools'
import { highlight } from '../src/lib/code'
import { fixHtml } from '../src/lib/fix-html'
import type { ToolCopyData, ToolData, ToolsData, ToolTitles } from '../src/lib/tool-data'

// The tools as their pages need them (M2.2), for src/generated/tools.json: generate.ts writes it.

const rulesOf = (tool: Tool) =>
  tool.rules.map((id) => {
    const rule = ruleById(id)
    if (rule === undefined) throw new Error(`${tool.slug}: unknown rule ${id}`)
    return rule
  })

/** Whether the tool renders the page in browsers: its scan takes longer, and says so. */
export function toolRenders(tool: Tool): boolean {
  return rulesOf(tool).some((rule) => rule.needs.includes('render'))
}

/**
 * What the tool reads, for its card: browsers, Chrome's data, the sitemaps, robots.txt, the
 * server's response, or the page's HTML.
 */
export function toolTag(tool: Tool): ToolTag {
  const needs = rulesOf(tool).flatMap((rule) => rule.needs)
  if (needs.includes('render')) return 'render'
  if (needs.includes('crux')) return 'crux'
  if (needs.includes('sitemap')) return 'sitemap'
  if (needs.length > 0 && needs.every((need) => need === 'robots')) return 'robots'
  if (rulesOf(tool).every((rule) => SERVER_RESPONSE_RULES.has(rule.id))) return 'http'
  return 'html'
}

function copyData(copy: ToolCopy): ToolCopyData {
  return {
    title: copy.title,
    description: copy.description,
    summary: copy.summary,
    checks: copy.checks.map((item) => renderInline(item)),
    example: {
      wrong: {
        lang: copy.example.wrong.lang,
        html: highlight(copy.example.wrong.code, copy.example.wrong.lang, 'wrong'),
      },
      right: {
        lang: copy.example.right.lang,
        html: highlight(copy.example.right.code, copy.example.right.lang, 'right'),
      },
    },
    fix: fixHtml(renderMarkdown(copy.fix)),
    faq: copy.faq.map((entry) => ({
      question: renderInline(entry.question),
      answer: fixHtml(renderMarkdown(entry.answer)),
    })),
    methodology: fixHtml(renderMarkdown(copy.methodology)),
  }
}

export function toolsData(): ToolsData {
  return {
    categories: [...TOOL_CATEGORIES],
    headings: TOOL_HEADINGS,
    tools: TOOLS.map((tool): ToolData => ({
      slug: tool.slug,
      category: tool.category,
      rules: rulesOf(tool).map((rule) => ({
        id: rule.id,
        severity: rule.severity,
        title: { ar: rule.copy.ar.title, en: rule.copy.en.title },
      })),
      related: [...tool.related],
      updated: tool.updated,
      renders: toolRenders(tool),
      tag: toolTag(tool),
      copy: { ar: copyData(tool.copy.ar), en: copyData(tool.copy.en) },
    })),
  }
}

/**
 * Each tool's name in both languages, for src/generated/tool-titles.json: the report page names
 * a tool's result's tool, and its island cannot read the tools' copy.
 */
export function toolTitles(data: ToolsData): ToolTitles {
  return Object.fromEntries(
    data.tools.map((tool) => [tool.slug, { ar: tool.copy.ar.title, en: tool.copy.en.title }]),
  )
}
