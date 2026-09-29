import { headerValues } from '@arablyzer/collectors'
import { hostnameOf, isAddress } from '../../lib/hosts'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'missing' | 'zero' | 'invalid'

/** RFC 9110 §5.6.2: the characters of a token. */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]$/

/**
 * max-age from a Strict-Transport-Security value; null when the value is not valid, which the
 * browser then ignores (RFC 6797 §6.1, §8.1). Directives are tokens, each with an optional value,
 * a token or a quoted string, separated by semicolons; names are read whatever their case.
 * max-age must be there, with digits alone; includeSubDomains takes no value; neither may come
 * twice, as Chromium and Firefox refuse. Other directives, preload among them, are ignored.
 */
function maxAge(value: string): number | null {
  let at = 0
  const spaces = () => {
    while (value[at] === ' ' || value[at] === '\t') at++
  }
  const token = () => {
    const start = at
    while (at < value.length && TOKEN.test(value[at] ?? '')) at++
    return value.slice(start, at)
  }
  /** A quoted string's content, from its opening quote; null when it is left open. */
  const quoted = (): string | null => {
    let content = ''
    for (at++; at < value.length; at++) {
      const character = value[at] ?? ''
      if (character === '"') {
        at++
        return content
      }
      if (character === '\\') at++
      if (at >= value.length) return null
      content += value[at] ?? ''
    }
    return null
  }
  const seen = new Set<string>()
  let age: number | null = null
  for (;;) {
    spaces()
    if (at < value.length && value[at] !== ';') {
      const name = token().toLowerCase()
      if (name === '') return null
      spaces()
      let given: string | null = null
      if (value[at] === '=') {
        at++
        spaces()
        given = value[at] === '"' ? quoted() : token()
        if (given === null || (given === '' && value[at - 1] !== '"')) return null
        spaces()
      }
      if (name === 'max-age' || name === 'includesubdomains') {
        if (seen.has(name)) return null
        seen.add(name)
      }
      if (name === 'max-age') {
        if (given === null || !/^\d+$/.test(given)) return null
        age = Number(given)
      } else if (name === 'includesubdomains' && given !== null) {
        return null
      }
    }
    if (at >= value.length) break
    if (value[at] !== ';') return null
    at++
  }
  return age
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
  needs: ['headers'],
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
