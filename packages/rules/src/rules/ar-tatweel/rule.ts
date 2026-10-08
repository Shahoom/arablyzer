import { isMostlyArabic, STRETCHED_WORD } from '../../lib/arabic'
import { defineRule } from '../../rule'

export const rule = defineRule({
  id: 'ar-tatweel',
  version: '1.0.0',
  category: 'ar-content',
  severity: 'minor',
  needs: ['text'],
  messages: ['stretched'],
  appliesTo: isMostlyArabic,
  // Lazily, one finding per text, with the number of stretched words in it.
  detect: function* ({ page }) {
    for (const segment of page.text?.segments ?? []) {
      if (segment.code) continue
      let first: { word: string; offset: number } | null = null
      let count = 0
      for (const match of segment.text.matchAll(/\S+/gu)) {
        if (!STRETCHED_WORD.test(match[0])) continue
        count++
        first ??= { word: match[0], offset: match.index }
      }
      if (first === null) continue
      let newlines = 0
      for (let i = 0; i < first.offset; i++) if (segment.text.charCodeAt(i) === 10) newlines++
      yield {
        message: 'stretched' as const,
        values: { word: first.word, clean: first.word.replaceAll('ـ', ''), count },
        selector: segment.selector,
        ...(segment.location === null
          ? {}
          : { location: { line: segment.location.line + newlines } }),
        key: `${segment.selector}#${first.offset}`,
      }
    }
  },
})
