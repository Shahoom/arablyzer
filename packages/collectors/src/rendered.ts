import type { PhysicalDeclaration } from './stylesheet'
import type { WebFontCoverageFact } from './web-font-coverage'

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
  /**
   * The distinct characters of its whole own text in the Arabic script's blocks, in code point
   * order, format characters left out (the first 200).
   */
  readonly arabicCharacters: string
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

/** Declarations in one stylesheet that set a side by left or right. */
export interface PhysicalCssFact {
  /** The stylesheet's URL; the page's, for its <style> elements, which count as one. */
  readonly url: string
  /** The page's <style> elements rather than a stylesheet file; their lines are not the page's. */
  readonly inline: boolean
  readonly count: number
  /** The first few, in the order of the text. */
  readonly examples: readonly PhysicalDeclaration[]
}

/** The page's CSS as far as Arablyzer read it (docs/design/plans/m1.2c-css-fonts.md §2). */
export interface StylesheetsFact {
  /** Stylesheet files read, and the <style> elements as one when the page has any. */
  readonly read: number
  /**
   * Stylesheet files the page loaded that were not read: past the limits, of a size that could
   * not be known before reading, or no longer held by the browser.
   */
  readonly unread: number
  /** Those read that set sides by left or right (the first 40). */
  readonly physical: readonly PhysicalCssFact[]
}

/** A direction icon in right-to-left text, drawn as it is for left-to-right text. */
export interface DirectionIconFact extends RenderedElement {
  /** What names it: an icon-font class (`fa-arrow-right`), a Material name, or the arrow. */
  readonly name: string
}

/** A number or a Latin word inside right-to-left text whose characters are drawn out of order. */
export interface BidiTokenFact extends RenderedElement {
  readonly text: string
  readonly kind: 'number' | 'latin'
}

/** A form field as the engine rendered it, for rules that need its computed style. */
export interface RenderedFieldFact extends RenderedElement {
  readonly tag: 'input' | 'textarea'
  /** An input's type as the engine reads it (unknown types are "text"); "textarea" for a textarea. */
  readonly type: string
  readonly name: string | null
  readonly id: string | null
  /** Tokens of the autocomplete attribute, lowercased. */
  readonly autocomplete: readonly string[]
  /** Lowercased. */
  readonly inputmode: string | null
  readonly placeholder: string | null
  /** The text of the field's labels, joined; null when none labels it. */
  readonly label: string | null
  readonly ariaLabel: string | null
  /** The dir attribute as written, lowercased. */
  readonly dirAttribute: string | null
  /** Computed. */
  readonly direction: 'ltr' | 'rtl'
  /** Computed. */
  readonly unicodeBidi: string
}

/** axe-core rules Arablyzer reports, each through a rule of its own (Phase 1 design §3). */
export type A11yRuleId =
  'image-alt' | 'color-contrast' | 'link-name' | 'button-name' | 'valid-lang' | 'label'

/** An element axe reported, with what its check measured. */
export interface A11yNodeFact {
  readonly selector: string
  /** The start of the element's HTML, as axe gives it. */
  readonly snippet: string
  /** Why axe reported it: the message key of the check (such as `bgImage`), when it gives one. */
  readonly reason: string | null
  /** color-contrast: the colours and ratios axe measured. */
  readonly contrast: {
    readonly foreground: string
    readonly background: string
    readonly ratio: number
    readonly expected: number
  } | null
}

export interface A11yRuleFact {
  readonly id: A11yRuleId
  /** The page has something the rule checks (axe did not list it as inapplicable). */
  readonly applicable: boolean
  /** What axe found wrong (the first 20), and how many in all. */
  readonly violations: readonly A11yNodeFact[]
  readonly violationCount: number
  /** What axe could not decide (the first 20), and how many in all. */
  readonly incomplete: readonly A11yNodeFact[]
  readonly incompleteCount: number
}

/** axe-core's results for the curated rules, in one engine. */
export interface A11yFacts {
  readonly axeVersion: string
  readonly rules: readonly A11yRuleFact[]
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
  /** Faces past the bound, counted only. */
  readonly fontFacesOmitted: number
  readonly fontRequests: readonly FontRequestFact[]
  /**
   * Each web font family's Arabic-script coverage, from the font files and stylesheets the page
   * loaded (the first 50 families).
   */
  readonly arabicFontCoverage: readonly WebFontCoverageFact[]
  readonly stylesheets: StylesheetsFact
  /** Chromium only. */
  readonly usedFonts?: readonly UsedFontsFact[]
  /** Out-of-order tokens (the first 20). */
  readonly bidi: readonly BidiTokenFact[]
  /** Text fields (the first 200). */
  readonly fields: readonly RenderedFieldFact[]
  /** Unmirrored direction icons in right-to-left text (the first 20). */
  readonly directionIcons: readonly DirectionIconFact[]
  /** axe-core's results; null when axe did not run or did not finish in time. */
  readonly a11y: A11yFacts | null
  /** Measuring stopped at its time or node limit, so the lists may be incomplete. */
  readonly truncated: boolean
  /**
   * The page reached Arablyzer's limits on requests or data, so some of its requests were cut
   * short, fonts among them, by Arablyzer rather than by the site.
   */
  readonly limited: boolean
}
