import { describe, expect, it } from 'vitest'
import {
  applies,
  axeNode,
  axeRule,
  detectAll,
  renderedEvidence,
  renderedFacts,
  withAxe,
} from '../../../test/helpers'
import { rule } from './rule'

describe('a11y-color-contrast-review', () => {
  it('asks for review of text axe could not measure, by the reason axe gives', () => {
    const evidence = renderedEvidence([
      withAxe(
        'chromium',
        axeRule('color-contrast', {
          incomplete: [
            axeNode('#banner', { reason: 'bgImage' }),
            axeNode('#hero', { reason: 'bgGradient' }),
            axeNode('#card', { reason: 'bgOverlap' }),
            axeNode('#tiny', { reason: 'shortTextContent' }),
            axeNode('#odd', { reason: null }),
          ],
        }),
      ),
    ])
    expect(rule.manualCheck).toBe(true)
    expect(applies(rule, evidence)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [
        finding.selector,
        finding.message,
        finding.values,
      ]),
    ).toEqual([
      ['#banner', 'image', undefined],
      ['#hero', 'gradient', undefined],
      ['#card', 'overlap', undefined],
      ['#tiny', 'other', { reason: 'shortTextContent' }],
      ['#odd', 'other', { reason: 'unknown' }],
    ])
  })

  it('does not apply when axe decided on every text', () => {
    const decided = axeRule('color-contrast', { violations: [axeNode('#note')] })
    expect(applies(rule, renderedEvidence([withAxe('chromium', decided)]))).toBe(false)
    expect(applies(rule, renderedEvidence([renderedFacts('chromium')]))).toBe(false)
  })
})
