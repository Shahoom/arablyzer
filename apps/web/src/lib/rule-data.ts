import type { RuleReads } from '@arablyzer/i18n'
import type { Category, Severity } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import raw from '../generated/library.json'
import { ARABIC_LAYER, TOOLS_DATA } from './tool-data'

// The rules as their library pages need them (BUILD-PLAN §6.2, M2.4), from
// src/generated/library.json, which scripts/generate.ts writes before Astro runs: the rules'
// copy is Markdown that Astro's build cannot read itself.

/** A rule's example, highlighted and escaped (src/lib/code.ts). */
export interface RuleExampleData {
  readonly lang: 'html' | 'css' | 'json' | 'robots.txt'
  readonly wrong: string
  readonly right: string
}

/** A rule page's copy in one language, its Markdown rendered to HTML. */
export interface RuleCopyData {
  readonly title: string
  /** Plain text: the first point of why it matters, for the meta description and the cards. */
  readonly description: string
  /**
   * The same first point with its code in backticks (`like this`), for the knowledge hub's rows:
   * a rule that quotes the example it judges has it as code, which the site's own rules skip.
   */
  readonly summary: string
  readonly why: string
  readonly fix: string
  readonly detect: string
  readonly references: string
}

export interface RuleData {
  readonly id: string
  readonly version: string
  readonly category: Category
  readonly severity: Severity
  /** Needs a person's review: reported, never deducted. */
  readonly manual: boolean
  readonly wcag: readonly string[]
  readonly reads: RuleReads
  /** What a failure costs in the score (packages/scoring): 0 for information and review. */
  readonly weight: number
  /** Null for a rule whose fixtures hold no code a page could show (packages/rules). */
  readonly example: RuleExampleData | null
  /** The tools that run it, by slug. */
  readonly tools: readonly string[]
  /** Rules of its category, by id. */
  readonly near: readonly string[]
  readonly copy: Readonly<Record<Lang, RuleCopyData>>
}

/** A rule page's section headings, as its copy files name them (packages/rules). */
export interface RuleHeadings {
  readonly why: string
  readonly fix: string
  readonly detect: string
  readonly references: string
}

export interface LibraryData {
  /** What a failed rule of each severity costs (packages/scoring). */
  readonly weights: {
    readonly critical: number
    readonly serious: number
    readonly moderate: number
    readonly minor: number
  }
  readonly headings: Readonly<Record<Lang, RuleHeadings>>
  /** Every rule, sorted by id. */
  readonly rules: readonly RuleData[]
}

export const LIBRARY_DATA = raw as LibraryData

export function ruleData(id: string): RuleData {
  const rule = LIBRARY_DATA.rules.find((candidate) => candidate.id === id)
  if (rule === undefined) throw new Error(`There is no rule ${id}`)
  return rule
}

/**
 * The categories that have rules, each with its rules, in the directory's order: the Arabic
 * layer first, then the rest, each in the order of the toolbox's table (BUILD-PLAN §5.1).
 */
export function rulesByCategory(): { category: Category; rules: RuleData[] }[] {
  const groups = TOOLS_DATA.categories
    .map((category) => ({
      category: category as Category,
      rules: LIBRARY_DATA.rules.filter((rule) => rule.category === category),
    }))
    .filter((group) => group.rules.length > 0)
  return [
    ...groups.filter((group) => ARABIC_LAYER.has(group.category)),
    ...groups.filter((group) => !ARABIC_LAYER.has(group.category)),
  ]
}
