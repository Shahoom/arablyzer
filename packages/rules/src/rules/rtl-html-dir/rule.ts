import { isMostlyArabic } from '../../lib/arabic'
import { defineRule } from '../../rule'

export const rule = defineRule({
  id: 'rtl-html-dir',
  version: '1.0.0',
  category: 'rtl',
  severity: 'serious',
  needs: ['html', 'text'],
  messages: ['missing', 'not-rtl', 'body-only'],
  appliesTo: isMostlyArabic,
  detect: ({ page }) => {
    const html = page.html
    const letters = page.text?.letters
    if (html === null || letters === undefined) return []
    const { root, body } = html
    const dir = root.dir?.trim().toLowerCase() ?? ''
    if (dir === 'rtl') return []
    // W3C and the HTML spec: set the base direction with the attribute on <html>, not with CSS.
    const bodyDir = body?.dir?.trim().toLowerCase() ?? ''
    const message = dir !== '' ? 'not-rtl' : bodyDir === 'rtl' ? 'body-only' : 'missing'
    return [
      {
        message,
        values: {
          declaredDir: root.dir,
          bodyDir: body?.dir ?? null,
          arabicLetters: letters.arabic,
          totalLetters: letters.total,
        },
        selector: root.selector,
        ...(root.snippet === null ? {} : { snippet: root.snippet }),
        ...(root.location === null ? {} : { location: root.location }),
      },
    ]
  },
})
