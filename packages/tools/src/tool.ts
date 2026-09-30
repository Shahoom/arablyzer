import { loadToolCopy, type ToolCopy } from './copy'

/** The categories of the toolbox table (BUILD-PLAN §5.1), in its order. */
export const TOOL_CATEGORIES = [
  'crawl',
  'index',
  'onpage',
  'links',
  'schema',
  'intl',
  'seo-tools',
  'search-data',
  'speed',
  'commerce',
  'ai',
  'trust',
  'ar-render',
  'rtl',
  'ar-content',
  'forms',
  'locale',
  'general',
] as const

export type ToolCategory = (typeof TOOL_CATEGORIES)[number]

/** BUILD-PLAN §9 and §10: a tool is a set of rules plus its page. */
export interface Tool {
  /** ASCII kebab-case and stable once published: /tools/<slug> and /en/tools/<slug> (§5.1). */
  readonly slug: string
  readonly category: ToolCategory
  /** The rules the tool runs, by id, in the order the page lists them. */
  readonly rules: readonly string[]
  /** Adjacent tools the page links to, by slug. */
  readonly related: readonly string[]
  /** YYYY-MM-DD: the page's "last updated" (§6.1). */
  readonly updated: string
  readonly copy: { readonly ar: ToolCopy; readonly en: ToolCopy }
}

export type ToolDefinition = Omit<Tool, 'copy'>

/** Attaches the tool's copy from tools/<slug>/copy.{ar,en}.md. */
export function defineTool(definition: ToolDefinition): Tool {
  return { ...definition, copy: loadToolCopy(definition.slug) }
}
