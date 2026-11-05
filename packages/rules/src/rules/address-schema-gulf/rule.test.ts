import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, ldPage } from '../../../test/helpers'
import { rule } from './rule'

const address = (country: string | null, postalCode: string | null) => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'متجر الواحة',
  address: {
    '@type': 'PostalAddress',
    ...(postalCode === null ? {} : { postalCode }),
    ...(country === null ? {} : { addressCountry: country }),
  },
})
const found = (country: string | null, postalCode: string | null) =>
  detectAll(rule, evidenceOf(ldPage(address(country, postalCode)))).map(
    (finding) => finding.message,
  )

describe('address-schema-gulf', () => {
  it('fails the wrong fixture: a country by name, and an Omani postal code of four digits', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'country-code',
      'postal-shape',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['SA', '12345', []],
    ['SA', '12345-6789', []],
    ['SA', '1234', ['postal-shape']],
    ['KW', '12345', []],
    ['KW', '123456', ['postal-shape']],
    ['OM', '112', []],
    ['OM', '1122', ['postal-shape']],
    ['BH', '317', []],
    ['BH', '1216', []],
    ['BH', '12345', ['postal-shape']],
    ['AE', '00000', []],
    ['QA', '12345', []],
    ['SA', '١٢٣٤٥', ['postal-digits']],
    [null, '١٢٣٤٥', ['postal-digits']],
    ['السعودية', '12345', ['country-code']],
    ['United Arab Emirates', null, ['country-code']],
    ['sa', '12345', ['country-code']],
    [null, null, []],
    ['SA', null, []],
  ] as const)('country %s, postal code %s gives %j', (country, postalCode, expected) => {
    expect(found(country, postalCode)).toEqual(expected)
  })

  it('does not apply to a page with no postal address', () => {
    expect(
      rule.appliesTo(
        ldPage({ '@context': 'https://schema.org', '@type': 'Organization', name: 'x' }),
      ),
    ).toBe(false)
  })
})
