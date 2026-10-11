import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, ldPage } from '../../../test/helpers'
import { rule } from './rule'

const business = (extra: Record<string, unknown> = {}) => ({
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: 'متجر الواحة',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'شارع السلطان قابوس',
    addressLocality: 'مسقط',
  },
  ...extra,
})
const messages = (extra: Record<string, unknown> = {}) =>
  detectAll(rule, evidenceOf(ldPage(business(extra)))).map((finding) => finding.message)

describe('local-business-invalid', () => {
  it('fails the wrong fixture: the telephone, the days and times, and the coordinates', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [
        finding.message,
        finding.values?.value ?? finding.values?.telephone,
      ]),
    ).toEqual([
      ['telephone-arabic-digits', '٩٦٨٩١٢٣٤٥٦٧+'],
      ['hours-invalid', 'السبت'],
      ['hours-invalid', 'الأحد'],
      ['hours-invalid', '9:00 ص'],
      ['geo-invalid', '٢٣٫٥٨٨'],
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('wants a name and an address with a street, a locality, a region or a postal code', () => {
    expect(messages()).toEqual([])
    expect(messages({ name: ' ' })).toEqual(['no-name'])
    expect(
      messages({
        name: [
          { '@language': 'ar', '@value': 'متجر' },
          { '@language': 'en', '@value': 'Shop' },
        ],
      }),
    ).toEqual([])
    expect(messages({ address: undefined })).toEqual(['no-address'])
    expect(messages({ address: { '@type': 'PostalAddress', addressCountry: 'OM' } })).toEqual([
      'no-address',
    ])
    expect(messages({ address: 'شارع السلطان قابوس، مسقط' })).toEqual([])
  })

  it('wants a telephone with its country code, in digits 0–9', () => {
    expect(messages({ telephone: '+968 9123 4567' })).toEqual([])
    expect(messages({ telephone: '00968-9123-4567' })).toEqual([])
    expect(messages({ telephone: '91234567' })).toEqual(['telephone-no-country'])
    expect(messages({ telephone: '+٩٦٨٩١٢٣٤٥٦٧' })).toEqual(['telephone-arabic-digits'])
  })

  it('wants Schema.org’s English day names and 24-hour times', () => {
    const hours = (specification: Record<string, unknown>) =>
      messages({
        openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', ...specification }],
      })
    expect(
      hours({ dayOfWeek: 'https://schema.org/Friday', opens: '8:30', closes: '23:59:00' }),
    ).toEqual([])
    expect(
      hours({ dayOfWeek: ['Monday', 'PublicHolidays'], opens: '00:00', closes: '24:00' }),
    ).toEqual([])
    expect(hours({ dayOfWeek: 'Monday', closes: '25:00' })).toEqual(['hours-invalid'])
    expect(hours({ dayOfWeek: 'الجمعة', opens: '٠٩:٠٠' })).toEqual([
      'hours-invalid',
      'hours-invalid',
    ])
    expect(messages({ openingHours: ['Mo-Fr 09:00-17:00', 'Sa 10:00-14:00'] })).toEqual([])
    expect(messages({ openingHours: 'السبت-الخميس 09:00-17:00' })).toEqual(['hours-invalid'])
  })

  it('wants coordinates as numbers with a full stop', () => {
    const geo = (latitude: unknown, longitude: unknown) =>
      messages({ geo: { '@type': 'GeoCoordinates', latitude, longitude } })
    expect(geo(23.588, '58.3829')).toEqual([])
    expect(geo('23,588', 58.3829)).toEqual(['geo-invalid'])
    expect(geo(23.588, '٥٨٫٣٨٢٩')).toEqual(['geo-invalid'])
  })

  it('reads a business in a @graph and leaves the ones named inside others alone', () => {
    const graph = { '@context': 'https://schema.org', '@graph': [business({ name: '' })] }
    expect(detectAll(rule, evidenceOf(ldPage(graph))).map((finding) => finding.message)).toEqual([
      'no-name',
    ])
    const nested = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      location: business({ name: '' }),
      name: 'x',
    }
    expect(rule.appliesTo(ldPage(nested))).toBe(false)
  })

  it('does not apply to a page without a business', () => {
    expect(rule.appliesTo(ldPage({ '@type': 'Product', name: 'x', image: 'y', offers: {} }))).toBe(
      false,
    )
  })
})
