import {
  inRanges,
  type ArabicTextBlock,
  type RenderedFacts,
  type XrayFamily,
} from '@arablyzer/collectors'
import { facesOf, familyList } from './fonts'

/** The letters every Arabic font has; a web font without them all is ar-font-no-arabic's. */
const BASIC_LETTERS = Array.from(
  'ابتثجحخدذرزسشصضطظعغفقكلمنهوي',
  (letter) => letter.codePointAt(0) ?? 0,
)
/**
 * Format characters draw nothing and no font has unassigned ones. Told apart here, with Node's
 * Unicode tables, so each engine's characters are judged by the same Unicode version.
 */
const NOT_DRAWN = /\p{Cf}|\p{Cn}/u

type Drawn =
  | { readonly by: 'web'; readonly family: string }
  | { readonly by: 'other' }
  | { readonly by: 'unknown' }

/**
 * Which font draws a character, going down the font-family list as the browser does: the first
 * web font whose loaded files have it, or another font (installed or generic) when the list gets
 * past its web fonts first. Unknown when a web font's file could not be read, or when the list
 * names a family the facts may have left out.
 */
function drawnBy(codePoint: number, families: readonly string[], facts: RenderedFacts): Drawn {
  for (const family of families) {
    const name = family.toLowerCase()
    const coverage = facts.arabicFontCoverage.find((entry) => entry.family.toLowerCase() === name)
    if (coverage === undefined) {
      const web = facesOf(facts, family).length > 0 || facts.fontFacesOmitted > 0
      return web ? { by: 'unknown' } : { by: 'other' }
    }
    if (inRanges(coverage.covered, codePoint)) return { by: 'web', family: coverage.family }
    if (inRanges(coverage.unknown, codePoint)) return { by: 'unknown' }
  }
  return { by: 'other' }
}

/**
 * The web font that draws a block's Arabic letters, and the characters of its text that no web
 * font in its list draws; undefined when its letters are not all drawn by web fonts.
 */
export function missingIn(
  block: ArabicTextBlock,
  facts: RenderedFacts,
): { readonly family: string; readonly missing: readonly string[] } | undefined {
  const families = familyList(block.fontFamily)
  let family: string | undefined
  for (const letter of BASIC_LETTERS) {
    const drawn = drawnBy(letter, families, facts)
    if (drawn.by === 'other') return undefined
    if (drawn.by === 'web') family ??= drawn.family
  }
  if (family === undefined) return undefined
  const missing = Array.from(block.arabicCharacters).filter(
    (char) =>
      !NOT_DRAWN.test(char) && drawnBy(char.codePointAt(0) ?? 0, families, facts).by === 'other',
  )
  return { family, missing }
}

/**
 * For the Arabic X-ray: each font-family list of the page's Arabic text with the characters that
 * no web font in it draws, where web fonts govern the letters (the same judgement as
 * ar-font-missing-letters). A list with nothing missing is left out.
 */
export function xrayFamilies(facts: RenderedFacts): XrayFamily[] {
  const byFamily = new Map<string, Set<string>>()
  for (const block of facts.arabicText) {
    const found = missingIn(block, facts)
    if (found === undefined || found.missing.length === 0) continue
    const chars = byFamily.get(block.fontFamily) ?? new Set<string>()
    for (const char of found.missing) chars.add(char)
    byFamily.set(block.fontFamily, chars)
  }
  return [...byFamily].map(([fontFamily, chars]) => ({ fontFamily, chars: [...chars].join('') }))
}
