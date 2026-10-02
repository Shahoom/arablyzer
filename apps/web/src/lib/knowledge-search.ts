import type { KnowledgeType } from '@arablyzer/i18n/knowledge'
import type { Severity } from '@arablyzer/report-schema'
import { matchesAll, searchable, searchWords } from './search'

// The knowledge hub's index as the search island reads it (M2.6 R5), and the search itself. This
// file is bundled into the page's script, so it holds no data of the site: lib/knowledge.ts
// builds the index from the registries at build time, and the page hands it to the island.

/** The kinds of page the hub lists, in the order of its groups. */
export const KNOWLEDGE_TYPES: readonly KnowledgeType[] = ['tool', 'rule', 'fix', 'term']

/** The chips' choices: every kind, or one. */
export type TypeFilter = 'all' | KnowledgeType

/** One page the hub lists. */
export interface KnowledgeItem {
  readonly type: KnowledgeType
  /** Where it is, in the page's language. */
  readonly href: string
  readonly title: string
  /** A line or two: what a tool checks, why a rule matters, what a message or a term means. */
  readonly text: string
  /** A rule's severity, which its row shows as a pill. */
  readonly severity?: Severity
  /** Its category (a tool's, a rule's), the group of a guide, or «مصطلح» for a term. */
  readonly tag: string
  /** The tag's dot, as an index into the colours the page sends with the index; -1 for none. */
  readonly tone: number
  /** The title in the other language, which a search reads too. */
  readonly alt: string
  /** The slug or the rule's id, which a search reads too: `robots-blocks-googlebot`. */
  readonly id: string
}

/** An item with what a search reads of it, written as people type Arabic (lib/search.ts). */
export interface Indexed {
  readonly item: KnowledgeItem
  /** Its names: the title in both languages, and the id. A match here is the best match. */
  readonly name: string
  /** The rest: the line of text, the tag and the severity's name. */
  readonly rest: string
}

/** Written once, when the page loads: a search then only compares. */
export function indexItems(
  items: readonly KnowledgeItem[],
  severityName: (severity: Severity) => string,
): Indexed[] {
  return items.map((item) => ({
    item,
    name: searchable(`${item.title} ${item.alt} ${item.id}`),
    // A line of text may quote code in backticks, which are not part of what is searched.
    rest: searchable(
      `${item.text.replaceAll('`', '')} ${item.tag} ${item.severity === undefined ? '' : severityName(item.severity)}`,
    ),
  }))
}

/**
 * The items that have every word typed, in the index's order, those whose names have them all
 * first: «robots» finds the checker named so before the rule that only mentions it. Nothing
 * typed finds everything.
 */
export function search(index: readonly Indexed[], typed: string): KnowledgeItem[] {
  const words = searchWords(typed)
  if (words.length === 0) return index.map((entry) => entry.item)
  const named: KnowledgeItem[] = []
  const mentioned: KnowledgeItem[] = []
  for (const { item, name, rest } of index) {
    if (matchesAll(name, words)) named.push(item)
    else if (matchesAll(`${name} ${rest}`, words)) mentioned.push(item)
  }
  return [...named, ...mentioned]
}

/** How many of the matches each chip stands for, and all of them. */
export function countByType(matches: readonly KnowledgeItem[]): Record<TypeFilter, number> {
  const counts: Record<TypeFilter, number> = {
    all: matches.length,
    tool: 0,
    rule: 0,
    fix: 0,
    term: 0,
  }
  for (const match of matches) counts[match.type]++
  return counts
}

export interface Group {
  readonly type: KnowledgeType
  readonly items: readonly KnowledgeItem[]
}

/** The matches of the chosen kind, or of every kind, grouped as the page groups them. */
export function groupsOf(matches: readonly KnowledgeItem[], filter: TypeFilter): Group[] {
  return KNOWLEDGE_TYPES.filter((type) => filter === 'all' || filter === type)
    .map((type) => ({ type, items: matches.filter((match) => match.type === type) }))
    .filter((group) => group.items.length > 0)
}

/** A chip's kind from the address's `type`, or none for a value that is no kind. */
export function typeFilterOf(value: string | null): TypeFilter {
  return KNOWLEDGE_TYPES.find((type) => type === value) ?? 'all'
}

/**
 * Each kind's tile, in the colours of the categories it is nearest to (global.css): the icon box
 * of its group's heading in the results, and of its tile among the browse tiles. Written out in
 * full, for Tailwind to find.
 */
export const TYPE_TILE: Readonly<Record<KnowledgeType, string>> = {
  tool: 'bg-cat-render-soft text-cat-render',
  rule: 'bg-indigo-soft text-indigo-ink',
  fix: 'bg-serious-soft text-serious',
  term: 'bg-cat-rtl-soft text-cat-rtl',
}
