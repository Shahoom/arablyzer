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
      percent: 33,
      ok: 2,
      judged: 6,
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

  it('names Oman when a currency and a calling code agree, and now also asks for a tax statement', () => {
    // The live report of cloudtopia.net: OMR and +968, an English page, nothing else to judge.
    const english = page('<p>Plans from OMR 1. Call +968 9588 6393</p>', { lang: 'en' })
    expect(inferCountry(readPage(english))).toMatchObject({ country: 'OM', confidence: 'strong' })
    expect(fitOf(english)).toMatchObject({
      country: 'OM',
      confidence: 'strong',
      // the currency and the number's shape fit; the calling code is the country's; no tax statement beside the price
      percent: 75,
      judged: 4,
    })
    // The same in Arabic, with the abbreviation people write on prices.
    const arabic = page('<p>الباقة بـ 12 ر.ع. اتصل على +968 9588 6393</p>')
    expect(inferCountry(readPage(arabic))).toMatchObject({ country: 'OM', confidence: 'strong' })
    expect(detectAll(rule, evidenceOf(english)).map((f) => f.message)).toEqual([
      'fit-om',
      'gap-vat',
    ])
  })

  it('names no country where two kinds of evidence point to different ones, or where one stands alone', () => {
    // Agree: two kinds, one country.
    expect(
      inferCountry(readPage(page('<p>OMR 5 +968 9588 6393</p>', { lang: 'en' }))),
    ).toMatchObject({ country: 'OM', confidence: 'strong' })
    // Conflict: a currency for Oman, a calling code for the UAE.
    expect(
      inferCountry(readPage(page('<p>OMR 5 +971 50 123 4567</p>', { lang: 'en' }))),
    ).toMatchObject({ country: null, confidence: 'unclear' })
    // Too little: a calling code alone.
    expect(inferCountry(readPage(page('<p>+968 9588 6393</p>', { lang: 'en' })))).toMatchObject({
      country: 'OM',
      confidence: 'thin',
    })
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

  describe('the Gulf pack', () => {
    const items = (body: string, lang = 'ar-SA', url = 'https://shop.example/') =>
      Object.fromEntries(fitOf(page(body, { lang, url })).items.map((item) => [item.id, item]))

    it('holds the VAT rate the page states against the country’s', () => {
      expect(items('<p>150 ر.س شامل ضريبة القيمة المضافة 15%</p>')['vat-rate']).toMatchObject({
        status: 'ok',
        detail: '15%',
      })
      expect(items('<p>150 ر.س ضريبة القيمة المضافة 5%</p>')['vat-rate']).toMatchObject({
        status: 'gap',
        detail: '5%',
      })
      expect(items('<p>150 ر.س VAT ١٥٪ included</p>')['vat-rate']).toMatchObject({ status: 'ok' })
      expect(items('<p>خصم 15% على كل شيء</p>')['vat-rate']).toMatchObject({ status: 'unknown' })
      // Bahrain 10%, Oman 5%, the UAE 5%; Kuwait and Qatar have none to judge
      expect(items('<p>10 د.ب ضريبة القيمة المضافة 10%</p>', 'ar-BH')['vat-rate']).toMatchObject({
        status: 'ok',
      })
      expect(items('<p>5 ر.ع ضريبة القيمة المضافة 10%</p>', 'ar-OM')['vat-rate']).toMatchObject({
        status: 'gap',
      })
      expect(items('<p>5 د.ك VAT 5%</p>', 'ar-KW')['vat-rate']).toBeUndefined()
    })

    it('tells a Gulf working week from a Western one in the opening hours', () => {
      expect(items('<p>ساعات العمل: من الأحد إلى الخميس 9 ص - 6 م</p>').weekend).toMatchObject({
        status: 'ok',
      })
      expect(items('<p>الجمعة: مغلق</p>').weekend).toMatchObject({ status: 'ok', detail: 'الجمعة' })
      expect(
        items('<p>ساعات العمل: من الاثنين إلى الجمعة 9 ص - 5 م، مغلق السبت والأحد</p>').weekend,
      ).toMatchObject({ status: 'ok' })
      expect(items('<p>الأحد: مغلق</p>').weekend).toMatchObject({ status: 'gap', detail: 'الأحد' })
      expect(items('<p>ساعات العمل: من الاثنين إلى الجمعة 9 ص - 5 م</p>').weekend).toMatchObject({
        status: 'gap',
      })
      expect(items('<p>تفضلوا بزيارتنا</p>').weekend).toMatchObject({ status: 'unknown' })
      // the UAE's week is not judged, nor is another country's
      expect(items('<p>الأحد: مغلق</p>', 'ar-AE').weekend).toBeUndefined()
      expect(items('<p>الأحد: مغلق</p>', 'ar-EG').weekend).toBeUndefined()
    })

    it('checks the shape of the numbers written with the country’s own code', () => {
      expect(items('<p>اتصل +966 50 123 4567</p>')['phone-shape']).toMatchObject({ status: 'ok' })
      expect(items('<p>اتصل +966 050 123 4567</p>')['phone-shape']).toMatchObject({ status: 'gap' })
      expect(items('<p>اتصل +966 50 123 456</p>')['phone-shape']).toMatchObject({ status: 'gap' })
      expect(items('<p>اتصل 00971 4 123 4567</p>', 'ar-AE')['phone-shape']).toMatchObject({
        status: 'ok',
      })
      expect(items('<p>اتصل +965 5555 1234</p>', 'ar-KW')['phone-shape']).toMatchObject({
        status: 'ok',
      })
      expect(items('<p>اتصل +968 9588 639</p>', 'ar-OM')['phone-shape']).toMatchObject({
        status: 'gap',
      })
      expect(items('<p>مرحبا</p>')['phone-shape']).toMatchObject({ status: 'unknown' })
      expect(items('<p>اتصل +20 100 123 4567</p>', 'ar-EG')['phone-shape']).toBeUndefined()
    })

    it('names each gap in the finding', () => {
      const found = detectAll(
        rule,
        evidenceOf(
          page('<p>150 ر.س ضريبة القيمة المضافة 5%. الأحد: مغلق. اتصل +966 050 123 4567</p>', {
            lang: 'ar-SA',
          }),
        ),
      )
      expect(found.map((f) => f.message)).toEqual(
        expect.arrayContaining(['gap-vat-rate', 'gap-weekend', 'gap-phone-shape']),
      )
      expect(found.find((f) => f.message === 'gap-vat-rate')?.values).toMatchObject({
        seen: '5%',
        rate: 15,
      })
    })
  })
})
