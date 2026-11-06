import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (lang: string, locale: string | null) =>
  htmlPage(
    `<html${lang === '' ? '' : ` lang="${lang}"`}><head>${locale === null ? '' : `<meta property="og:locale" content="${locale}">`}</head><body><p>x</p></body></html>`,
  )
const found = (lang: string, locale: string | null) =>
  detectAll(rule, evidenceOf(page(lang, locale))).map((finding) => finding.message)

describe('og-locale-mismatch', () => {
  it('fails the wrong fixture: an Arabic page whose share is in American English', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((f) => [f.message, f.values?.locale, f.values?.lang]),
    ).toEqual([['language', 'en_US', 'ar']])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['ar', 'ar_SA', []],
    ['ar-SA', 'ar_AR', []],
    ['AR', 'ar_ae', []],
    ['en', 'en_GB', []],
    ['ar', 'en_US', ['language']],
    ['en', 'ar_SA', ['language']],
    ['ar', 'ar-SA', ['format']],
    ['ar', 'en-US', ['language', 'format']],
    ['ar', 'ar', []],
  ])('lang %s, og:locale %s gives %j', (lang, locale, expected) => {
    expect(found(lang, locale)).toEqual(expected)
  })

  it('suggests the underscore form', () => {
    const [finding] = detectAll(rule, evidenceOf(page('ar', 'ar-SA')))
    expect(finding?.values?.suggestion).toBe('ar_SA')
  })

  it('does not apply without a lang, without an og:locale, or with an empty one', () => {
    expect(rule.appliesTo(page('', 'ar_SA'))).toBe(false)
    expect(rule.appliesTo(page('ar', null))).toBe(false)
    expect(rule.appliesTo(page('ar', ' '))).toBe(false)
  })
})
