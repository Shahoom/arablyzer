import type { LookalikeFacts } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence } from '../../../test/helpers'
import type { Evidence } from '../../rule'
import { rule } from './rule'

const facts = (
  found: Extract<LookalikeFacts, { outcome: 'checked' }>['found'],
): LookalikeFacts => ({
  outcome: 'checked',
  domain: 'alwaha.com.sa',
  candidates: 80,
  asked: 80,
  found,
  ct: 'checked',
})
const withFacts = async (lookalikes: LookalikeFacts): Promise<Evidence> => ({
  ...(await fixtureEvidence(rule.id, 'wrong')),
  outside: { lookalikes },
})

describe('lookalike-domains', () => {
  it('names each registered look-alike, the freshest and those with mail first in meaning', async () => {
    const evidence = await withFacts(
      facts([
        {
          domain: 'alwaha.com',
          kind: 'tld',
          address: true,
          mail: true,
          firstSeen: '2026-09-20',
          certificates: 2,
          recent: true,
        },
        {
          domain: 'alwah4.com.sa',
          kind: 'neighbour',
          address: true,
          mail: true,
          firstSeen: '2024-01-10',
          certificates: 1,
          recent: false,
        },
        {
          domain: 'al7waha.com.sa',
          kind: 'arabizi',
          address: true,
          mail: false,
          firstSeen: null,
          certificates: null,
          recent: false,
        },
      ]),
    )
    expect(applies(rule, evidence)).toBe(true)
    const findings = detectAll(rule, evidence)
    expect(findings.map((finding) => finding.message)).toEqual(['fresh', 'mail', 'registered'])
    expect(findings[0]?.values).toMatchObject({
      domain: 'alwaha.com',
      kind: 'tld',
      records: 'A, MX',
      date: '2026-09-20',
      original: 'alwaha.com.sa',
    })
    expect(findings[2]?.values).toMatchObject({ records: 'A' })
  })

  it('passes when none is registered, and does not apply without the service answering', async () => {
    expect(detectAll(rule, await withFacts(facts([])))).toEqual([])
    const bare = await fixtureEvidence(rule.id, 'right')
    expect(applies(rule, bare)).toBe(false)
    expect(
      applies(rule, {
        ...bare,
        outside: { lookalikes: { outcome: 'failed', domain: 'x.com', candidates: 5 } },
      }),
    ).toBe(false)
  })
})
