import { GUIDES_UI, KNOWLEDGE_UI, TOOLS_UI } from '@arablyzer/i18n'
import type { KnowledgeType } from '@arablyzer/i18n/knowledge'
import { localePath, PATHS, type Lang } from '@arablyzer/seo/site'
import { GUIDE_STATUS_DOT, GUIDES_DATA } from './guide-data'
import type { KnowledgeItem } from './knowledge-search'
import { LIBRARY_DATA, rulesByCategory } from './rule-data'
import { ARABIC_LAYER, CATEGORY_STYLE, TOOLS_DATA, toolsByCategory } from './tool-data'

// The knowledge hub's index (M2.6 R5), built from the registries at build time: every tool, rule,
// fix guide and glossary term, in the page's language, each with the other language's title for
// a search to read. It is read by the hub's page, which renders the lists from it and hands it to
// the search island; the island holds none of the registries (lib/knowledge-search.ts).

export interface KnowledgeIndex {
  readonly items: readonly KnowledgeItem[]
  /** The classes of the tags' dots: an item's `tone` is an index into them. */
  readonly tones: readonly string[]
  /** How many pages of each kind, which the tiles and the chips show. */
  readonly totals: Readonly<Record<KnowledgeType, number>>
}

/**
 * How many pages of each kind the registries hold: what the hub's tiles and the directories' side
 * lists say. Read from the registries, so a directory's own count cannot drift from the hub's.
 */
export function knowledgeTotals(): Readonly<Record<KnowledgeType, number>> {
  return {
    tool: TOOLS_DATA.tools.length,
    rule: LIBRARY_DATA.rules.length,
    fix: GUIDES_DATA.fix.length,
    term: GUIDES_DATA.glossary.length,
  }
}

export function knowledgeIndex(lang: Lang): KnowledgeIndex {
  const other = lang === 'ar' ? 'en' : 'ar'
  const categories = TOOLS_UI[lang].categories
  const groups = GUIDES_UI[lang].fix.groups
  const tones: string[] = []
  const toneOf = (dot: string): number => {
    const known = tones.indexOf(dot)
    if (known !== -1) return known
    tones.push(dot)
    return tones.length - 1
  }

  // The tools in the directory's order: the Arabic layer first, then the rest.
  const toolGroups = toolsByCategory()
  const tools = [
    ...toolGroups.filter((group) => ARABIC_LAYER.has(group.category)),
    ...toolGroups.filter((group) => !ARABIC_LAYER.has(group.category)),
  ].flatMap((group) =>
    group.tools.map((tool): KnowledgeItem => ({
      type: 'tool',
      href: localePath(lang, PATHS.tool(tool.slug)),
      title: tool.copy[lang].title,
      text: tool.copy[lang].summary,
      tag: categories[group.category].name,
      tone: toneOf(CATEGORY_STYLE[group.category].dot),
      alt: tool.copy[other].title,
      id: tool.slug,
    })),
  )

  const rules = rulesByCategory().flatMap((group) =>
    group.rules.map((rule): KnowledgeItem => ({
      type: 'rule',
      href: localePath(lang, PATHS.rule(rule.id)),
      title: rule.copy[lang].title,
      // With its code in backticks: a rule that quotes the example it judges has it as code.
      text: rule.copy[lang].summary,
      severity: rule.severity,
      tag: categories[group.category].name,
      tone: toneOf(CATEGORY_STYLE[group.category].dot),
      alt: rule.copy[other].title,
      id: rule.id,
    })),
  )

  // A guide is found by the message as Search Console shows it, in either language.
  const fix = GUIDES_DATA.fix.map((guide): KnowledgeItem => ({
    type: 'fix',
    href: localePath(lang, PATHS.fixGuide(guide.slug)),
    title: guide.message[lang],
    text: guide.copy[lang].description,
    tag: groups[guide.status],
    tone: toneOf(GUIDE_STATUS_DOT[guide.status]),
    alt: guide.message[other],
    id: guide.slug,
  }))

  // The glossary in the order of its names in the page's language, as its own page lists it.
  const terms = [...GUIDES_DATA.glossary]
    .sort((a, b) => a.copy[lang].title.localeCompare(b.copy[lang].title, lang))
    .map((term): KnowledgeItem => ({
      type: 'term',
      href: localePath(lang, PATHS.term(term.slug)),
      title: term.copy[lang].title,
      text: term.copy[lang].description,
      tag: KNOWLEDGE_UI[lang].termTag,
      tone: -1,
      // The term as developers write it is part of what is searched, whatever the language.
      alt: `${term.copy[other].title} ${term.term}`,
      id: term.slug,
    }))

  return {
    items: [...tools, ...rules, ...fix, ...terms],
    tones,
    totals: { tool: tools.length, rule: rules.length, fix: fix.length, term: terms.length },
  }
}
