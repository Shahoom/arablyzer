import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const URL_SA = 'https://shop.example/sa'
const page = (lang: string | null, self = 'ar-SA') =>
  htmlPage(
    `<html${lang === null ? '' : ` lang="${lang}"`}><head><link rel="alternate" hreflang="${self}" href="${URL_SA}"><link rel="alternate" hreflang="en" href="https://shop.example/en"></head><body>x</body></html>`,
    { url: URL_SA },
  )
const messages = (lang: string | null, self?: string) =>
  detectAll(rule, evidenceOf(page(lang, self))).map((finding) => finding.message)

describe('hreflang-lang-mismatch', () => {
  it('fails the wrong fixture: ar-AE on the page, ar-SA in the list', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [
        finding.message,
        finding.values?.hreflang,
        finding.values?.lang,
      ]),
    ).toEqual([['region-differs', 'ar-SA', 'ar-AE']])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('compares the language first, then the region where both give one', () => {
    expect(messages('en')).toEqual(['language-differs'])
    expect(messages('ar')).toEqual([])
    expect(messages('ar-SA')).toEqual([])
    expect(messages('AR_sa')).toEqual([])
    expect(messages('ar-EG')).toEqual(['region-differs'])
    expect(messages('ar-OM', 'ar')).toEqual([])
    expect(messages('en-GB', 'en')).toEqual([])
  })

  it('does not apply without a lang, nor when the list does not tell which entry is the page', () => {
    expect(rule.appliesTo(page(null))).toBe(false)
    expect(rule.appliesTo(page(' '))).toBe(false)
    const elsewhere = htmlPage(
      '<html lang="en"><head><link rel="alternate" hreflang="ar" href="https://shop.example/sa"></head></html>',
      { url: 'http://127.0.0.1:3000/' },
    )
    expect(rule.appliesTo(elsewhere)).toBe(false)
  })
})
