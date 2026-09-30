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

const node = axeNode('#product', { snippet: '<img id="product" src="/oud.png">' })

describe('a11y-image-alt', () => {
  it('reports the images without a text alternative axe found, once for all engines', () => {
    const found = axeRule('image-alt', { violations: [node] })
    const evidence = renderedEvidence([withAxe('chromium', found), withAxe('firefox', found)])
    expect(applies(rule, evidence)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'missing',
        selector: '#product',
        snippet: '<img id="product" src="/oud.png">',
        engines: ['chromium', 'firefox'],
      },
    ])
  })

  it('passes when axe found none, and names only the engines that found one', () => {
    const clean = renderedEvidence([withAxe('chromium', axeRule('image-alt'))])
    expect(applies(rule, clean)).toBe(true)
    expect(detectAll(rule, clean)).toEqual([])
    const one = renderedEvidence([
      withAxe('chromium', axeRule('image-alt')),
      withAxe('firefox', axeRule('image-alt', { violations: [node] })),
    ])
    expect(detectAll(rule, one)).toMatchObject([{ engines: ['firefox'] }])
  })

  it('does not apply to pages without images, or where axe did not run', () => {
    expect(
      applies(
        rule,
        renderedEvidence([withAxe('chromium', axeRule('image-alt', { applicable: false }))]),
      ),
    ).toBe(false)
    expect(applies(rule, renderedEvidence([renderedFacts('chromium')]))).toBe(false)
    expect(applies(rule, renderedEvidence([]))).toBe(false)
  })
})
