import type { ArabicTextBlock } from '@arablyzer/collectors'
import { failedForArabic, facesOf } from '../../lib/fonts'
import { renderedFacts, Sightings } from '../../lib/rendered'
import { defineRule } from '../../rule'

export const rule = defineRule({
  id: 'ar-font-fallback',
  version: '1.0.0',
  category: 'ar-render',
  severity: 'moderate',
  needs: ['render'],
  messages: ['failed'],
  // Arabic text whose first family is one of the page's web fonts.
  appliesTo: (_page, evidence) =>
    renderedFacts(evidence).some((facts) =>
      facts.arabicText.some((block) => facesOf(facts, block.primaryFamily).length > 0),
    ),
  detect: ({ rendered = [] }) => {
    const failed = new Sightings<ArabicTextBlock>()
    for (const facts of rendered) {
      // A font the egress proxy refused (a blocked address, the request limit) fails because of
      // Arablyzer, not the site; the fonts are not told apart, so this engine says nothing.
      if (facts.fontRequests.some((request) => request.refused)) continue
      for (const block of facts.arabicText) {
        if (!failedForArabic(facts, block.primaryFamily)) continue
        // One finding per font, at the first element set in it.
        failed.add(block.primaryFamily.toLowerCase(), facts.engine, block)
      }
    }
    return [...failed].flatMap(({ engines, each }) => {
      const block = each.get(engines[0] ?? 'chromium')
      if (block === undefined) return []
      return [
        {
          message: 'failed' as const,
          values: { family: block.primaryFamily },
          selector: block.selector,
          engines,
          box: block.box,
        },
      ]
    })
  },
})
