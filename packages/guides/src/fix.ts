import { readFileSync } from 'node:fs'
import { KEBAB_ID } from '@arablyzer/report-schema'
import { parseDocument, type DocumentCopy, type DocumentSchema, type Lang } from './document'

// The /fix guides (BUILD-PLAN §6.3): one per message Search Console or Merchant Center shows, in
// Arabic, titled with the message as the report shows it, since people paste it into a search.

export type FixSection = 'meaning' | 'causes' | 'fix' | 'verify' | 'faq' | 'references'

export const FIX_SCHEMA: DocumentSchema<FixSection> = {
  headings: {
    ar: {
      meaning: 'ماذا تعني',
      causes: 'لماذا تظهر',
      fix: 'كيف تُصلح',
      verify: 'كيف تتحقق من الإصلاح',
      faq: 'أسئلة شائعة',
      references: 'المراجع',
    },
    en: {
      meaning: 'What it means',
      causes: 'Why it shows',
      fix: 'How to fix',
      verify: 'How to check the fix',
      faq: 'FAQ',
      references: 'References',
    },
  },
  order: ['meaning', 'causes', 'fix', 'verify', 'faq', 'references'],
  required: ['meaning', 'causes', 'fix', 'verify', 'faq', 'references'],
  faq: 'faq',
}

/** Where a message comes from: the report that shows it (Google's documentation names both). */
export type FixSource = 'search-console'

export interface FixGuideDefinition {
  /** ASCII kebab-case, from the English message: crawled-currently-not-indexed. */
  readonly slug: string
  readonly source: FixSource
  /** The report that shows it, and its group there: a page not indexed, or indexed with a warning. */
  readonly report: 'page-indexing'
  readonly status: 'not-indexed' | 'warning'
  /** The message exactly as Google's documentation of the report writes it, in each language. */
  readonly message: Readonly<Record<Lang, string>>
  /** Arablyzer's tools and rules that check what the message is about. */
  readonly tools: readonly string[]
  readonly rules: readonly string[]
  /** Other guides, by slug. */
  readonly related: readonly string[]
  /** YYYY-MM-DD. */
  readonly updated: string
}

export interface FixGuide extends FixGuideDefinition {
  readonly copy: Readonly<Record<Lang, DocumentCopy<FixSection>>>
}

/** src/fix/, next to this file. */
const FIX_DIR = new URL('./fix/', import.meta.url)

export function defineFixGuide(definition: FixGuideDefinition): FixGuide {
  if (!KEBAB_ID.test(definition.slug)) throw new TypeError(`Invalid guide slug: ${definition.slug}`)
  const load = (lang: Lang) => {
    const file = `${definition.slug}/copy.${lang}.md`
    return parseDocument(
      readFileSync(new URL(file, FIX_DIR), 'utf8'),
      lang,
      `fix/${file}`,
      FIX_SCHEMA,
    )
  }
  return { ...definition, copy: { ar: load('ar'), en: load('en') } }
}
