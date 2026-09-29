import { Script, createContext } from 'node:vm'
import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp'

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
/**
 * A simple pattern's second chance: one that ran past the limit only because the machine was
 * busy (rendering three browsers, say) gets its answer, so the result is the page's alone.
 */
const SIMPLE_TIMEOUT_MS = 1000
/** More repetitions without end than this, one after another, can backtrack for long too. */
const MAX_UNBOUNDED = 4

const parser = new RegExpParser({ ecmaVersion: 2025 })

/**
 * Whether a pattern cannot backtrack for long on a short value: no repetition without end that
 * holds another repetition or a choice, as (a*)* and (a|aa)* do, no back-reference, and a few
 * repetitions without end at most. The patterns forms use (a class and a count, an optional
 * prefix) are simple; one that does not compile under the v flag is not.
 */
export function isSimplePattern(pattern: string): boolean {
  let ast
  try {
    ast = parser.parsePattern(pattern, 0, pattern.length, { unicode: false, unicodeSets: true })
  } catch {
    return false
  }
  // Set from the visitors' callbacks, which the compiler does not follow.
  const found = { risky: false, unbounded: 0 }
  visitRegExpAST(ast, {
    onBackreferenceEnter() {
      found.risky = true
    },
    onQuantifierEnter(node) {
      if (node.max !== Infinity) return
      found.unbounded++
      const choice = (alternatives: readonly unknown[]) => {
        if (alternatives.length > 1) found.risky = true
      }
      visitRegExpAST(node.element, {
        onQuantifierEnter(inner) {
          if (inner.max > 1) found.risky = true
        },
        onGroupEnter: (group) => {
          choice(group.alternatives)
        },
        onCapturingGroupEnter: (group) => {
          choice(group.alternatives)
        },
      })
    },
  })
  return !found.risky && found.unbounded <= MAX_UNBOUNDED
}

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
  const result = run(pattern, values, TIMEOUT_MS)
  return result === 'too-slow' && isSimplePattern(pattern)
    ? run(pattern, values, SIMPLE_TIMEOUT_MS)
    : result
}

function run(pattern: string, values: readonly string[], timeout: number): PatternResult {
  context.pattern = pattern
  context.values = [...values]
  try {
    const result: unknown = script.runInContext(context, { timeout })
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
/** Time one page's patterns may take in all: many patterns each just under the limit add up. */
const PAGE_BUDGET_MS = 1000
/** Longer than any real pattern; a page's longer ones are not tested. */
export const MAX_PATTERN_LENGTH = 1000

export interface PageTesterOptions {
  readonly budgetMs?: number
}

/**
 * testPattern for one page: each pattern and set of values runs once, and a page cannot stretch
 * the scan with many slow patterns: past the budget, or a few slow ones, a pattern that is not
 * simple is not run. A simple one always is, so its answer never depends on what else the page
 * holds or how busy the machine is.
 */
export function pageTester(
  options: PageTesterOptions = {},
): (pattern: string, values: readonly string[]) => PatternResult {
  const budget = options.budgetMs ?? PAGE_BUDGET_MS
  const results = new Map<string, PatternResult>()
  let slow = 0
  let spent = 0
  return (pattern, values) => {
    const key = JSON.stringify([pattern, values])
    const known = results.get(key)
    if (known !== undefined) return known
    if (results.size >= MAX_TESTS || pattern.length > MAX_PATTERN_LENGTH) return 'too-slow'
    const simple = isSimplePattern(pattern)
    if (!simple && (slow >= MAX_SLOW || spent > budget)) return 'too-slow'
    const start = performance.now()
    const result = testPattern(pattern, values)
    if (!simple) {
      spent += performance.now() - start
      if (result === 'too-slow') slow++
    }
    results.set(key, result)
    return result
  }
}
