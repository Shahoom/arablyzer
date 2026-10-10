import { describe, expect, it } from 'vitest'
import { brandColorOf, contrastRatio, DEFAULT_BRAND_COLOR, MIN_TEXT_CONTRAST } from '../src/index'

describe('the colour guard', () => {
  it('measures contrast as WCAG does', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })

  it('keeps a dark colour, with white text on it', () => {
    expect(brandColorOf('#0B3D2E')).toEqual({ color: '#0b3d2e', fallback: false })
  })

  it('falls back to Arablyzer’s colour when white text on the chosen one fails 4.5:1', () => {
    for (const faint of ['#ffff00', '#aaaaaa', '#777777']) {
      expect(contrastRatio(faint, '#ffffff')).toBeLessThan(MIN_TEXT_CONTRAST)
      expect(brandColorOf(faint)).toEqual({ color: DEFAULT_BRAND_COLOR, fallback: true })
    }
  })

  it('uses Arablyzer’s colour, without saying it fell back, when none is set or it is not a colour', () => {
    expect(brandColorOf(null)).toEqual({ color: DEFAULT_BRAND_COLOR, fallback: false })
    expect(brandColorOf('red; background:url(x)')).toEqual({
      color: DEFAULT_BRAND_COLOR,
      fallback: false,
    })
    expect(contrastRatio(DEFAULT_BRAND_COLOR, '#ffffff')).toBeGreaterThan(MIN_TEXT_CONTRAST)
  })
})
