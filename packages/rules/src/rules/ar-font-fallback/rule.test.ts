import type { FontFaceFact } from '@arablyzer/collectors'
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
// reads facts as engines report them.
const face = (status: FontFaceFact['status'], overrides: Partial<FontFaceFact> = {}) => ({
  family: 'Brand Arabic',
  status,
  weight: '400',
  style: 'normal',
  unicodeRange: 'U+0-10FFFF',
  ...overrides,
})
const branded = arabicBlock({
  fontFamily: '"Brand Arabic", sans-serif',
  primaryFamily: 'Brand Arabic',
})
const ARABIC_SUBSET = 'U+0600-06FF, U+200C-200E'
const LATIN_SUBSET = 'U+0000-00FF, U+2000-206F'

describe('ar-font-fallback', () => {
  it('fires when the web font set first for Arabic text did not load', () => {
    const findings = detectAll(
      rule,
      renderedEvidence([
        renderedFacts('chromium', { arabicText: [branded], fontFaces: [face('error')] }),
        renderedFacts('firefox', { arabicText: [branded], fontFaces: [face('error')] }),
      ]),
    )
    expect(findings).toEqual([
      {
        message: 'failed',
        values: { family: 'Brand Arabic' },
        selector: '#a',
        engines: ['chromium', 'firefox'],
        box: branded.box,
      },
    ])
  })

  it('reports a font once, at the first element that uses it', () => {
    const heading = { ...branded, selector: 'h1' }
    const findings = detectAll(
      rule,
      renderedEvidence([
        renderedFacts('chromium', { arabicText: [heading, branded], fontFaces: [face('error')] }),
      ]),
    )
    expect(findings.map((finding) => finding.selector)).toEqual(['h1'])
  })

  it('reads a font in subsets by the subset that holds the Arabic letters', () => {
    const run = (arabic: FontFaceFact['status'], latin: FontFaceFact['status']) =>
      detectAll(
        rule,
        renderedEvidence([
          renderedFacts('chromium', {
            arabicText: [branded],
            fontFaces: [
              face(latin, { unicodeRange: LATIN_SUBSET }),
              face(arabic, { unicodeRange: ARABIC_SUBSET }),
            ],
          }),
        ]),
      ).length
    expect(run('error', 'loaded')).toBe(1)
    expect(run('loaded', 'error')).toBe(0)
  })

  it('does not fire while a face that covers Arabic loaded, or none has failed yet', () => {
    const faces = (...list: FontFaceFact[]) =>
      detectAll(
        rule,
        renderedEvidence([renderedFacts('chromium', { arabicText: [branded], fontFaces: list })]),
      )
    expect(faces(face('error', { weight: '700' }), face('loaded'))).toEqual([])
    expect(faces(face('loading'))).toEqual([])
    expect(faces(face('unloaded'))).toEqual([])
  })

  it('leaves fonts without Arabic letters to ar-font-no-arabic', () => {
    expect(
      detectAll(
        rule,
        renderedEvidence([
          renderedFacts('chromium', {
            arabicText: [branded],
            fontFaces: [face('error', { unicodeRange: LATIN_SUBSET })],
          }),
        ]),
      ),
    ).toEqual([])
  })

  it('stays silent when the egress proxy refused a font: the failure would be ours', () => {
    expect(
      detectAll(
        rule,
        renderedEvidence([
          renderedFacts('chromium', {
            arabicText: [branded],
            fontFaces: [face('error')],
            fontRequests: [{ url: 'http://fonts.test/brand.woff2', status: null, refused: true }],
          }),
        ]),
      ),
    ).toEqual([])
  })

  it('matches family names without regard to case', () => {
    expect(
      detectAll(
        rule,
        renderedEvidence([
          renderedFacts('chromium', {
            arabicText: [branded],
            fontFaces: [face('error', { family: 'brand ARABIC' })],
          }),
        ]),
      ),
    ).toHaveLength(1)
  })

  it('applies when Arabic text is set in a web font first', () => {
    expect(
      applies(
        rule,
        renderedEvidence([
          renderedFacts('chromium', { arabicText: [branded], fontFaces: [face('loaded')] }),
        ]),
      ),
    ).toBe(true)
    expect(
      applies(rule, renderedEvidence([renderedFacts('chromium', { fontFaces: [face('loaded')] })])),
    ).toBe(false)
  })
})
