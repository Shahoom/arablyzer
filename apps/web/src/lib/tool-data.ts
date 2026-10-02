import type { ToolCategoryName, ToolTag } from '@arablyzer/i18n'
import type { Severity } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import type { ToolKind } from '@arablyzer/tools'
import raw from '../generated/tools.json'

// The tools as their pages need them, from src/generated/tools.json, which scripts/generate.ts
// writes before Astro runs: the tools' copy is Markdown that Astro's build cannot read itself.

/** A rule a tool runs, as its page lists it. */
export interface ToolRuleData {
  readonly id: string
  readonly severity: Severity
  readonly title: Readonly<Record<Lang, string>>
}

/** An example's code, highlighted and escaped (src/lib/code.ts). */
export interface ExampleData {
  readonly lang: 'html' | 'robots.txt' | 'http' | 'dns' | 'json'
  readonly html: string
}

/** A tool page's copy in one language, its Markdown rendered to HTML. */
export interface ToolCopyData {
  readonly title: string
  readonly description: string
  readonly summary: string
  /** Inline HTML, one item each. */
  readonly checks: readonly string[]
  readonly example: { readonly wrong: ExampleData; readonly right: ExampleData }
  readonly fix: string
  /** The question as inline HTML, the answer as HTML. */
  readonly faq: readonly { readonly question: string; readonly answer: string }[]
  readonly methodology: string
}

export interface ToolData {
  readonly slug: string
  readonly category: ToolCategoryName
  readonly rules: readonly ToolRuleData[]
  readonly related: readonly string[]
  /** YYYY-MM-DD. */
  readonly updated: string
  /** A scan runs on the scanner; a paste tool and a generator in the visitor's browser. */
  readonly kind: ToolKind
  /** Whether the tool renders the page in browsers. */
  readonly renders: boolean
  /**
   * Whether every rule of the tool only lists what it finds (information): its result says what it
   * found as notes, and "none found" for a page that shows none.
   */
  readonly reportsOnly: boolean
  readonly tag: ToolTag
  readonly copy: Readonly<Record<Lang, ToolCopyData>>
}

/** A tool page's section headings, as its copy files name them (packages/tools). */
export interface ToolHeadings {
  readonly checks: string
  readonly example: string
  readonly fix: string
  readonly faq: string
  readonly methodology: string
  readonly wrong: string
  readonly right: string
}

export interface ToolsData {
  /** Every category of the §5.1 table, in its order. */
  readonly categories: readonly ToolCategoryName[]
  readonly headings: Readonly<Record<Lang, ToolHeadings>>
  /** Every tool, sorted by slug. */
  readonly tools: readonly ToolData[]
}

/** Each tool's name in both languages, by slug: src/generated/tool-titles.json. */
export type ToolTitles = Readonly<Record<string, Readonly<Record<Lang, string>>>>

export const TOOLS_DATA = raw as ToolsData

export function toolData(slug: string): ToolData {
  const tool = TOOLS_DATA.tools.find((candidate) => candidate.slug === slug)
  if (tool === undefined) throw new Error(`There is no tool ${slug}`)
  return tool
}

/** The categories that have tools, in the table's order, each with its tools. */
export function toolsByCategory(): { category: ToolCategoryName; tools: ToolData[] }[] {
  return TOOLS_DATA.categories
    .map((category) => ({
      category,
      tools: TOOLS_DATA.tools.filter((tool) => tool.category === category),
    }))
    .filter((group) => group.tools.length > 0)
}

/** A category's number in the §5.1 table, as the design writes it: 01 to 18. */
export function categoryNumber(category: ToolCategoryName): string {
  return String(TOOLS_DATA.categories.indexOf(category) + 1).padStart(2, '0')
}

/** The categories BUILD-PLAN §5.1 marks as Arablyzer's own, grouped apart in the directory. */
export const ARABIC_LAYER: ReadonlySet<ToolCategoryName> = new Set([
  'ar-render',
  'rtl',
  'ar-content',
  'forms',
  'locale',
])

/**
 * Each category's colour (the tokens of global.css): its dot, the rule under its heading, and the
 * chip with its number. Written out in full, for Tailwind to find.
 */
export const CATEGORY_STYLE: Readonly<
  Record<ToolCategoryName, { readonly dot: string; readonly line: string; readonly chip: string }>
> = {
  crawl: { dot: 'bg-ink-3', line: 'border-ink-3', chip: 'bg-rule-soft text-ink-2' },
  index: {
    dot: 'bg-cat-index',
    line: 'border-cat-index',
    chip: 'bg-cat-index-soft text-cat-index',
  },
  onpage: { dot: 'bg-ink-2', line: 'border-ink-2', chip: 'bg-rule-soft text-ink-2' },
  links: { dot: 'bg-cat-rtl', line: 'border-cat-rtl', chip: 'bg-cat-rtl-soft text-cat-rtl' },
  schema: {
    dot: 'bg-cat-schema',
    line: 'border-cat-schema',
    chip: 'bg-cat-schema-soft text-cat-schema',
  },
  intl: {
    dot: 'bg-cat-fonts',
    line: 'border-cat-fonts',
    chip: 'bg-cat-fonts-soft text-cat-fonts',
  },
  'seo-tools': { dot: 'bg-ink-3', line: 'border-ink-3', chip: 'bg-rule-soft text-ink-2' },
  'search-data': {
    dot: 'bg-cat-rtl',
    line: 'border-cat-rtl',
    chip: 'bg-cat-rtl-soft text-cat-rtl',
  },
  speed: {
    dot: 'bg-cat-speed',
    line: 'border-cat-speed',
    chip: 'bg-cat-speed-soft text-cat-speed',
  },
  commerce: {
    dot: 'bg-cat-prices',
    line: 'border-cat-prices',
    chip: 'bg-cat-prices-soft text-cat-prices',
  },
  ai: { dot: 'bg-cat-ai', line: 'border-cat-ai', chip: 'bg-cat-ai-soft text-cat-ai' },
  // Trust is the green of a passed check, as the v2 artboards have it.
  trust: { dot: 'bg-pass', line: 'border-pass', chip: 'bg-pass-soft text-pass' },
  'ar-render': {
    dot: 'bg-cat-render',
    line: 'border-cat-render',
    chip: 'bg-cat-render-soft text-cat-render',
  },
  rtl: { dot: 'bg-cat-rtl', line: 'border-cat-rtl', chip: 'bg-cat-rtl-soft text-cat-rtl' },
  'ar-content': {
    dot: 'bg-cat-schema',
    line: 'border-cat-schema',
    chip: 'bg-cat-schema-soft text-cat-schema',
  },
  forms: {
    dot: 'bg-cat-forms',
    line: 'border-cat-forms',
    chip: 'bg-cat-forms-soft text-cat-forms',
  },
  // Locale, like the international category, is cyan.
  locale: {
    dot: 'bg-cat-fonts',
    line: 'border-cat-fonts',
    chip: 'bg-cat-fonts-soft text-cat-fonts',
  },
  general: { dot: 'bg-ink-3', line: 'border-ink-3', chip: 'bg-rule-soft text-ink-2' },
}
