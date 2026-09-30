import { collectPage, type PageFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { evaluatePage } from '../src/index'
import { flagRule, testRule } from './helpers'

const page = (html: string): PageFacts =>
  collectPage({
    url: 'https://example.com/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(html),
  })

describe('evaluatePage', () => {
  it('runs rules on collected facts, without the network, as a scan does', () => {
    const { results, findings } = evaluatePage(
      page('<html lang="ar"><head><meta name="flag" content="x"></head><body>نص</body></html>'),
      { rules: [testRule({ id: 'quiet-rule', detect: () => [] }), flagRule()] },
    )
    expect(results.map((result) => [result.id, result.status])).toEqual([
      ['quiet-rule', 'pass'],
      ['test-rule', 'fail'],
    ])
    expect(findings.map((finding) => [finding.ruleId, finding.message.en])).toEqual([
      ['test-rule', 'Found x'],
    ])
  })

  it('reports rules that need robots.txt as errors when it is not given', () => {
    const robotsRule = testRule({ id: 'robots-rule', needs: ['robots'], detect: () => [] })
    const { results } = evaluatePage(page('<p>x</p>'), { rules: [robotsRule] })
    expect(results[0]).toMatchObject({ status: 'error', error: 'robots-unchecked' })
  })

  it('selects rules by id, like scan', () => {
    const rules = [flagRule(), testRule({ id: 'other-rule', detect: () => [] })]
    expect(
      evaluatePage(page('<p>x</p>'), { rules, ruleIds: ['other-rule'] }).results.map(
        (result) => result.id,
      ),
    ).toEqual(['other-rule'])
    expect(() => evaluatePage(page('<p>x</p>'), { rules, ruleIds: ['nope'] })).toThrow(TypeError)
  })
})
