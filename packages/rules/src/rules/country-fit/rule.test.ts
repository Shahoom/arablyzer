import { describe, expect, it } from 'vitest'
import { applies, detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { dialOf, fitOf, inferCountry, readPage, regionOf } from '../../lib/country'
import { rule } from './rule'

const page = (body: string, options: { lang?: string; url?: string; head?: string } = {}) =>
  htmlPage(
    `<!doctype html><html lang="${options.lang ?? 'ar'}"><head><title>متجر</title>${options.head ?? ''}</head><body><main>${body}</main></body></html>`,
    { url: options.url ?? 'https://shop.example/' },
  )

describe('country-fit', () => {
  it('is information, never deducted', () => {
    expect(rule.severity).toBe('info')
  })

  it('names the readiness and each gap of a Saudi page that shows USD, a local number and Gregorian dates', async () => {
    const found = detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))
    expect(found.map((finding) => finding.message)).toEqual([
      'fit-sa',
      'gap-currency',
      'gap-phone-local',
      'gap-vat',
      'gap-hijri',
    ])
    expect(found[0]?.values).toMatchObject({
      country: 'SA',
      percent: 20,
      ok: 1,
      judged: 5,
      gaps: 4,
    })
    expect(found[2]?.values).toMatchObject({ dial: '966', seen: '0501234567' })
  })

  it('passes a page that fits, and keeps its 100% in the facts', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(detectAll(rule, evidence)).toEqual([])
    expect(fitOf(evidence.page)).toMatchObject({
      country: 'SA',
      confidence: 'strong',
      percent: 100,
    })
  })

  it('names no country, and says nothing, where the evidence is thin or crossed', () => {
    // One kind of evidence alone.
    const thin = page('<p>150 ر.س</p>')
    expect(fitOf(thin)).toMatchObject({ country: 'SA', confidence: 'thin', percent: null })
    expect(detectAll(rule, evidenceOf(thin))).toEqual([])
    // Two countries with the same weight: unclear.
    const crossed = page('<p>150 ر.س و 200 د.إ</p>')
    expect(fitOf(crossed)).toMatchObject({ country: null, confidence: 'unclear', percent: null })
    expect(detectAll(rule, evidenceOf(crossed))).toEqual([])
    // Nothing at all.
    expect(fitOf(page('<p>مرحبا</p>'))).toMatchObject({ country: null })
  })

  it('reads the ccTLD, the language region, a calling code, and a single-country hreflang', () => {
    const kuwait = page('<p>اتصل: +965 5555 1234</p>', {
      url: 'https://shop.com.kw/',
      lang: 'ar-KW',
    })
    const inferred = inferCountry(readPage(kuwait))
    expect(inferred).toMatchObject({ country: 'KW', confidence: 'strong' })
    expect(inferred.signals.map((signal) => signal.kind).sort()).toEqual([
      'domain',
      'lang',
      'phone',
    ])
    const hreflang = page('<p>اتصل: +20 100 123 4567</p>', {
      head: '<link rel="alternate" hreflang="ar-eg" href="https://shop.example/eg/">',
    })
    expect(fitOf(hreflang)).toMatchObject({ country: 'EG', confidence: 'strong' })
    // Several countries in hreflang is a page for several: no single country comes of it.
    const several = page('<p>مرحبا</p>', {
      head: '<link rel="alternate" hreflang="ar-eg" href="/eg/"><link rel="alternate" hreflang="ar-sa" href="/sa/">',
    })
    expect(inferCountry(readPage(several)).signals).toEqual([])
  })

  it('expects Latin digits in Morocco, and judges neither script elsewhere', () => {
    const morocco = page('<p>الثمن ٢٥٠ د.م، اتصل +212 6 12 34 56 78</p>', { lang: 'ar-MA' })
    const fit = fitOf(morocco)
    expect(fit.country).toBe('MA')
    expect(fit.items.find((item) => item.id === 'digits')).toMatchObject({ status: 'gap' })
    const gulf = fitOf(page('<p>الثمن ٢٥٠ د.ك، اتصل +965 5555 1234</p>', { lang: 'ar-KW' }))
    expect(gulf.items.find((item) => item.id === 'digits')).toMatchObject({ status: 'unknown' })
  })

  it('finds a number with another country’s code, and one with no code, by country', () => {
    const foreign = fitOf(page('<p>150 ر.س، اتصل +971 50 123 4567</p>', { lang: 'ar-SA' }))
    expect(foreign.items.find((item) => item.id === 'phone')).toMatchObject({
      status: 'gap',
      variant: 'foreign',
    })
    const egypt = fitOf(page('<p>150 ج.م، اتصل 01012345678</p>', { lang: 'ar-EG' }))
    expect(egypt.items.find((item) => item.id === 'phone')).toMatchObject({
      status: 'gap',
      variant: 'local',
    })
  })

  it('knows the calling codes and language regions', () => {
    expect(dialOf('+966 50 123 4567')).toBe('SA')
    expect(dialOf('00212612345678')).toBe('MA')
    expect(dialOf('+20 100 123 4567')).toBe('EG')
    expect(dialOf('+44 20 7946 0958')).toBeNull()
    expect(dialOf('0501234567')).toBeNull()
    expect(regionOf('ar-SA')).toBe('SA')
    expect(regionOf('ar')).toBeNull()
    expect(regionOf('en-US')).toBeNull()
  })

  it('applies to an HTML page with text', () => {
    expect(applies(rule, evidenceOf(page('<p>مرحبا</p>')))).toBe(true)
  })
})
