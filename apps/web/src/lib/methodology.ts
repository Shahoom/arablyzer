import type { Lang } from '@arablyzer/seo/site'
import raw from '../generated/methodology.json'

// The methodology page, from docs/methodology.md (scripts/methodology.ts): the Arabic at
// /methodology and the English at /en/methodology, one source for the repository and the site.

export interface MethodologyPart {
  readonly title: string
  /** HTML. */
  readonly html: string
}

export interface MethodologySection extends MethodologyPart {
  /** The same in both languages, from the English heading: /methodology#the-score. */
  readonly id: string
  /** Its ### parts, each with its heading. */
  readonly parts: readonly MethodologyPart[]
}

export interface MethodologyDoc {
  readonly title: string
  /** Plain text: the first paragraph, which the page's description is. */
  readonly description: string
  readonly sections: readonly MethodologySection[]
}

export const METHODOLOGY_DATA = raw as Readonly<Record<Lang, MethodologyDoc>>
