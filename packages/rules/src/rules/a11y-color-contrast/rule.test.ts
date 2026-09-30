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

const low = axeNode('#note', {
  snippet: '<p id="note" style="color: #999999">',
  contrast: { foreground: '#999999', background: '#ffffff', ratio: 2.85, expected: 4.5 },
})

describe('a11y-color-contrast', () => {
  it('reports text below the contrast WCAG asks for, with what axe measured', () => {
    const evidence = renderedEvidence([
      withAxe('chromium', axeRule('color-contrast', { violations: [low] })),
    ])
    expect(applies(rule, evidence)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'low',
        values: { ratio: 2.85, expected: 4.5, foreground: '#999999', background: '#ffffff' },
        selector: '#note',
        snippet: '<p id="note" style="color: #999999">',
        engines: ['chromium'],
      },
    ])
  })

  it('leaves what axe could not decide to a11y-color-contrast-review', () => {
    const undecided = axeNode('#banner', { reason: 'bgImage' })
    const evidence = renderedEvidence([
      withAxe('chromium', axeRule('color-contrast', { incomplete: [undecided] })),
    ])
    expect(applies(rule, evidence)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('does not apply without text, or where axe did not run', () => {
    expect(
      applies(
        rule,
        renderedEvidence([withAxe('chromium', axeRule('color-contrast', { applicable: false }))]),
      ),
    ).toBe(false)
    expect(applies(rule, renderedEvidence([renderedFacts('chromium')]))).toBe(false)
  })
})
