import {
  inRanges,
  type ArabicTextBlock,
  type Box,
  type Engine,
  type RenderedFacts,
} from '@arablyzer/collectors'
import { facesOf, familyList, shownFamily } from '../../lib/fonts'
import { renderedFacts } from '../../lib/rendered'
import { defineRule, type DetectorFinding } from '../../rule'

/** The letters every Arabic font has; a web font without them all is ar-font-no-arabic's. */
const BASIC_LETTERS = Array.from(
  'ابتثجحخدذرزسشصضطظعغفقكلمنهوي',
  (letter) => letter.codePointAt(0) ?? 0,
)
/** Characters a message names; the rest are counted in its evidence. */
const MAX_SHOWN = 10
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
function missingIn(
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

/** A character as a message shows it: a mark on a dotted circle, as Unicode charts show marks. */
function shown(char: string): string {
  return /\p{M}/u.test(char) ? `«◌${char}»` : `«${char}»`
}

export const rule = defineRule({
  id: 'ar-font-missing-letters',
  version: '1.0.0',
  category: 'ar-render',
  severity: 'moderate',
  needs: ['render'],
  messages: ['missing'],
  appliesTo: (_page, evidence) =>
    renderedFacts(evidence).some(
      (facts) =>
        facts.arabicText.length > 0 &&
        facts.arabicFontCoverage.some((entry) => entry.covered.length > 0),
    ),
  detect: ({ rendered = [] }) => {
    // One finding for each web font, with every character it lacks, at its first such text.
    const fonts = new Map<
      string,
      {
        family: string
        characters: Set<string>
        selector: string
        box: Box
        engines: Engine[]
      }
    >()
    for (const facts of rendered) {
      for (const block of facts.arabicText) {
        const found = missingIn(block, facts)
        if (found === undefined || found.missing.length === 0) continue
        const key = found.family.toLowerCase()
        const font = fonts.get(key)
        if (font === undefined) {
          fonts.set(key, {
            family: found.family,
            characters: new Set(found.missing),
            selector: block.selector,
            box: block.box,
            engines: [facts.engine],
          })
          continue
        }
        for (const char of found.missing) font.characters.add(char)
        if (!font.engines.includes(facts.engine)) font.engines.push(facts.engine)
      }
    }
    return [...fonts.values()].map((font): DetectorFinding<'missing'> => {
      const characters = [...font.characters].sort(
        (a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0),
      )
      const list = characters.slice(0, MAX_SHOWN).map(shown).join(' ')
      return {
        message: 'missing',
        values: {
          family: shownFamily(font.family),
          characters: characters.length > MAX_SHOWN ? `${list} …` : list,
          count: characters.length,
        },
        selector: font.selector,
        engines: font.engines,
        box: font.box,
        key: font.family.toLowerCase(),
      }
    })
  },
})
