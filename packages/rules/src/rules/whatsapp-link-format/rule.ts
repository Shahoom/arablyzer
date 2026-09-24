import { checkWhatsAppNumber, whatsAppNumber } from '../../lib/whatsapp'
import { defineRule } from '../../rule'

export const rule = defineRule({
  id: 'whatsapp-link-format',
  version: '1.0.0',
  category: 'forms',
  severity: 'serious',
  needs: ['html'],
  messages: ['arabic-digits', 'not-digits-only', 'leading-zero', 'not-international', 'trunk-zero'],
  appliesTo: (page) =>
    (page.html?.anchors ?? []).some(
      (anchor) => anchor.url !== null && whatsAppNumber(anchor.url) !== null,
    ),
  detect: ({ page }) =>
    (page.html?.anchors ?? []).flatMap((anchor) => {
      const number = anchor.url === null ? null : whatsAppNumber(anchor.url)
      const problem = number === null ? null : checkWhatsAppNumber(number)
      if (number === null || problem === null) return []
      return [
        {
          message: problem.problem,
          values: { number, suggestion: problem.suggestion, href: anchor.href },
          selector: anchor.selector,
          ...(anchor.snippet === null ? {} : { snippet: anchor.snippet }),
          ...(anchor.location === null ? {} : { location: anchor.location }),
          key: anchor.href,
        },
      ]
    }),
})
