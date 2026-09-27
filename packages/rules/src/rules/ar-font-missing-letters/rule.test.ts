import type {
  CodePointRange,
  FontFaceFact,
  RenderedFacts,
  WebFontCoverageFact,
} from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import {
  applies,
  arabicBlock,
  detectAll,
  renderedEvidence,
  renderedFacts,
} from '../../../test/helpers'
import { rule } from './rule'

// The browser suite renders the wrong and right fixtures in every engine; here the detector
// reads the coverage the render worked out from the font files.
const LIST = '"Brand Arabic", serif'
const TEXT = 'كل ڤيلا فيها ٣ غرف نوم.'
const block = arabicBlock({ text: TEXT, fontFamily: LIST, primaryFamily: 'Brand Arabic' })

const face = (family: string, overrides: Partial<FontFaceFact> = {}): FontFaceFact => ({
  family,
  status: 'loaded',
  weight: '400',
  style: 'normal',
  unicodeRange: 'U+0-10FFFF',
  ...overrides,
})

/** The Arabic letters and punctuation, without «ڤ» (U+06A4) or the Arabic-Indic digits. */
const PARTIAL: readonly CodePointRange[] = [
  [0x60c, 0x60c],
  [0x621, 0x64a],
]
const WHOLE: readonly CodePointRange[] = [[0x600, 0x6ff]]

const coverage = (
  family: string,
  covered: readonly CodePointRange[],
  unknown: readonly CodePointRange[] = [],
): WebFontCoverageFact => ({ family, covered, unknown })

function facts(
  engine: RenderedFacts['engine'],
  fonts: readonly WebFontCoverageFact[],
  overrides: Partial<RenderedFacts> = {},
): RenderedFacts {
  return renderedFacts(engine, {
    arabicText: [block],
    fontFaces: fonts.map((font) => face(font.family)),
    arabicFontCoverage: fonts,
    ...overrides,
  })
}

describe('ar-font-missing-letters', () => {
  it('fires when the web font set for Arabic text lacks characters the text uses', () => {
    expect(
      detectAll(rule, renderedEvidence([facts('chromium', [coverage('Brand Arabic', PARTIAL)])])),
    ).toEqual([
      {
        message: 'missing',
        values: { family: 'Brand Arabic', characters: '«٣» «ڤ»', count: 2 },
        selector: '#a',
        engines: ['chromium'],
        box: block.box,
        key: 'brand arabic',
      },
    ])
  })

  it('passes when the web fonts in the list draw every character, a later one included', () => {
    expect(
      detectAll(rule, renderedEvidence([facts('firefox', [coverage('Brand Arabic', WHOLE)])])),
    ).toEqual([])
    const extra = arabicBlock({ text: TEXT, fontFamily: '"Brand Arabic", "Brand Extra", serif' })
    expect(
      detectAll(
        rule,
        renderedEvidence([
          facts('firefox', [coverage('Brand Arabic', PARTIAL), coverage('Brand Extra', WHOLE)], {
            arabicText: [extra],
          }),
        ]),
      ),
    ).toEqual([])
  })

  it('reports each web font once, with every character it lacks, where it first lacks one', () => {
    const digits = arabicBlock({ selector: '#b', text: 'الدور ٥', fontFamily: LIST })
    const findings = detectAll(
      rule,
      renderedEvidence([
        facts('chromium', [coverage('Brand Arabic', PARTIAL)], { arabicText: [block, digits] }),
        facts('firefox', [coverage('Brand Arabic', PARTIAL)], { arabicText: [digits] }),
      ]),
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      values: { characters: '«٣» «٥» «ڤ»', count: 3 },
      selector: '#a',
      engines: ['chromium', 'firefox'],
    })
  })

  it('says nothing about characters whose font file could not be read', () => {
    const unread = coverage('Brand Arabic', PARTIAL, [[0x660, 0x6ff]])
    expect(detectAll(rule, renderedEvidence([facts('chromium', [unread])]))).toEqual([])
    // A family the page may declare past the faces measured.
    const other = arabicBlock({ text: TEXT, fontFamily: '"Brand Arabic", "Unlisted", serif' })
    expect(
      detectAll(
        rule,
        renderedEvidence([
          facts('chromium', [coverage('Brand Arabic', PARTIAL)], {
            arabicText: [other],
            fontFacesOmitted: 3,
          }),
        ]),
      ),
    ).toEqual([])
  })

  it('leaves text whose Arabic letters another font draws to ar-font-no-arabic', () => {
    const latin = coverage('Brand Latin', [])
    const latinText = arabicBlock({ text: TEXT, fontFamily: '"Brand Latin", serif' })
    expect(
      detectAll(rule, renderedEvidence([facts('chromium', [latin], { arabicText: [latinText] })])),
    ).toEqual([])
    // A web font that has some Arabic letters only.
    const some = coverage('Brand Arabic', [[0x627, 0x62a]])
    expect(detectAll(rule, renderedEvidence([facts('chromium', [some])]))).toEqual([])
  })

  it('reads the Arabic font past a Latin web font first in the list', () => {
    const second = arabicBlock({ text: TEXT, fontFamily: 'Poppins, "Brand Arabic", sans-serif' })
    expect(
      detectAll(
        rule,
        renderedEvidence([
          facts('chromium', [coverage('Poppins', []), coverage('Brand Arabic', PARTIAL)], {
            arabicText: [second],
          }),
        ]),
      ),
    ).toMatchObject([{ values: { family: 'Brand Arabic', characters: '«٣» «ڤ»' } }])
  })

  it('shows marks on a dotted circle and at most ten characters', () => {
    const marked = arabicBlock({ text: 'كَتَبَ', fontFamily: LIST })
    expect(
      detectAll(
        rule,
        renderedEvidence([
          facts('chromium', [coverage('Brand Arabic', PARTIAL)], { arabicText: [marked] }),
        ]),
      ),
    ).toMatchObject([{ values: { characters: '«◌َ»', count: 1 } }])
    const many = arabicBlock({ text: 'مرحبا ٠١٢٣٤٥٦٧٨٩ڤ', fontFamily: LIST })
    const [finding] = detectAll(
      rule,
      renderedEvidence([
        facts('chromium', [coverage('Brand Arabic', PARTIAL)], { arabicText: [many] }),
      ]),
    )
    expect(finding?.values).toEqual({
      family: 'Brand Arabic',
      characters: '«٠» «١» «٢» «٣» «٤» «٥» «٦» «٧» «٨» «٩» …',
      count: 11,
    })
  })

  it('applies when a web font draws some Arabic text', () => {
    expect(
      applies(rule, renderedEvidence([facts('chromium', [coverage('Brand Arabic', PARTIAL)])])),
    ).toBe(true)
    expect(applies(rule, renderedEvidence([facts('chromium', [])]))).toBe(false)
    expect(
      applies(rule, renderedEvidence([facts('chromium', [coverage('Brand Latin', [])])])),
    ).toBe(false)
  })
})
