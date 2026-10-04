import type { CodePointRange, FontFaceFact, WebFontCoverageFact } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, renderedEvidence, renderedFacts } from '../../../test/helpers'
import { rule } from './rule'

// The browser suite renders the wrong and right fixtures in every engine; here the detector reads
// the coverage the render worked out from the font files.
const SIGN: CodePointRange = [0x20c1, 0x20c1]
const LETTERS: CodePointRange = [0x621, 0x64a]

const face = (family: string): FontFaceFact => ({
  family,
  status: 'loaded',
  weight: '400',
  style: 'normal',
  unicodeRange: 'U+0-10FFFF',
})
const font = (
  family: string,
  covered: readonly CodePointRange[],
  unknown: readonly CodePointRange[] = [],
): WebFontCoverageFact => ({ family, covered, unknown })
const sign = (fontFamily: string) => ({
  selector: 'p',
  box: { x: 10, y: 20, width: 40, height: 20 },
  fontFamily,
  primaryFamily: fontFamily.split(',')[0] ?? '',
})
const evidence = (fontFamily: string, fonts: readonly WebFontCoverageFact[]) =>
  renderedEvidence([
    renderedFacts('chromium', {
      riyalSigns: [sign(fontFamily)],
      fontFaces: fonts.map((entry) => face(entry.family)),
      arabicFontCoverage: fonts,
    }),
  ])

describe('sar-sign-font', () => {
  it('fires where the web fonts of the list come before any other and none has the sign', () => {
    const found = detectAll(
      rule,
      evidence('"Brand Arabic", serif', [font('Brand Arabic', [LETTERS])]),
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      message: 'lacking',
      values: { family: 'Brand Arabic' },
      selector: 'p',
      engines: ['chromium'],
    })
  })

  it('passes where a web font of the list has the sign', () => {
    expect(
      detectAll(rule, evidence('"Brand Arabic", serif', [font('Brand Arabic', [LETTERS, SIGN])])),
    ).toEqual([])
    // The first web font lacks it, the second has it: the browser reaches the second.
    expect(
      detectAll(
        rule,
        evidence('"A", "B", serif', [font('A', [LETTERS]), font('B', [LETTERS, SIGN])]),
      ),
    ).toEqual([])
  })

  it('does not judge a list with no web font, or a font whose file could not be read', () => {
    expect(detectAll(rule, evidence('system-ui, sans-serif', []))).toEqual([])
    expect(
      detectAll(rule, evidence('"Brand Arabic", serif', [font('Brand Arabic', [LETTERS], [SIGN])])),
    ).toEqual([])
  })

  it('applies only to a page with the sign', () => {
    expect(applies(rule, evidence('serif', []))).toBe(true)
    expect(applies(rule, renderedEvidence([renderedFacts('chromium')]))).toBe(false)
  })
})
