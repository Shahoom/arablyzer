import { describe, expect, it } from 'vitest'
import { PATTERN_TYPES, pageTester, testPattern } from '../src/lib/html-pattern'

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

describe('pageTester', () => {
  it('runs each pattern once, and stops after a few slow ones', () => {
    const test = pageTester()
    const start = performance.now()
    for (let i = 0; i < 20; i++) expect(test(`(a*)*b|x${i}`, ['a'.repeat(40)])).toBe('too-slow')
    expect(performance.now() - start).toBeLessThan(1000)
    expect(test('[0-9]+', ['1'])).toBe('too-slow')
    expect(pageTester()('[0-9]+', ['1', 'a'])).toEqual([true, false])
  })
})
