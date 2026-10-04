import {
  inRanges,
  type Engine,
  type RenderedFacts,
  type RiyalSignFact,
} from '@arablyzer/collectors'
import { facesOf, familyList, shownFamily } from '../../lib/fonts'
import { renderedFacts } from '../../lib/rendered'
import { defineRule } from '../../rule'

/** The Saudi Riyal sign, assigned in Unicode 17 (2025). */
const SIGN = 0x20c1

type Drawn =
  | { readonly by: 'web'; readonly family: string }
  | { readonly by: 'lacking'; readonly families: readonly string[] }
  | { readonly by: 'unknown' }
  | { readonly by: 'system' }

/**
 * Who draws the sign for an element, going down its font-family list as the browser does: the
 * first web font whose loaded files have it; `lacking` when web fonts come first and none has it,
 * so a font of the visitor's device draws it, or an empty box where that font predates Unicode 17;
 * `unknown` when a web font's file could not be read; `system` when the list names no web font at
 * all, which only the visitor's device can answer.
 */
function drawnBy(sign: RiyalSignFact, facts: RenderedFacts): Drawn {
  const lacking: string[] = []
  for (const family of familyList(sign.fontFamily)) {
    const coverage = facts.arabicFontCoverage.find(
      (entry) => entry.family.toLowerCase() === family.toLowerCase(),
    )
    if (coverage === undefined) {
      if (facesOf(facts, family).length > 0 || facts.fontFacesOmitted > 0) {
        return { by: 'unknown' }
      }
      // The first font that is not a web font: the rest is the device's.
      return lacking.length > 0 ? { by: 'lacking', families: lacking } : { by: 'system' }
    }
    if (inRanges(coverage.covered, SIGN)) return { by: 'web', family: coverage.family }
    if (inRanges(coverage.unknown, SIGN)) return { by: 'unknown' }
    lacking.push(coverage.family)
  }
  return lacking.length > 0 ? { by: 'lacking', families: lacking } : { by: 'system' }
}

/**
 * The Saudi Riyal sign (U+20C1) on a page whose web fonts do not have it: the browser draws it
 * with a font of the visitor's device, which has it only on a system updated for Unicode 17, and
 * with an empty box otherwise. Minor: the sign is new, and where a device lacks it the rest of the
 * price still reads. A page whose font list names no web font is not judged: only the visitor's
 * device can say.
 */
export const rule = defineRule({
  id: 'sar-sign-font',
  version: '1.0.0',
  category: 'ar-render',
  severity: 'minor',
  needs: ['render', 'files'],
  messages: ['lacking'],
  appliesTo: (_page, evidence) =>
    renderedFacts(evidence).some((facts) => facts.riyalSigns.length > 0),
  detect: ({ rendered = [] }) => {
    const found = new Map<
      string,
      { sign: RiyalSignFact; families: readonly string[]; engines: Engine[] }
    >()
    for (const facts of rendered) {
      for (const sign of facts.riyalSigns) {
        const drawn = drawnBy(sign, facts)
        if (drawn.by !== 'lacking') continue
        const key = drawn.families.join('\n').toLowerCase()
        const known = found.get(key)
        if (known === undefined) {
          found.set(key, { sign, families: drawn.families, engines: [facts.engine] })
        } else if (!known.engines.includes(facts.engine)) known.engines.push(facts.engine)
      }
    }
    return [...found.entries()].map(([key, { sign, families, engines }]) => ({
      message: 'lacking' as const,
      values: { family: families.map(shownFamily).join('، ') },
      selector: sign.selector,
      engines,
      box: sign.box,
      key,
    }))
  },
})
