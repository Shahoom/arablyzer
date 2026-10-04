import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fontCoverage, inRanges, subsetCharacters, subsetFont, unicodeRangeOf } from '../src'

const FONT = readFileSync(
  new URL('../../../fixtures/shared/fonts/arablyzer-test-arabic.ttf', import.meta.url),
)

describe('subsetCharacters', () => {
  it('keeps digits, joiners, punctuation and the forms of the letters the page showed', () => {
    const kept = subsetCharacters('لا')
    for (const char of ['0', '٣', '‍', '‌', '،', '؟', ' ', 'ل', 'ا']) {
      expect(kept).toContain(char)
    }
    // The lam-alef ligature and the forms of lam and alef, by their code points.
    expect(kept).toContain('ﻻ')
    expect(kept).toContain('ﻟ')
    // A letter the page did not show brings none of its forms.
    expect(kept).not.toContain('ﺑ')
  })
})

describe('subsetFont', () => {
  it('shrinks a real Arabic font to the letters used, keeping its shaping tables', async () => {
    const subset = await subsetFont(new Uint8Array(FONT), 'مرحبا بالعالم')
    expect(subset.woff2.byteLength).toBeLessThan(FONT.byteLength / 2)
    const whole = fontCoverage(new Uint8Array(FONT)) ?? []
    expect(inRanges(whole, 0x0645)).toBe(true)
    expect(inRanges(whole, 0x0634)).toBe(true)
    expect(inRanges(subset.ranges, 0x0645)).toBe(true)
    // Letters never shown are gone; the digits stay.
    expect(inRanges(subset.ranges, 0x0634)).toBe(false)
    expect(inRanges(subset.ranges, 0x0663)).toBe(true)
    // The subset is a font again, which subsets once more.
    expect((await subsetFont(subset.woff2, 'مرحبا')).woff2.byteLength).toBeGreaterThan(0)
  })

  it('refuses what is not a font, and what is too large', async () => {
    await expect(subsetFont(new Uint8Array([1, 2, 3, 4]), 'ا')).rejects.toThrow()
    await expect(subsetFont(new Uint8Array(5 * 1024 * 1024 + 1), 'ا')).rejects.toThrow(RangeError)
  })
})

describe('unicodeRangeOf', () => {
  it('writes ranges as a unicode-range value', () => {
    expect(
      unicodeRangeOf([
        [0x20, 0x20],
        [0x30, 0x39],
        [0x600, 0x6ff],
        [0x31, 0x32],
      ]),
    ).toBe('U+20,U+30-39,U+600-6FF')
  })
})
