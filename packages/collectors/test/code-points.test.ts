import { describe, expect, it } from 'vitest'
import {
  inRanges,
  intersectRanges,
  MAX_CODE_POINT,
  mergeRanges,
  parseUnicodeRange,
} from '../src/code-points'

describe('code point ranges', () => {
  it('sorts runs and joins those that overlap or touch', () => {
    expect(
      mergeRanges([
        [0x700, 0x7ff],
        [0x600, 0x6ff],
        [0x10, 0x20],
        [0x15, 0x30],
        [0x40, 0x3f],
      ]),
    ).toEqual([
      [0x10, 0x30],
      [0x600, 0x7ff],
    ])
  })

  it('intersects two lists', () => {
    expect(
      intersectRanges(
        [
          [0, 0x7f],
          [0x600, 0x6ff],
        ],
        [
          [0x41, 0x5a],
          [0x660, 0x669],
          [0x700, 0x7ff],
        ],
      ),
    ).toEqual([
      [0x41, 0x5a],
      [0x660, 0x669],
    ])
  })

  it('finds a code point in a list', () => {
    const ranges = mergeRanges([
      [0x20, 0x7e],
      [0x600, 0x6ff],
      [0xfe70, 0xfeff],
    ])
    expect(inRanges(ranges, 0x627)).toBe(true)
    expect(inRanges(ranges, 0x7e)).toBe(true)
    expect(inRanges(ranges, 0x7f)).toBe(false)
    expect(inRanges(ranges, 0xfefe)).toBe(true)
    expect(inRanges([], 0x41)).toBe(false)
  })
})

describe('parseUnicodeRange', () => {
  it('reads single code points, ranges and wildcards', () => {
    expect(parseUnicodeRange('U+0600-06FF, U+200C-200E, u+fb50-fdff, U+4??, U+25')).toEqual([
      [0x25, 0x25],
      [0x400, 0x4ff],
      [0x600, 0x6ff],
      [0x200c, 0x200e],
      [0xfb50, 0xfdff],
    ])
  })

  it('reads FontFace.unicodeRange as the browser serializes it', () => {
    expect(parseUnicodeRange('U+0-10FFFF')).toEqual([[0, MAX_CODE_POINT]])
    expect(parseUnicodeRange('U+600-6FF, U+750-77F')).toEqual([
      [0x600, 0x6ff],
      [0x750, 0x77f],
    ])
  })

  it('clips ranges past U+10FFFF', () => {
    expect(parseUnicodeRange('U+??????')).toEqual([[0, MAX_CODE_POINT]])
    expect(parseUnicodeRange('U+10FFFE-1FFFFF, U+110000')).toEqual([[0x10fffe, MAX_CODE_POINT]])
  })

  it('refuses a value it cannot read or a range that runs backwards', () => {
    expect(parseUnicodeRange('U+06FF-0600')).toBeNull()
    expect(parseUnicodeRange('U+0600-06FF, arabic')).toBeNull()
    expect(parseUnicodeRange('U+1234567')).toBeNull()
    expect(parseUnicodeRange('U+12?4')).toBeNull()
    expect(parseUnicodeRange('')).toBeNull()
  })
})
