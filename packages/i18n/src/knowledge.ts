import type { Copy } from './copy'
import { arabicCount, englishCount, englishForm, type ArabicForms } from './plural'

/** The four kinds of page the knowledge hub lists. */
export type KnowledgeType = 'tool' | 'rule' | 'fix' | 'term'

/**
 * The knowledge hub (M2.6 R5): one search over the tools, the rules, the fix guides and the
 * glossary, its chips, its results and the tiles that lead to each directory.
 */
export interface KnowledgeStrings {
  readonly meta: { readonly title: string; readonly description: string }
  readonly title: string
  readonly lead: string
  readonly breadcrumb: string
  readonly search: {
    readonly label: string
    readonly placeholder: string
    readonly clear: string
  }
  /** The chips' group: what they sort the results by. */
  readonly typesLabel: string
  /** The chips, and the headings of the groups of results. */
  readonly types: Readonly<Record<'all' | KnowledgeType, string>>
  /** A glossary term's tag in a row of results: a term has no category. */
  readonly termTag: string
  /** The link at the end of a group's heading, to the page of all of them. */
  readonly viewAll: Readonly<Record<KnowledgeType, string>>
  /** What a screen reader is told when the results change: «19 نتيجة». */
  readonly status: (count: number) => string
  /** When nothing matches; `{query}` stands for the words typed. */
  readonly none: { readonly title: string; readonly hint: string }
  readonly browse: {
    readonly label: string
    /** What follows the number on a tile, in the form the number takes. */
    readonly tiles: Readonly<Record<KnowledgeType, (count: number) => string>>
  }
}

// What follows the big number on a tile: the noun alone, since the number is drawn beside it.
const TOOLS: ArabicForms = { one: 'أداة', two: 'أداتان', few: 'أدوات', many: 'أداة' }
const RULES: ArabicForms = {
  one: 'قاعدة نفحص بها',
  two: 'قاعدتان نفحص بهما',
  few: 'قواعد نفحص بها',
  many: 'قاعدة نفحص بها',
}
const GUIDES: ArabicForms = {
  one: 'دليل لإصلاح رسائل Search Console',
  two: 'دليلان لإصلاح رسائل Search Console',
  few: 'أدلة لإصلاح رسائل Search Console',
  many: 'دليلاً لإصلاح رسائل Search Console',
  other: 'دليل لإصلاح رسائل Search Console',
}
const TERMS: ArabicForms = {
  one: 'مصطلح',
  two: 'مصطلحان',
  few: 'مصطلحات',
  many: 'مصطلحاً',
  other: 'مصطلح',
}
/** Results, as a count on its own: «نتيجة واحدة»، «3 نتائج»، «19 نتيجة». */
const RESULTS: ArabicForms = {
  one: 'نتيجة واحدة',
  two: 'نتيجتان',
  few: '{n} نتائج',
  many: '{n} نتيجة',
}

export const KNOWLEDGE_UI: Copy<KnowledgeStrings> = {
  reviewed: false,
  ar: {
    meta: {
      title: 'المعرفة: القواعد والأدوات والمصطلحات في بحث واحد — Arablyzer',
      description:
        'ابحث في كل قواعد Arablyzer وأدواته وأدلة إصلاح رسائل Search Console ومعنى كل مصطلح من مصطلحات SEO والويب، بالعربية والإنجليزية.',
    },
    title: 'المعرفة',
    lead: 'كل قاعدة نفحص بها، وكل أداة، وأدلة إصلاح رسائل Search Console، ومعنى كل مصطلح، في بحث واحد.',
    breadcrumb: 'مسار الصفحة',
    search: {
      label: 'ابحث في المعرفة',
      placeholder: 'ابحث عن قاعدة أو أداة أو مصطلح',
      clear: 'امسح البحث',
    },
    typesLabel: 'نوع النتائج',
    types: {
      all: 'الكل',
      tool: 'الأدوات',
      rule: 'القواعد',
      fix: 'إصلاح Search Console',
      term: 'المصطلحات',
    },
    termTag: 'مصطلح',
    viewAll: {
      tool: 'كل الأدوات',
      rule: 'مكتبة القواعد',
      fix: 'كل أدلة الإصلاح',
      term: 'المسرد كاملاً',
    },
    status: (count) => (count === 0 ? 'لا نتائج' : arabicCount(count, RESULTS)),
    none: {
      title: 'لا نتائج لـ«{query}»',
      hint: 'جرّب كلمة أقصر، أو اكتبها بلا تشكيل، أو تصفّح الأقسام أدناه.',
    },
    browse: {
      label: 'تصفّح كل شيء',
      tiles: {
        tool: (count) => arabicCount(count, TOOLS),
        rule: (count) => arabicCount(count, RULES),
        fix: (count) => arabicCount(count, GUIDES),
        term: (count) => arabicCount(count, TERMS),
      },
    },
  },
  en: {
    meta: {
      title: 'Knowledge: rules, tools and terms in one search — Arablyzer',
      description:
        'Search every Arablyzer rule and tool, the fix guides for Search Console messages, and the meaning of every SEO and web term, in Arabic and English.',
    },
    title: 'Knowledge',
    lead: 'Every rule we check with, every tool, the fix guides for Search Console messages, and the meaning of every term, in one search.',
    breadcrumb: 'Breadcrumb',
    search: {
      label: 'Search the knowledge',
      placeholder: 'Search for a rule, a tool or a term',
      clear: 'Clear the search',
    },
    typesLabel: 'Type of result',
    types: {
      all: 'All',
      tool: 'Tools',
      rule: 'Rules',
      fix: 'Search Console fixes',
      term: 'Glossary',
    },
    termTag: 'Term',
    viewAll: {
      tool: 'All tools',
      rule: 'The rule library',
      fix: 'All fix guides',
      term: 'The whole glossary',
    },
    status: (count) => (count === 0 ? 'No results' : englishCount(count, 'result', 'results')),
    none: {
      title: 'No results for “{query}”',
      hint: 'Try a shorter word, or browse the sections below.',
    },
    browse: {
      label: 'Browse everything',
      tiles: {
        tool: (count) => englishForm(count, 'tool', 'tools'),
        rule: (count) => `${englishForm(count, 'rule', 'rules')} we check with`,
        fix: (count) =>
          `${englishForm(count, 'fix guide', 'fix guides')} for Search Console messages`,
        term: (count) => englishForm(count, 'glossary term', 'glossary terms'),
      },
    },
  },
}
