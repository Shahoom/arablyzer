import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const SHOPIFY = (locale: string) =>
  `<script src="https://cdn.shopify.com/s/files/1/0001/theme.js"></script><script>var Shopify = Shopify || {}; Shopify.locale = "${locale}";</script>`
const ARABIC =
  'عطور وبخور عربية تُشحن إلى كل مدن المملكة خلال يومين مع ضمان الاسترجاع الكامل للمنتج.'
const page = (attrs: string, head: string, body = ARABIC) =>
  htmlPage(`<html ${attrs}><head>${head}</head><body><p>${body}</p></body></html>`)
const found = (attrs: string, head: string, body?: string) =>
  detectAll(rule, evidenceOf(page(attrs, head, body))).map((finding) => finding.message)

describe('shopify-locale-mismatch', () => {
  it('fails the wrong fixture: Arabic switched on, an English theme', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'lang',
      'dir',
      'untranslated',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('judges the lang and the direction apart', () => {
    expect(found('lang="en" dir="rtl"', SHOPIFY('ar'))).toEqual(['lang'])
    expect(found('lang="ar"', SHOPIFY('ar'))).toEqual(['dir'])
    expect(found('lang="ar-SA" dir="rtl"', SHOPIFY('ar'))).toEqual([])
  })

  it('takes a direction set on the body as the theme’s', () => {
    const body = htmlPage(
      `<html lang="ar"><head>${SHOPIFY('ar')}</head><body dir="rtl"><p>${ARABIC}</p></body></html>`,
    )
    expect(detectAll(rule, evidenceOf(body))).toEqual([])
  })

  it('says a text is not translated only when it has enough letters to say it', () => {
    const english =
      'Arabian perfumes and incense shipped to every city within two days, with a returns guarantee.'
    expect(found('lang="ar" dir="rtl"', SHOPIFY('ar'), english)).toEqual(['untranslated'])
    expect(found('lang="ar" dir="rtl"', SHOPIFY('ar'), 'Oud')).toEqual([])
  })

  it('applies only to a Shopify store shown in Arabic', () => {
    expect(rule.appliesTo(page('lang="en"', SHOPIFY('en')))).toBe(false)
    expect(rule.appliesTo(page('lang="en"', '<script>Shopify.locale = "ar"</script>'))).toBe(false)
    expect(rule.appliesTo(page('lang="en"', SHOPIFY('ar-SA')))).toBe(true)
  })
})
