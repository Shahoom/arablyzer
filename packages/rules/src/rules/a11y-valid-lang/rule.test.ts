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

const node = axeNode('#pay', { snippet: '<span id="pay" lang="english">' })

describe('a11y-valid-lang', () => {
  it('reports the lang attributes that name no language axe found, once for all engines', () => {
    const found = axeRule('valid-lang', { violations: [node] })
    const evidence = renderedEvidence([withAxe('chromium', found), withAxe('firefox', found)])
    expect(applies(rule, evidence)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'invalid',
        selector: '#pay',
        snippet: '<span id="pay" lang="english">',
        engines: ['chromium', 'firefox'],
      },
    ])
  })

  it('passes when axe found none, and names only the engines that found one', () => {
    const clean = renderedEvidence([withAxe('chromium', axeRule('valid-lang'))])
    expect(applies(rule, clean)).toBe(true)
    expect(detectAll(rule, clean)).toEqual([])
    const one = renderedEvidence([
      withAxe('chromium', axeRule('valid-lang')),
      withAxe('firefox', axeRule('valid-lang', { violations: [node] })),
    ])
    expect(detectAll(rule, one)).toMatchObject([{ engines: ['firefox'] }])
  })

  it('does not apply to pages without lang attributes inside it, or where axe did not run', () => {
    expect(
      applies(
        rule,
        renderedEvidence([withAxe('chromium', axeRule('valid-lang', { applicable: false }))]),
      ),
    ).toBe(false)
    expect(applies(rule, renderedEvidence([renderedFacts('chromium')]))).toBe(false)
    expect(applies(rule, renderedEvidence([]))).toBe(false)
  })
})
