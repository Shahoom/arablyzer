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

const node = axeNode('#email', { snippet: '<input id="email" name="email" type="email">' })

describe('form-label-missing', () => {
  it('reports the form fields without a label axe found, once for all engines', () => {
    const found = axeRule('label', { violations: [node] })
    const evidence = renderedEvidence([withAxe('chromium', found), withAxe('firefox', found)])
    expect(applies(rule, evidence)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      {
        message: 'missing',
        selector: '#email',
        snippet: '<input id="email" name="email" type="email">',
        engines: ['chromium', 'firefox'],
      },
    ])
  })

  it('passes when axe found none, and names only the engines that found one', () => {
    const clean = renderedEvidence([withAxe('chromium', axeRule('label'))])
    expect(applies(rule, clean)).toBe(true)
    expect(detectAll(rule, clean)).toEqual([])
    const one = renderedEvidence([
      withAxe('chromium', axeRule('label')),
      withAxe('firefox', axeRule('label', { violations: [node] })),
    ])
    expect(detectAll(rule, one)).toMatchObject([{ engines: ['firefox'] }])
  })

  it('does not apply to pages without form fields, or where axe did not run', () => {
    expect(
      applies(
        rule,
        renderedEvidence([withAxe('chromium', axeRule('label', { applicable: false }))]),
      ),
    ).toBe(false)
    expect(applies(rule, renderedEvidence([renderedFacts('chromium')]))).toBe(false)
    expect(applies(rule, renderedEvidence([]))).toBe(false)
  })
})
