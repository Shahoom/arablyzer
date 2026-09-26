import { describe, expect, it } from 'vitest'
import { toFacts } from '../../src/index'

const box = { x: 0, y: 0, width: 10, height: 10 }

const measured = {
  dir: 'rtl',
  lang: 'ar',
  viewportMeta: 'width=device-width',
  viewport: { width: 390, height: 844 },
  scrollWidth: 390,
  overflow: [],
  arabicText: [
    {
      selector: '#a',
      box,
      text: 'نص',
      letterSpacing: 0,
      letterSpacingApplied: null,
      fontFamily: 'serif',
      primaryFamily: 'serif',
    },
  ],
  arabicTextOmitted: 0,
  fontFaces: [],
  bidi: [],
  truncated: false,
}

const context = {
  engine: 'chromium' as const,
  version: '153.0',
  url: 'https://example.com/',
  status: 200,
  fontRequests: [],
}

describe('toFacts: the page script’s result, checked before any rule reads it', () => {
  it('turns a well-formed result into RenderedFacts', () => {
    expect(toFacts(measured, context)).toMatchObject({
      engine: 'chromium',
      version: '153.0',
      status: 200,
      dir: 'rtl',
      arabicText: [{ selector: '#a', text: 'نص' }],
      truncated: false,
    })
    expect('usedFonts' in toFacts(measured, context)).toBe(false)
  })

  it.each([
    ['an unknown direction', { ...measured, dir: 'sideways' }],
    [
      'a selector past 300 characters',
      { ...measured, overflow: [{ selector: 'a'.repeat(301), box }] },
    ],
    [
      'text past its bound',
      { ...measured, arabicText: [{ ...measured.arabicText[0], text: 'ن'.repeat(201) }] },
    ],
    ['a fractional pixel', { ...measured, overflow: [{ selector: 'a', box: { ...box, x: 0.5 } }] }],
    [
      'more tokens than the script keeps',
      {
        ...measured,
        bidi: Array.from({ length: 21 }, () => ({
          selector: 'p',
          box,
          text: 'C++',
          kind: 'latin',
        })),
      },
    ],
    ['an extra field', { ...measured, cookies: 'x' }],
    ['something that is not an object', 'rendered'],
  ])('rejects %s, as a page that meddled with the script could return', (_name, value) => {
    expect(() => toFacts(value, context)).toThrow()
  })
})
