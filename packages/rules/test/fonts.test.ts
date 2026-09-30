import { describe, expect, it } from 'vitest'
import { coversArabic } from '../src/lib/fonts'

describe('coversArabic', () => {
  it.each([
    ['U+0-10FFFF', true],
    ['', true],
    ['U+0600-06FF, U+200C-200E', true],
    ['u+06??', true],
    ['U+0000-00FF, U+0131, U+0152-0153', false],
    ['U+0600', false],
    ['U+064A', true],
    ['U+0650-0660', false],
    ['U+0621-0621', true],
    ['not a range, U+0627', true],
  ])('%j → %s', (range, covered) => {
    expect(coversArabic(range)).toBe(covered)
  })
})
