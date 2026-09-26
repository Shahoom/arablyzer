import type { FontFaceFact, UsedFont } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import {
  applies,
  arabicBlock,
  detectAll,
  renderedEvidence,
  renderedFacts,
} from '../../../test/helpers'
import { rule } from './rule'

// The browser suite renders the wrong and right fixtures in Chromium; here the detector reads
// facts as Chromium reports them.
const LIST = '"Brand Latin", sans-serif'
const block = arabicBlock({ fontFamily: LIST, primaryFamily: 'Brand Latin' })
const latinFace: FontFaceFact = {
  family: 'Brand Latin',
  status: 'loaded',
  weight: '400',
  style: 'normal',
  unicodeRange: 'U+0-10FFFF',
}
const web = (family: string, glyphs = 28): UsedFont => ({ family, custom: true, glyphs })
const system = (family: string, glyphs = 28): UsedFont => ({ family, custom: false, glyphs })

function evidence(fonts: readonly UsedFont[], overrides: Parameters<typeof renderedFacts>[1] = {}) {
  return renderedEvidence([
    renderedFacts('chromium', {
      arabicText: [block],
      fontFaces: [latinFace],
      usedFonts: [{ fontFamily: LIST, fonts }],
      ...overrides,
    }),
  ])
}

describe('ar-font-no-arabic', () => {
  it('reads Chromium alone, which reports the fonts that drew a text', () => {
    expect(rule.renderEngines).toEqual(['chromium'])
  })

  it('fires when no web font drew the Arabic letters', () => {
    expect(detectAll(rule, evidence([system('DejaVu Sans')]))).toEqual([
      {
        message: 'none',
        values: { family: 'Brand Latin' },
        selector: '#a',
        engines: ['chromium'],
        box: block.box,
      },
    ])
  })

  it('fires when the web font drew only some of them', () => {
    expect(
      detectAll(rule, evidence([web('Brand Latin', 20), system('DejaVu Sans', 8)])),
    ).toMatchObject([{ message: 'partial', values: { family: 'Brand Latin' } }])
  })

  it('passes when web fonts drew every Arabic letter, the second family in the list included', () => {
    expect(detectAll(rule, evidence([web('Brand Arabic')]))).toEqual([])
  })

  it('leaves a font that did not load to ar-font-fallback', () => {
    expect(
      detectAll(
        rule,
        evidence([system('DejaVu Sans')], { fontFaces: [{ ...latinFace, status: 'error' }] }),
      ),
    ).toEqual([])
  })

  it('reports each font-family list once, at the first element set in it', () => {
    const heading = { ...block, selector: 'h1' }
    expect(
      detectAll(rule, evidence([system('DejaVu Sans')], { arabicText: [heading, block] })).map(
        (finding) => finding.selector,
      ),
    ).toEqual(['h1'])
  })

  it('applies when Chromium measured the fonts of Arabic text set in a web font', () => {
    expect(applies(rule, evidence([web('Brand Arabic')]))).toBe(true)
    expect(applies(rule, renderedEvidence([renderedFacts('chromium')]))).toBe(false)
  })
})
