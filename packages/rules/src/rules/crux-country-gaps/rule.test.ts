import type { CruxCountriesFacts, CruxCountry } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence } from '../../../test/helpers'
import type { Evidence } from '../../rule'
import { rule } from './rule'

const country = (
  code: CruxCountry['country'],
  lcp: number | null,
  inp: number | null,
  cls: number | null,
  found = true,
): CruxCountry => ({ country: code, found, good: { lcp, inp, cls }, rank: null })
const facts = (countries: CruxCountry[]): CruxCountriesFacts => ({
  outcome: 'checked',
  origin: 'https://alwaha.com.sa',
  month: '202609',
  bytes: 1000,
  countries,
})
const withFacts = async (value: CruxCountriesFacts): Promise<Evidence> => ({
  ...(await fixtureEvidence(rule.id, 'wrong')),
  outside: { cruxCountries: value },
})

describe('crux-country-gaps', () => {
  it('names the countries whose good share is under 75%, for each metric', async () => {
    const evidence = await withFacts(
      facts([
        country('SA', 0.9, 0.95, 0.99),
        country('EG', 0.62, 0.8, 0.5),
        country('MA', 0.4, 0.9, 0.7),
        country('KW', null, null, null),
        country('QA', 0.1, 0.1, 0.1, false),
      ]),
    )
    expect(applies(rule, evidence)).toBe(true)
    const findings = detectAll(rule, evidence)
    expect(findings.map((finding) => finding.message)).toEqual(['lcp', 'cls'])
    expect(findings[0]?.values).toEqual({ countries: 'EG 62%, MA 40%', count: 2, month: '202609' })
    expect(findings[1]?.values).toMatchObject({ countries: 'EG 50%, MA 70%' })
  })

  it('passes when every country is good, and does not apply with no data or no answer', async () => {
    expect(detectAll(rule, await withFacts(facts([country('SA', 0.8, 0.8, 0.8)])))).toEqual([])
    expect(applies(rule, await withFacts(facts([country('SA', 0.8, 0.8, 0.8, false)])))).toBe(false)
    expect(applies(rule, await withFacts({ outcome: 'failed' }))).toBe(false)
    expect(applies(rule, await withFacts({ outcome: 'too-big', bytes: 5, cap: 1 }))).toBe(false)
    expect(applies(rule, await fixtureEvidence(rule.id, 'right'))).toBe(false)
  })
})
