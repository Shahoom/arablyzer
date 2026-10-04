import type { WebFontFileFact } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, renderedEvidence, renderedFacts } from '../../../test/helpers'
import { MIN_SAVED_BYTES, rule, saving } from './rule'

const KB = 1024
const font = (overrides: Partial<WebFontFileFact> = {}): WebFontFileFact => ({
  family: 'Brand Arabic',
  url: 'https://shop.example/fonts/brand-ar.ttf',
  format: 'ttf',
  bytes: 140 * KB,
  weight: '400',
  style: 'normal',
  usedCharacters: 'فلعىاب',
  subsetBytes: 9 * KB,
  unicodeRange: 'U+20,U+30-39,U+627-64A',
  ...overrides,
})
const evidence = (...fonts: WebFontFileFact[]) =>
  renderedEvidence([renderedFacts('chromium', { webFonts: fonts })])

// The browser suite renders the fixtures; here the detector reads the sizes the render measured.
describe('ar-font-subset-savings', () => {
  it('flags a font whose subset is more than half and more than 50 KB smaller', () => {
    const [finding] = detectAll(rule, evidence(font()))
    expect(finding).toMatchObject({
      message: 'oversized',
      values: {
        family: 'Brand Arabic',
        file: 'brand-ar.ttf',
        size: '140 KB',
        subset: '9 KB',
        saved: '131 KB',
        percent: 94,
        savedBytes: 131 * KB,
        characters: 'فلعىاب',
        unicodeRange: 'U+20,U+30-39,U+627-64A',
      },
      key: 'https://shop.example/fonts/brand-ar.ttf',
    })
  })

  it('passes a font that saves too little: under 50 KB, or under half', () => {
    expect(detectAll(rule, evidence(font({ bytes: 56 * KB, subsetBytes: 9 * KB })))).toEqual([])
    expect(detectAll(rule, evidence(font({ bytes: 300 * KB, subsetBytes: 160 * KB })))).toEqual([])
    expect(saving(font({ bytes: MIN_SAVED_BYTES + 4 * KB, subsetBytes: 4 * KB }))).toBeNull()
  })

  it('leaves out a font that has no subset size, and a page with none', () => {
    expect(detectAll(rule, evidence(font({ subsetBytes: null, unicodeRange: null })))).toEqual([])
    expect(applies(rule, evidence())).toBe(false)
    expect(applies(rule, evidence(font({ subsetBytes: null })))).toBe(false)
    expect(applies(rule, evidence(font()))).toBe(true)
  })

  it('reports a font once, with every engine that saw it', () => {
    const found = detectAll(
      rule,
      renderedEvidence([
        renderedFacts('chromium', { webFonts: [font()] }),
        renderedFacts('firefox', { webFonts: [font()] }),
      ]),
    )
    expect(found).toHaveLength(1)
    expect(found[0]?.engines).toEqual(['chromium', 'firefox'])
  })
})
