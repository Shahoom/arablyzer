/**
 * Facts from a page rendered in a browser (docs/design/plans/m1.1-browser.md §4). The browser
 * package measures them; rules read them. All lengths are CSS pixels, rounded to whole pixels.
 */

/** The engines of BUILD-PLAN §5.3. */
export type Engine = 'chromium' | 'firefox' | 'webkit'

export const ENGINES: readonly Engine[] = ['chromium', 'firefox', 'webkit']

/** Relative to the top left of the page, not of the viewport. */
export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface RenderedElement {
  readonly selector: string
  readonly box: Box
}

/** An element whose own text has Arabic letters, as the engine laid it out. */
export interface ArabicTextBlock extends RenderedElement {
  /** The element's own text, whitespace collapsed and bounded. */
  readonly text: string
  /** Computed letter-spacing; 0 for `normal`. */
  readonly letterSpacing: number
  /** Whether that letter-spacing changed the width of the text in this engine; null when it is 0. */
  readonly letterSpacingApplied: boolean | null
  /** Computed font-family, as the engine serializes it. */
  readonly fontFamily: string
  /** Its first family, unquoted. */
  readonly primaryFamily: string
}

/** A face from document.fonts: the page's @font-face rules and fonts added by script. */
export interface FontFaceFact {
  readonly family: string
  readonly status: 'unloaded' | 'loading' | 'loaded' | 'error'
  readonly weight: string
  readonly style: string
  readonly unicodeRange: string
}

/** A font file request and how it ended. */
export interface FontRequestFact {
  readonly url: string
  /** The HTTP status; null when the request failed or the egress proxy refused it. */
  readonly status: number | null
  /** The egress proxy refused it: its failure is Arablyzer's, not the site's. */
  readonly refused: boolean
}

/** The fonts that drew Arabic letters set in one font-family (Chromium reports them). */
export interface UsedFontsFact {
  /** The computed font-family measured. */
  readonly fontFamily: string
  readonly fonts: readonly UsedFont[]
}

export interface UsedFont {
  /** The font's own family name, which may differ from the @font-face name. */
  readonly family: string
  /** A web font rather than one installed on the machine. */
  readonly custom: boolean
  readonly glyphs: number
}

/** A number or a Latin word inside right-to-left text whose characters are drawn out of order. */
export interface BidiTokenFact extends RenderedElement {
  readonly text: string
  readonly kind: 'number' | 'latin'
}

export interface RenderedFacts {
  readonly engine: Engine
  readonly version: string
  /** The URL the browser ended on. */
  readonly url: string
  /** The HTTP status of the page's document. */
  readonly status: number | null
  readonly viewport: { readonly width: number; readonly height: number }
  /**
   * The page's direction: <body>'s, which CSS applies to the whole page, else <html>'s (CSS
   * Writing Modes 3 §8); and <html>'s lang attribute.
   */
  readonly dir: 'ltr' | 'rtl'
  readonly lang: string | null
  /** The viewport meta's content. */
  readonly viewportMeta: string | null
  /** The document's scroll width. */
  readonly scrollWidth: number
  /**
   * Elements that reach past the viewport's end edge (the left one in a right-to-left page), where
   * the page can be scrolled to them (the first 20).
   */
  readonly overflow: readonly RenderedElement[]
  /** Elements whose own text has Arabic letters, in document order (bounded). */
  readonly arabicText: readonly ArabicTextBlock[]
  /** Blocks past the bound, counted only. */
  readonly arabicTextOmitted: number
  readonly fontFaces: readonly FontFaceFact[]
  readonly fontRequests: readonly FontRequestFact[]
  /** Chromium only. */
  readonly usedFonts?: readonly UsedFontsFact[]
  /** Out-of-order tokens (the first 20). */
  readonly bidi: readonly BidiTokenFact[]
  /** Measuring stopped at its time or node limit, so the lists may be incomplete. */
  readonly truncated: boolean
}
