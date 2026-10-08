import type { Box, Engine } from '@arablyzer/collectors'
import { shownFamily } from '../../lib/fonts'
import { missingIn } from '../../lib/missing-letters'
import { renderedFacts } from '../../lib/rendered'
import { defineRule, type DetectorFinding } from '../../rule'

/** Characters a message names; the rest are counted in its evidence. */
const MAX_SHOWN = 10

/** A character as a message shows it: a mark on a dotted circle, as Unicode charts show marks. */
function shown(char: string): string {
  return /\p{M}/u.test(char) ? `«◌${char}»` : `«${char}»`
}

export const rule = defineRule({
  id: 'ar-font-missing-letters',
  version: '1.0.0',
  category: 'ar-render',
  severity: 'moderate',
  needs: ['render', 'files'],
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
