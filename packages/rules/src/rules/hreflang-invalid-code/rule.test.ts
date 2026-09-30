import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const detect = (hreflang: string) =>
  detectAll(
    rule,
    evidenceOf(
      htmlPage(
        `<html lang="ar" dir="rtl"><head><link rel="alternate" hreflang="${hreflang}" href="/x"></head><body>نص</body></html>`,
      ),
    ),
  )

describe('hreflang-invalid-code', () => {
  it('fires once per invalid code on the wrong fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    const findings = detectAll(rule, evidence)
    expect(
      findings.map((finding) => [
        finding.message,
        finding.values?.hreflang,
        finding.values?.suggestion,
      ]),
    ).toEqual([
      ['unknown-region', 'ar-KSA', null],
      ['underscore', 'ar_AE', 'ar-AE'],
      ['uk-region', 'en-UK', 'en-GB'],
    ])
    expect(findings[0]).toMatchObject({
      selector: 'head > link:nth-of-type(1)',
      snippet: '<link rel="alternate" hreflang="ar-KSA" href="https://example.com/sa/offers" />',
      location: { line: 7, column: 5 },
      values: { region: 'KSA', href: 'https://example.com/sa/offers', source: 'link' },
    })
  })

  it('checks hreflang in Link headers too', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong-header')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([
      expect.objectContaining({
        message: 'underscore',
        values: expect.objectContaining({
          hreflang: 'en_US',
          source: 'header',
          suggestion: 'en-US',
        }) as unknown,
        snippet: '<https://example.com/en/offers>; rel="alternate"; hreflang="en_US"',
      }),
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    'ar',
    'ar-SA',
    'AR-sa',
    'ar-OM',
    'en-GB',
    'zh-Hant',
    'zh-Hant-TW',
    'x-default',
    'X-Default',
    'iw',
    ' ar-AE ',
  ])('accepts %s', (hreflang) => {
    expect(detect(hreflang)).toEqual([])
  })

  it.each([
    ['ara', 'unknown-language'],
    ['xx-SA', 'unknown-language'],
    ['ar-XX', 'unknown-region'],
    ['es-419', 'unknown-region'],
    ['en-EU', 'unknown-region'],
    ['zh-Hanx', 'unknown-script'],
    ['ar-SA-x', 'malformed'],
    ['', 'malformed'],
    ['ar--SA', 'malformed'],
  ])('rejects %s as %s', (hreflang, message) => {
    expect(detect(hreflang).map((finding) => finding.message)).toEqual([message])
  })

  it('does not apply without hreflang, and ignores hreflang on other links', () => {
    expect(
      rule.appliesTo(
        htmlPage('<html lang="ar"><body><a hreflang="xx" href="/">نص</a></body></html>'),
      ),
    ).toBe(false)
    expect(
      rule.appliesTo(htmlPage('<link rel="stylesheet" hreflang="en" href="/a.css"><p>نص</p>')),
    ).toBe(false)
  })
})
