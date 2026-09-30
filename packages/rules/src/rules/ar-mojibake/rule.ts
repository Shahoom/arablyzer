import { firstGarbledRun, type MojibakeSource } from '../../lib/mojibake'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGE: Readonly<Record<MojibakeSource, 'from-utf-8' | 'from-windows-1256'>> = {
  'utf-8': 'from-utf-8',
  'windows-1256': 'from-windows-1256',
}

export const rule = defineRule({
  id: 'ar-mojibake',
  version: '1.0.0',
  category: 'ar-content',
  severity: 'serious',
  needs: ['text'],
  messages: ['from-utf-8', 'from-windows-1256'],
  // Any page with text: garbled Arabic reads as Latin letters, so the page may not look Arabic.
  appliesTo: (page) => page.text !== null,
  // Lazily, one finding per text: a whole page can be garbled.
  detect: function* ({ page }): Generator<DetectorFinding<'from-utf-8' | 'from-windows-1256'>> {
    for (const segment of page.text?.segments ?? []) {
      if (segment.code) continue
      const run = firstGarbledRun(segment.text)
      if (run === null) continue
      let newlines = 0
      for (let i = 0; i < run.start; i++) if (segment.text.charCodeAt(i) === 10) newlines++
      yield {
        message: MESSAGE[run.source],
        values: { found: run.found, recovered: run.recovered },
        selector: segment.selector,
        ...(segment.location === null
          ? {}
          : { location: { line: segment.location.line + newlines } }),
        key: `${segment.selector}#${run.start}`,
      }
    }
  },
})
