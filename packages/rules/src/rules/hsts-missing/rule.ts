import { headerValues } from '@arablyzer/collectors'
import { hostnameOf, isAddress } from '../../lib/hosts'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'missing' | 'zero' | 'invalid'

/** max-age from a Strict-Transport-Security value; null when it has none or it is not valid. */
function maxAge(value: string): number | null {
  let found: number | null = null
  for (const directive of value.split(';')) {
    const match = /^\s*max-age\s*=\s*"?(\d+)"?\s*$/i.exec(directive)
    if (match?.[1] !== undefined) {
      // RFC 6797 §6.1: a directive given twice makes the header invalid.
      if (found !== null) return null
      found = Number(match[1])
    } else if (/^\s*max-age\s*=/i.test(directive)) {
      return null
    }
  }
  return found
}

/**
 * An HTTPS page without HTTP Strict Transport Security: a visitor who types the address, or
 * follows an http: link, reaches it over plain HTTP first, where it can be intercepted.
 * Browsers keep HSTS for host names only (RFC 6797 §8.1), so addresses are left out.
 */
export const rule = defineRule({
  id: 'hsts-missing',
  version: '1.0.0',
  category: 'trust',
  severity: 'moderate',
  needs: ['http'],
  messages: ['missing', 'zero', 'invalid'],
  appliesTo: (page) => {
    const hostname = hostnameOf(page.url)
    return page.url.startsWith('https:') && hostname !== null && !isAddress(hostname)
  },
  detect: ({ page }): DetectorFinding<Message>[] => {
    // RFC 6797 §8.1: only the first header counts.
    const [first] = headerValues(page.headers, 'strict-transport-security')
    if (first === undefined) return [{ message: 'missing' }]
    const age = maxAge(first)
    if (age === null) return [{ message: 'invalid', values: { value: first }, snippet: first }]
    if (age === 0) return [{ message: 'zero', snippet: first }]
    return []
  },
})
