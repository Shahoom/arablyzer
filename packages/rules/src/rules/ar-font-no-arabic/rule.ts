import { failedForArabic } from '../../lib/fonts'
import { renderedFacts } from '../../lib/rendered'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'none' | 'partial'

export const rule = defineRule({
  id: 'ar-font-no-arabic',
  version: '1.0.0',
  category: 'ar-render',
  severity: 'moderate',
  needs: ['render'],
  // Chromium alone reports which fonts drew a text (CSS.getPlatformFontsForNode).
  renderEngines: ['chromium'],
  messages: ['none', 'partial'],
  appliesTo: (_page, evidence) =>
    renderedFacts(evidence).some((facts) => (facts.usedFonts?.length ?? 0) > 0),
  detect: ({ rendered = [] }) => {
    const findings: DetectorFinding<Message>[] = []
    for (const facts of rendered) {
      // Each list was measured once, with a probe holding every Arabic letter.
      for (const used of facts.usedFonts ?? []) {
        const block = facts.arabicText.find((text) => text.fontFamily === used.fontFamily)
        if (block === undefined) continue
        // A font that did not load is ar-font-fallback's finding, not a font without Arabic.
        if (failedForArabic(facts, block.primaryFamily)) continue
        const web = used.fonts.some((font) => font.custom)
        const other = used.fonts.some((font) => !font.custom)
        if (web && !other) continue
        findings.push({
          message: web ? 'partial' : 'none',
          values: { family: block.primaryFamily },
          selector: block.selector,
          engines: [facts.engine],
          box: block.box,
        })
      }
    }
    return findings
  },
})
