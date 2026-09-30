import { readFileSync } from 'node:fs'
import { KEBAB_ID } from '@arablyzer/report-schema'
import { parseDocument, type DocumentCopy, type DocumentSchema, type Lang } from './document'

// The glossary (BUILD-PLAN §6.3): a page per term, in Arabic first, with enough to say about it
// to stand alone; a thin page is worse than none (§6.5).

export type TermSection = 'definition' | 'why' | 'example' | 'mistakes' | 'references'

export const TERM_SCHEMA: DocumentSchema<TermSection> = {
  headings: {
    ar: {
      definition: 'التعريف',
      why: 'لماذا يهم',
      example: 'مثال',
      mistakes: 'أخطاء شائعة',
      references: 'المراجع',
    },
    en: {
      definition: 'Definition',
      why: 'Why it matters',
      example: 'Example',
      mistakes: 'Common mistakes',
      references: 'References',
    },
  },
  order: ['definition', 'why', 'example', 'mistakes', 'references'],
  required: ['definition', 'why', 'example', 'references'],
}

export interface GlossaryTermDefinition {
  /** ASCII kebab-case, from the English term: canonical-url. */
  readonly slug: string
  /** The term in English, as developers and tools write it: it is on both pages. */
  readonly term: string
  readonly tools: readonly string[]
  readonly rules: readonly string[]
  /** /fix guides, by slug. */
  readonly guides: readonly string[]
  /** Other terms, by slug. */
  readonly related: readonly string[]
  /** YYYY-MM-DD. */
  readonly updated: string
}

export interface GlossaryTerm extends GlossaryTermDefinition {
  readonly copy: Readonly<Record<Lang, DocumentCopy<TermSection>>>
}

/** src/glossary/, next to this file. */
const GLOSSARY_DIR = new URL('./glossary/', import.meta.url)

export function defineTerm(definition: GlossaryTermDefinition): GlossaryTerm {
  if (!KEBAB_ID.test(definition.slug)) throw new TypeError(`Invalid term slug: ${definition.slug}`)
  const load = (lang: Lang) => {
    const file = `${definition.slug}/copy.${lang}.md`
    return parseDocument(
      readFileSync(new URL(file, GLOSSARY_DIR), 'utf8'),
      lang,
      `glossary/${file}`,
      TERM_SCHEMA,
    )
  }
  return { ...definition, copy: { ar: load('ar'), en: load('en') } }
}
