import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evidenceOf, fixtureEvidence, fixturesDir, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const ARTICLE = '<p>متجر صغير في مسقط يبيع العطور العربية والبخور ودهن العود.</p>'
const page = (htmlTag: string) =>
  htmlPage(`<!doctype html>${htmlTag}<body>${ARTICLE}</body></html>`)

describe('ar-html-lang', () => {
  it.each(['wrong', 'wrong-missing', 'wrong-windows-1256'])('fires on fixture %s', async (name) => {
    const evidence = await fixtureEvidence(rule.id, name)
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(rule.detect(evidence)).toHaveLength(1)
  })

  it.each(['right', 'right-fa'])('passes fixture %s', async (name) => {
    const evidence = await fixtureEvidence(rule.id, name)
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(rule.detect(evidence)).toEqual([])
  })

  it('reads the windows-1256 fixture as the same text as the UTF-8 one', async () => {
    const legacy = await fixtureEvidence(rule.id, 'wrong-windows-1256')
    const utf8 = await fixtureEvidence(rule.id, 'wrong')
    expect(legacy.page.html?.encoding).toEqual({ name: 'windows-1256', source: 'http' })
    expect(legacy.page.text?.letters).toEqual(utf8.page.text?.letters)
    expect(
      readFileSync(`${fixturesDir(rule.id)}wrong-windows-1256/index.html`).includes(0xc7),
    ).toBe(true)
  })

  it('reports the declared language with its location and the letter counts', async () => {
    const [finding] = rule.detect(await fixtureEvidence(rule.id, 'wrong'))
    expect(finding).toMatchObject({
      message: 'not-arabic-script',
      selector: 'html',
      snippet: '<html lang="en" dir="rtl">',
      location: { line: 2, column: 1 },
      values: { declaredLang: 'en' },
    })
    expect(finding?.values?.arabicLetters).toBeGreaterThan(100)
  })

  it('treats a missing and an empty lang the same way', () => {
    expect(rule.detect(evidenceOf(page('<html dir="rtl">')))[0]?.message).toBe('missing')
    expect(rule.detect(evidenceOf(page('<html lang=" " dir="rtl">')))[0]?.message).toBe('missing')
  })

  it.each([
    'ar',
    'AR-sa',
    'ar-OM',
    ' ar ',
    'ar_SA',
    'arb',
    'acx',
    'fa-IR',
    'prs',
    'ur',
    'ps',
    'ckb',
    'ku',
    'sd',
    'ug',
    'pnb',
    'ms-Arab',
    'pa-PK',
    'uz-AF',
    'az-IR',
    'ar-u-nu-latn',
    'ar-t-en-latn',
    'ar-x-latn',
  ])('accepts lang="%s"', (lang) => {
    expect(rule.detect(evidenceOf(page(`<html lang="${lang}" dir="rtl">`)))).toEqual([])
  })

  it.each(['en', 'en-US', 'ar-Latn', 'arabic', 'tr', 'pa', 'ms', 'x'])(
    'rejects lang="%s"',
    (lang) => {
      expect(rule.detect(evidenceOf(page(`<html lang="${lang}" dir="rtl">`)))).toHaveLength(1)
    },
  )

  it('applies only when more than half of the letters are Arabic', () => {
    expect(
      rule.appliesTo(htmlPage('<html lang="en"><p>Our shop sells Arabic perfume: عطر</p>')),
    ).toBe(false)
    expect(rule.appliesTo(htmlPage('<html lang="en"><p>No letters: 12345</p>'))).toBe(false)
    expect(rule.appliesTo(htmlPage('<p>عطر عربي فاخر from Oman</p>'))).toBe(true)
  })

  it('mentions a content-language meta as context, but still fires', () => {
    const [finding] = rule.detect(
      evidenceOf(
        htmlPage(
          `<html dir="rtl"><head><meta http-equiv="Content-Language" content="ar"></head><body>${ARTICLE}</body></html>`,
        ),
      ),
    )
    expect(finding?.values).toMatchObject({ declaredLang: null, contentLanguageMeta: 'ar' })
  })
})
