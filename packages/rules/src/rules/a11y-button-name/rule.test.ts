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

const node = axeNode('#wishlist', { snippet: '<button id="wishlist" type="button">' })

describe('a11y-button-name', () => {
  it('reports the buttons without an accessible name axe found, once for all engines', () => {
    const found = axeRule('button-name', { violations: [node] })
    const evidence = renderedEvidence([withAxe('chromium', found), withAxe('firefox', found)])
    expect(applies(rule, evidence)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'missing',
        selector: '#wishlist',
        snippet: '<button id="wishlist" type="button">',
        engines: ['chromium', 'firefox'],
      },
    ])
  })

  it('passes when axe found none, and names only the engines that found one', () => {
    const clean = renderedEvidence([withAxe('chromium', axeRule('button-name'))])
    expect(applies(rule, clean)).toBe(true)
    expect(detectAll(rule, clean)).toEqual([])
    const one = renderedEvidence([
      withAxe('chromium', axeRule('button-name')),
      withAxe('firefox', axeRule('button-name', { violations: [node] })),
    ])
    expect(detectAll(rule, one)).toMatchObject([{ engines: ['firefox'] }])
  })

  it('does not apply to pages without buttons, or where axe did not run', () => {
    expect(
      applies(
        rule,
        renderedEvidence([withAxe('chromium', axeRule('button-name', { applicable: false }))]),
      ),
    ).toBe(false)
    expect(applies(rule, renderedEvidence([renderedFacts('chromium')]))).toBe(false)
    expect(applies(rule, renderedEvidence([]))).toBe(false)
  })
})
