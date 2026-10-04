/**
 * What the Arabic-native tools ask of other services (docs/design/plans/arabic-native.md §9 to
 * §14): look-alike domains, linked PDFs, search suggestions, AI assistants' answers and Chrome UX
 * data by country. Plain data, so a rule judges it without a network.
 */

export type LookalikeKind =
  | 'tld'
  | 'arabizi'
  | 'omission'
  | 'doubling'
  | 'transposition'
  | 'neighbour'
  | 'hyphen'
  | 'confusable'

export interface LookalikeFound {
  readonly domain: string
  readonly kind: LookalikeKind
  /** The name has an A or AAAA record. */
  readonly address: boolean
  /** The name has an MX record, so it can receive (and be used to send) mail. */
  readonly mail: boolean
  /** The earliest certificate Certificate Transparency lists for the name (ISO date); null for none or unknown. */
  readonly firstSeen: string | null
  /** The certificates Certificate Transparency lists for it; null where the log was not asked. */
  readonly certificates: number | null
  /** The first certificate is not older than 90 days. */
  readonly recent: boolean
}

/**
 * `checked`: the look-alikes were generated and DNS answered. `failed`: no lookup got an answer,
 * so nothing is known. `ct` says whether Certificate Transparency was asked for the names that
 * resolve: `partial` after a limit or a failure, `unavailable` when it never answered.
 */
export type LookalikeFacts =
  | {
      readonly outcome: 'checked'
      readonly domain: string
      /** Candidates generated (at most 100). */
      readonly candidates: number
      /** Candidates whose A and MX records were asked for. */
      readonly asked: number
      readonly found: readonly LookalikeFound[]
      readonly ct: 'checked' | 'partial' | 'unavailable'
    }
  | { readonly outcome: 'failed'; readonly domain: string; readonly candidates: number }

export type PdfIssueKind =
  | 'reversed'
  | 'presentation-forms'
  | 'no-unicode-map'
  | 'image-only'
  | 'no-title'
  | 'no-language'

export interface PdfIssue {
  readonly kind: PdfIssueKind
  /** A share (0 to 1) or a count, by kind; 0 where there is no measure. */
  readonly measure: number
  /** A word or characters that show it, at most 40 characters; '' where there is none. */
  readonly example: string
}

export type PdfOutcome =
  | 'read'
  | 'robots'
  | 'too-large'
  | 'not-pdf'
  | 'encrypted'
  | 'unreadable'
  | 'failed'

export interface PdfFile {
  readonly url: string
  readonly outcome: PdfOutcome
  readonly bytes: number
  readonly pages: number
  readonly pagesRead: number
  readonly title: string | null
  readonly language: string | null
  readonly issues: readonly PdfIssue[]
}

/** The PDFs the page links (up to 3 are fetched): `linked` counts every distinct PDF link. */
export interface PdfFacts {
  readonly outcome: 'checked'
  readonly linked: number
  readonly files: readonly PdfFile[]
}

/**
 * What the tools that ask other services collected, each under the key of its collector. A key is
 * missing where the feature was not asked for (not named by the scan, or off without its key).
 */
export interface OutsideFacts {
  readonly lookalikes?: LookalikeFacts
  readonly pdfs?: PdfFacts
}
