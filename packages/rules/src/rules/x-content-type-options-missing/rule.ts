import { asciiLowercase, getDecodeSplit } from '../../lib/headers'
import { isPublicUrl } from '../../lib/hosts'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'missing' | 'invalid'

/**
 * A public HTML page without X-Content-Type-Options: nosniff, which stops browsers guessing a
 * response's type from its content, and has them refuse a script or a stylesheet sent with the
 * wrong type. Browsers read the header's first value alone (Fetch "determine nosniff").
 */
export const rule = defineRule({
  id: 'x-content-type-options-missing',
  version: '1.0.0',
  category: 'trust',
  severity: 'minor',
  needs: ['headers'],
  messages: ['missing', 'invalid'],
  appliesTo: (page) => page.isHtml && isPublicUrl(page.url),
  detect: ({ page }): DetectorFinding<Message>[] => {
    const values = getDecodeSplit(page.headers, 'x-content-type-options')
    if (values === null) return [{ message: 'missing' }]
    const [first = ''] = values
    if (asciiLowercase(first) === 'nosniff') return []
    return [
      {
        message: 'invalid',
        values: { value: first },
        snippet: `X-Content-Type-Options: ${values.join(', ')}`,
      },
    ]
  },
})
