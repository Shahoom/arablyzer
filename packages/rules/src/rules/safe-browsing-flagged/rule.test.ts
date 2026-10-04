import type { SafeBrowsingFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = evidenceOf(htmlPage('<p>نص عربي</p>'))
const withFacts = (facts: SafeBrowsingFacts) => ({ ...page, safeBrowsing: facts })

describe('safe-browsing-flagged', () => {
  it('fires for the threat Google lists, with the address it listed', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      {
        message: 'malware',
        values: { url: 'http://fixture.test/' },
        key: 'MALWARE',
      },
    ])
  })

  it('has a finding for each type listed, in a fixed order', async () => {
    expect(
      detectAll(rule, await fixtureEvidence(rule.id, 'wrong-phishing')).map((f) => f.message),
    ).toEqual(['social-engineering', 'unwanted-software'])
  })

  it('passes a page Google does not list', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('applies only when Safe Browsing answered', () => {
    expect(applies(rule, page)).toBe(false)
    expect(applies(rule, withFacts({ outcome: 'clean', threats: [] }))).toBe(true)
    expect(
      applies(rule, withFacts({ outcome: 'flagged', threats: [{ type: 'MALWARE', url: 'x' }] })),
    ).toBe(true)
  })
})
