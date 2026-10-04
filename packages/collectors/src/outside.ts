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
  'reversed' | 'presentation-forms' | 'no-unicode-map' | 'image-only' | 'no-title' | 'no-language'

export interface PdfIssue {
  readonly kind: PdfIssueKind
  /** A share (0 to 1) or a count, by kind; 0 where there is no measure. */
  readonly measure: number
  /** A word or characters that show it, at most 40 characters; '' where there is none. */
  readonly example: string
}

export type PdfOutcome =
  'read' | 'robots' | 'too-large' | 'not-pdf' | 'encrypted' | 'unreadable' | 'failed'

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

export type SpellingKind = 'ta-marbuta' | 'hamza' | 'ya' | 'arabizi' | 'drop' | 'swap'

export interface SuggestVariant {
  readonly text: string
  readonly kind: SpellingKind
  /** Google's suggestions show people type it; null where it was not asked (the budget ran out). */
  readonly typed: boolean | null
  /** The first suggestion that starts with the variant; null for none. */
  readonly suggestion: string | null
  /** The page writes the variant as a word. */
  readonly covered: boolean
}

export interface SuggestTerm {
  readonly term: string
  /** The page writes the term itself. */
  readonly written: boolean
  readonly variants: readonly SuggestVariant[]
}

/**
 * Google's suggestions for the misspellings of the page's key terms (docs/design/plans/
 * arabic-native.md §12). `no-terms`: the page has no Arabic word to make misspellings of. `stopped`:
 * Google stopped answering before the budget was spent, so later variants were not asked.
 */
export type SuggestFacts =
  | {
      readonly outcome: 'checked'
      readonly calls: number
      readonly stopped: boolean
      readonly terms: readonly SuggestTerm[]
    }
  | { readonly outcome: 'no-terms' }
  | { readonly outcome: 'failed' }

export type AiProviderId = 'openai' | 'gemini' | 'perplexity' | 'anthropic'

/** What one assistant said to one question, reduced to what the report keeps: no answer text. */
export interface AiAnswer {
  readonly question: string
  readonly status: 'answered' | 'failed'
  /** The brand's name or the site's domain is in the answer's text or its citations. */
  readonly mentioned: boolean
  /** The site's domain is among the answer's cited URLs. */
  readonly cited: boolean
  readonly citations: readonly string[]
  /** Registrable domains cited other than the site's. */
  readonly competitors: readonly string[]
}

export interface AiProviderResult {
  readonly provider: AiProviderId
  readonly model: string
  /** `refused`: the key was not accepted; `limited`: the provider asked us to slow down. */
  readonly status: 'ok' | 'refused' | 'limited' | 'failed'
  readonly answers: readonly AiAnswer[]
}

/**
 * Whether the AI assistants with a key mention or cite the site, for questions in Arabic made
 * from the page (docs/design/plans/arabic-native.md §13). Nothing the assistants wrote is kept.
 */
export type AiVisibilityFacts =
  | {
      readonly outcome: 'checked'
      readonly brand: string | null
      readonly domain: string
      readonly questions: readonly string[]
      readonly providers: readonly AiProviderResult[]
      /** Requests made (not counting those answered from the cache). */
      readonly calls: number
    }
  | { readonly outcome: 'no-questions' }
  | {
      readonly outcome: 'failed'
      /** How each provider with a key ended: a refused key is told apart from a timeout. */
      readonly statuses: readonly {
        readonly provider: AiProviderId
        readonly status: AiProviderResult['status']
      }[]
    }

/**
 * What the tools that ask other services collected, each under the key of its collector. A key is
 * missing where the feature was not asked for (not named by the scan, or off without its key).
 */
export interface OutsideFacts {
  readonly lookalikes?: LookalikeFacts
  readonly pdfs?: PdfFacts
  readonly suggest?: SuggestFacts
  readonly aiVisibility?: AiVisibilityFacts
}
