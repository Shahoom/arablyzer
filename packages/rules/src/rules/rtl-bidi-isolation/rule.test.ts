import type { BidiTokenFact } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, renderedEvidence, renderedFacts } from '../../../test/helpers'
import { rule } from './rule'

// The browser suite renders the wrong and right fixtures in every engine; here the detector
// reads facts as engines report them.
const token = (overrides: Partial<BidiTokenFact> = {}): BidiTokenFact => ({
  selector: 'p:nth-of-type(1)',
  box: { x: 120, y: 90, width: 140, height: 20 },
  text: '+966 50 123 4567',
  kind: 'number',
  ...overrides,
})
const phone = token()
const code = token({ selector: 'p:nth-of-type(2)', text: 'C++', kind: 'latin' })

describe('rtl-bidi-isolation', () => {
  it('fires on each number or Latin word drawn out of order, with the text as the snippet', () => {
    const findings = detectAll(
      rule,
      renderedEvidence([renderedFacts('chromium', { bidi: [phone, code] })]),
    )
    expect(findings).toEqual([
      {
        message: 'number',
        values: { text: '+966 50 123 4567' },
        selector: 'p:nth-of-type(1)',
        snippet: '+966 50 123 4567',
        engines: ['chromium'],
        box: phone.box,
        key: '+966 50 123 4567',
      },
      {
        message: 'latin',
        values: { text: 'C++' },
        selector: 'p:nth-of-type(2)',
        snippet: 'C++',
        engines: ['chromium'],
        box: code.box,
        key: 'C++',
      },
    ])
  })

  it('reports a token once across engines, and two tokens of one element apart', () => {
    const second = token({ text: '٠٥٠ ١٢٣ ٤٥٦٧' })
    const findings = detectAll(
      rule,
      renderedEvidence([
        renderedFacts('chromium', { bidi: [phone] }),
        renderedFacts('firefox', { bidi: [phone, second] }),
      ]),
    )
    expect(findings.map((finding) => [finding.snippet, finding.engines])).toEqual([
      ['+966 50 123 4567', ['chromium', 'firefox']],
      ['٠٥٠ ١٢٣ ٤٥٦٧', ['firefox']],
    ])
  })

  it('passes a page whose numbers and Latin words are drawn in order', () => {
    expect(detectAll(rule, renderedEvidence([renderedFacts('chromium')]))).toEqual([])
  })

  it('applies to pages rendered right to left, or with Arabic text', () => {
    expect(applies(rule, renderedEvidence([renderedFacts('chromium')]))).toBe(true)
    expect(
      applies(rule, renderedEvidence([renderedFacts('chromium', { dir: 'rtl', arabicText: [] })])),
    ).toBe(true)
    expect(
      applies(rule, renderedEvidence([renderedFacts('chromium', { dir: 'ltr', arabicText: [] })])),
    ).toBe(false)
  })
})
