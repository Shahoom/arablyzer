import { Script, createContext } from 'node:vm'

/** Input types whose value the pattern attribute checks (HTML, "The pattern attribute"). */
export const PATTERN_TYPES: ReadonlySet<string> = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
])

/** Long enough for any real pattern; a page's hostile one stops here instead of the scan. */
const TIMEOUT_MS = 50

export type PatternResult = readonly boolean[] | 'invalid' | 'too-slow'

// The pattern comes from the page, so it runs in a context with a time limit: a pattern such as
// (a*)*b can backtrack for minutes. The page's text is only ever data to new RegExp, never code.
const context = createContext({})
const script = new Script(`(() => {
  let expression
  try {
    expression = new RegExp('^(?:' + pattern + ')$', 'v')
  } catch {
    return 'invalid'
  }
  return values.map((value) => expression.test(value))
})()`)

/**
 * Whether each value matches the pattern, as a browser checks an input's pattern attribute: the
 * whole value, with the v flag. 'invalid' when the pattern does not compile, which browsers
 * ignore; 'too-slow' when it runs past the time limit.
 */
export function testPattern(pattern: string, values: readonly string[]): PatternResult {
  context.pattern = pattern
  context.values = [...values]
  try {
    const result: unknown = script.runInContext(context, { timeout: TIMEOUT_MS })
    if (result === 'invalid') return 'invalid'
    return Array.isArray(result) ? result.map((matched) => matched === true) : 'invalid'
  } catch {
    return 'too-slow'
  } finally {
    context.pattern = undefined
    context.values = undefined
  }
}

/** Tests one page may run, and patterns that run too long before the rest are skipped. */
const MAX_TESTS = 500
const MAX_SLOW = 3

/**
 * testPattern for one page: each pattern and set of values runs once, and a page cannot stretch
 * the scan with many slow patterns; past the budget every answer is 'too-slow'.
 */
export function pageTester(): (pattern: string, values: readonly string[]) => PatternResult {
  const results = new Map<string, PatternResult>()
  let slow = 0
  return (pattern, values) => {
    const key = JSON.stringify([pattern, values])
    const known = results.get(key)
    if (known !== undefined) return known
    if (slow >= MAX_SLOW || results.size >= MAX_TESTS) return 'too-slow'
    const result = testPattern(pattern, values)
    if (result === 'too-slow') slow++
    results.set(key, result)
    return result
  }
}
