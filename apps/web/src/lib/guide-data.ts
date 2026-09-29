import type { Lang } from '@arablyzer/seo/site'
import raw from '../generated/guides.json'

// The /fix guides and the glossary (BUILD-PLAN §6.3, M2.4d) as their pages need them, from
// src/generated/guides.json, which scripts/generate.ts writes before Astro runs: their copy is
// Markdown that Astro's build cannot read itself.

/** A page's copy in one language, its Markdown rendered to HTML. */
export interface DocCopyData {
  readonly title: string
  /** Plain text: the meta description and the line under the H1. */
  readonly description: string
  /** HTML of each section present, by its key, in order. */
  readonly sections: readonly {
    readonly key: string
    readonly title: string
    readonly html: string
  }[]
  /** The question as inline HTML, the answer as HTML. */
  readonly faq: readonly { readonly question: string; readonly answer: string }[]
}

export interface FixGuideData {
  readonly slug: string
  readonly status: 'not-indexed' | 'warning'
  readonly message: Readonly<Record<Lang, string>>
  readonly tools: readonly string[]
  readonly rules: readonly string[]
  readonly related: readonly string[]
  readonly updated: string
  readonly copy: Readonly<Record<Lang, DocCopyData>>
}

export interface TermData {
  readonly slug: string
  readonly term: string
  readonly tools: readonly string[]
  readonly rules: readonly string[]
  readonly guides: readonly string[]
  readonly related: readonly string[]
  readonly updated: string
  readonly copy: Readonly<Record<Lang, DocCopyData>>
}

export interface GuidesData {
  readonly fix: readonly FixGuideData[]
  readonly glossary: readonly TermData[]
}

export const GUIDES_DATA = raw as GuidesData

export function fixGuideData(slug: string): FixGuideData {
  const guide = GUIDES_DATA.fix.find((candidate) => candidate.slug === slug)
  if (guide === undefined) throw new Error(`There is no guide ${slug}`)
  return guide
}

export function termData(slug: string): TermData {
  const term = GUIDES_DATA.glossary.find((candidate) => candidate.slug === slug)
  if (term === undefined) throw new Error(`There is no term ${slug}`)
  return term
}
