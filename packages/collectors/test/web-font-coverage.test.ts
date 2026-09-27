import { describe, expect, it } from 'vitest'
import { ALL_CODE_POINTS, type CodePointRange } from '../src/code-points'
import type { FontFaceFact } from '../src/rendered'
import type { FontFaceRule } from '../src/stylesheet'
import { webFontCoverage } from '../src/web-font-coverage'

const face = (overrides: Partial<FontFaceFact> = {}): FontFaceFact => ({
  family: 'Brand',
  status: 'loaded',
  weight: '400',
  style: 'normal',
  unicodeRange: 'U+0-10FFFF',
  ...overrides,
})

const rule = (
  urls: readonly string[],
  unicodeRange: readonly CodePointRange[] = ALL_CODE_POINTS,
  family = 'Brand',
): FontFaceRule => ({
  family,
  sources: urls.map((url) => ({ kind: 'url', url })),
  unicodeRange,
})

/** Latin, the Arabic letters, and Arabic-Indic digits: no ڤ (U+06A4). */
const FILE: readonly CodePointRange[] = [
  [0x20, 0x7e],
  [0x621, 0x64a],
  [0x660, 0x669],
]

describe('webFontCoverage', () => {
  it('gives a family the Arabic code points of the file its face loaded', () => {
    const coverage = webFontCoverage(
      [face()],
      [rule(['https://example.com/brand.woff2'])],
      new Map([['https://example.com/brand.woff2', FILE]]),
    )
    expect(coverage).toEqual([
      {
        family: 'Brand',
        covered: [
          [0x621, 0x64a],
          [0x660, 0x669],
        ],
        unknown: [],
      },
    ])
  })

  it('pairs faces and rules by unicode-range, and keeps each file within its range', () => {
    const arabic: CodePointRange[] = [[0x600, 0x6ff]]
    const coverage = webFontCoverage(
      [
        face({ unicodeRange: 'U+600-6FF' }),
        face({ unicodeRange: 'U+0-FF', status: 'unloaded' }),
        face({ family: 'brand', unicodeRange: 'U+750-77F', status: 'unloaded' }),
      ],
      [
        rule(['https://example.com/latin.woff2'], [[0, 0xff]]),
        rule(['https://example.com/arabic.woff2'], arabic),
        rule(['https://example.com/supplement.woff2'], [[0x750, 0x77f]]),
      ],
      new Map([
        [
          'https://example.com/arabic.woff2',
          [
            [0x600, 0x6ff],
            [0xfe70, 0xfeff],
          ] as const,
        ],
      ]),
    )
    // Presentation forms in the file are outside the face's range; an unloaded face draws nothing.
    expect(coverage).toEqual([{ family: 'Brand', covered: arabic, unknown: [] }])
  })

  it('passes over sources that never loaded, as the browser does', () => {
    const coverage = webFontCoverage(
      [face()],
      [rule(['https://example.com/brand.woff2', 'https://example.com/brand.woff'])],
      new Map([['https://example.com/brand.woff', FILE]]),
    )
    expect(coverage[0]?.covered).toEqual([
      [0x621, 0x64a],
      [0x660, 0x669],
    ])
  })

  it('leaves a range unknown when its file could not be read or its face did not finish', () => {
    const unread = webFontCoverage(
      [face()],
      [rule(['https://example.com/brand.woff2'])],
      new Map([['https://example.com/brand.woff2', null]]),
    )
    expect(unread[0]).toMatchObject({
      covered: [],
      unknown: [
        [0x600, 0x6ff],
        [0x750, 0x77f],
        [0x870, 0x8ff],
        [0xfb50, 0xfdff],
        [0xfe70, 0xfeff],
      ],
    })
    for (const status of ['loading', 'error'] as const) {
      const pending = webFontCoverage(
        [face({ status, unicodeRange: 'U+600-6FF' })],
        [rule(['https://example.com/brand.woff2'], [[0x600, 0x6ff]])],
        new Map(),
      )
      expect(pending[0]).toMatchObject({ covered: [], unknown: [[0x600, 0x6ff]] })
    }
  })

  it('leaves a range unknown when a loaded face has no rule Arablyzer read', () => {
    // Two weights loaded; the stylesheet with the bold one could not be read.
    const coverage = webFontCoverage(
      [face({ unicodeRange: 'U+600-6FF' }), face({ weight: '700', unicodeRange: 'U+600-6FF' })],
      [rule(['https://example.com/regular.woff2'], [[0x600, 0x6ff]])],
      new Map([['https://example.com/regular.woff2', FILE]]),
    )
    expect(coverage[0]).toMatchObject({
      covered: [
        [0x621, 0x64a],
        [0x660, 0x669],
      ],
      unknown: [[0x600, 0x6ff]],
    })
  })

  it('reads fonts inlined in the stylesheet', () => {
    const coverage = webFontCoverage(
      [face()],
      [
        {
          family: 'Brand',
          sources: [{ kind: 'data', coverage: FILE }],
          unicodeRange: ALL_CODE_POINTS,
        },
      ],
      new Map(),
    )
    expect(coverage[0]?.covered).toHaveLength(2)
  })
})
