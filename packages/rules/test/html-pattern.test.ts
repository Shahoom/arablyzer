import { describe, expect, it } from 'vitest'
import { isSimplePattern, PATTERN_TYPES, pageTester, testPattern } from '../src/lib/html-pattern'

describe('testPattern', () => {
  it('matches the whole value with the v flag, as browsers do', () => {
    expect(testPattern('[A-Za-z ]+', ['محمد العبري', 'Omar Alabri', 'Omar1'])).toEqual([
      false,
      true,
      false,
    ])
    expect(testPattern('a|b', ['a', 'ab'])).toEqual([true, false])
    expect(testPattern('\\d{8}', ['91234567', '٩١٢٣٤٥٦٧'])).toEqual([true, false])
    expect(testPattern('[\\p{L} ]+', ['محمد العبري'])).toEqual([true])
  })

  it('says a pattern the v flag cannot compile is invalid, which browsers ignore', () => {
    expect(testPattern('[a-z-]+', ['abc'])).toBe('invalid')
    expect(testPattern('(', ['abc'])).toBe('invalid')
  })

  it('gives up on patterns that take too long, instead of hanging the scan', () => {
    const start = performance.now()
    expect(testPattern('(a*)*b', ['a'.repeat(40)])).toBe('too-slow')
    expect(performance.now() - start).toBeLessThan(1000)
  })

  it('lists the input types the pattern attribute applies to', () => {
    expect([...PATTERN_TYPES].sort()).toEqual(['email', 'password', 'search', 'tel', 'text', 'url'])
  })
})

describe('isSimplePattern', () => {
  it('tells the patterns a form uses from those that can backtrack for long', () => {
    for (const pattern of [
      '[A-Za-z ]{3,40}',
      '\\d{8}',
      '(\\+968)?[0-9٠-٩]{8}',
      "[\\p{L}\\p{M} '\\-]{2,60}",
      '[0-9]{3}-?[0-9]{4}',
      '([0-9]{3}-?){2}[0-9]{4}',
      'a|b',
    ]) {
      expect(isSimplePattern(pattern), pattern).toBe(true)
    }
    for (const pattern of ['(a*)*b', '(a+)+', '(a|aa)*b', '(\\d+-?)+', '(a)\\1', 'a*a*a*a*a*b']) {
      expect(isSimplePattern(pattern), pattern).toBe(false)
    }
    expect(isSimplePattern('(')).toBe(false)
  })
})

describe('pageTester', () => {
  it('runs each pattern once, and stops running the risky ones after a few slow ones', () => {
    const test = pageTester()
    const start = performance.now()
    for (let i = 0; i < 20; i++) expect(test(`(a*)*b|x${i}`, ['a'.repeat(40)])).toBe('too-slow')
    expect(performance.now() - start).toBeLessThan(1500)
    expect(test('(b+)+', ['b'])).toBe('too-slow')
    expect(pageTester()('[0-9]+', ['1', 'a'])).toEqual([true, false])
  })

  it("answers a simple pattern whatever the page's risky ones cost, so the result never depends on the machine's load", () => {
    const test = pageTester({ budgetMs: 0 })
    for (let i = 0; i < 5; i++) expect(test(`(a*)*b|y${i}`, ['a'.repeat(40)])).toBe('too-slow')
    expect(test('[0-9]+', ['1'])).toEqual([true])
    expect(test('[a-z]+', ['a'])).toEqual([true])
    expect(test('\\d{6}', ['123456', '١٢٣٤٥٦'])).toEqual([true, false])
  })

  it('stops after a total time on one page, for risky patterns each just under the limit', () => {
    const test = pageTester({ budgetMs: 0 })
    expect(test('(x+)+y', ['xy'])).toEqual([true])
    expect(test('(z+)+w', ['zw'])).toBe('too-slow')
  })
})
