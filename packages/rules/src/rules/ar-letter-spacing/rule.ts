import type { ArabicTextBlock, Engine } from '@arablyzer/collectors'
import { hasRenderedArabic, Sightings } from '../../lib/rendered'
import { defineRule, type DetectorFinding } from '../../rule'

/**
 * Measured in CI with Playwright 1.63: WebKit 26.6 drew letter-spacing on Arabic text, while
 * Chromium 153 and Firefox 155 left it out. When WebKit did not render the page, the spacing
 * still counts.
 */
const DRAWS_IT: Engine = 'webkit'

export const rule = defineRule({
  id: 'ar-letter-spacing',
  version: '1.0.0',
  category: 'ar-render',
  severity: 'moderate',
  needs: ['render'],
  messages: ['drawn', 'webkit'],
  appliesTo: (_page, evidence) => hasRenderedArabic(evidence),
  detect: ({ rendered = [] }) => {
    const spaced = new Sightings<ArabicTextBlock>()
    for (const facts of rendered) {
      for (const block of facts.arabicText) {
        // null: no word of two letters or more, so there are no joins to break. Negative spacing
        // draws the letters closer; they overlap but stay joined (M1.1 review).
        if (block.letterSpacing <= 0 || block.letterSpacingApplied === null) continue
        spaced.add(block.selector, facts.engine, block)
      }
    }
    const webkitRendered = rendered.some((facts) => facts.engine === DRAWS_IT)
    const findings: DetectorFinding<'drawn' | 'webkit'>[] = []
    for (const { key, engines, each } of spaced) {
      const drawn = engines.filter((engine) => each.get(engine)?.letterSpacingApplied === true)
      if (drawn.length === 0 && webkitRendered) continue
      const shown = drawn.length > 0 ? drawn : engines
      const block = each.get(shown[0] ?? DRAWS_IT)
      if (block === undefined) continue
      findings.push({
        message: drawn.length > 0 ? 'drawn' : 'webkit',
        values: { letterSpacing: block.letterSpacing },
        selector: key,
        engines: shown,
        box: block.box,
      })
    }
    return findings
  },
})
