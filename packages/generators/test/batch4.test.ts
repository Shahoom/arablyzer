import { collectPage } from '@arablyzer/collectors'
import { evaluatePage } from '@arablyzer/engine'
import { RULES } from '@arablyzer/rules'
import { describe, expect, it } from 'vitest'
import { breadcrumbMarkup, faqMarkup, localBusiness, parseFaq } from '../src/index'

const judged = (head: string, body: string, ruleIds: readonly string[]) => {
  const page = collectPage({
    url: 'https://example.com/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(
      `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>صفحة</title>${head}</head><body>${body}</body></html>`,
    ),
  })
  return evaluatePage(page, { rules: RULES, ruleIds })
    .results.map((r) => [r.id, r.status])
    .sort()
}

describe('parseFaq', () => {
  it('reads blocks of a question and its answer, and the marks people put before them', () => {
    expect(
      parseFaq(
        'س: كم الشحن؟\nج: يومان\nلكل المدن.\n\nQ: هل الاسترجاع ممكن؟\nA: نعم.\n\nسؤال بلا جواب',
      ),
    ).toEqual([
      { question: 'كم الشحن؟', answer: 'يومان لكل المدن.' },
      { question: 'هل الاسترجاع ممكن؟', answer: 'نعم.' },
    ])
  })
  it('gives nothing for text with no block of two lines', () => {
    expect(parseFaq('')).toEqual([])
    expect(parseFaq('سؤال واحد فقط')).toEqual([])
  })
})

describe('faqMarkup', () => {
  const items = [
    { question: 'كم الشحن؟', answer: 'يومان لكل المدن.' },
    { question: 'هل يوجد <ضمان> & استرجاع؟', answer: 'نعم، لمدة "أسبوع".' },
  ]
  it('writes the page text and the markup with the same words, and the rule finds nothing', () => {
    const { html, jsonLd } = faqMarkup(items)
    expect(html).toContain('<summary>هل يوجد &lt;ضمان&gt; &amp; استرجاع؟</summary>')
    expect(judged(jsonLd, html, ['faq-schema-mismatch'])).toEqual([['faq-schema-mismatch', 'pass']])
  })
  it('the rule finds a markup whose text the page does not show', () => {
    const { jsonLd } = faqMarkup(items)
    expect(judged(jsonLd, '<p>لا شيء</p>', ['faq-schema-mismatch'])).toEqual([
      ['faq-schema-mismatch', 'fail'],
    ])
  })
  it('cannot be ended by a closing script tag in a question', () => {
    const { jsonLd } = faqMarkup([{ question: 'ما هذا </script><b>؟', answer: 'x' }])
    expect(jsonLd.match(/<\/script>/g)).toHaveLength(1)
    const data = JSON.parse(jsonLd.replace(/^<script[^>]*>|<\/script>$/g, '')) as {
      mainEntity: { name: string }[]
    }
    expect(data.mainEntity[0]?.name).toBe('ما هذا </script><b>؟')
  })
})

describe('localBusiness', () => {
  const full = {
    type: 'CafeOrCoffeeShop',
    nameAr: 'مقهى الواحة',
    nameEn: 'Al Waha Cafe',
    country: 'OM',
    city: 'مسقط',
    street: 'شارع السلطان قابوس',
    postalCode: '١١٢',
    telephone: '٩١٢٣ ٤٥٦٧',
    url: 'https://example.com/',
    image: 'https://example.com/shop.jpg',
    hours: 'السبت-الخميس ٠٩:٠٠-٢١:٠٠\nالجمعة 16:00-24:00',
    latitude: '٢٣٫٥٨٨',
    longitude: '58,3829',
  }
  const data = (jsonLd: string) =>
    JSON.parse(jsonLd.replace(/^<script[^>]*>|<\/script>$/g, '')) as Record<string, unknown>

  it('writes the business as Schema.org asks, from what a Gulf business types', () => {
    const result = localBusiness(full)
    expect(result.problems).toEqual([])
    expect(data(result.jsonLd)).toMatchObject({
      '@type': 'CafeOrCoffeeShop',
      name: 'مقهى الواحة',
      alternateName: 'Al Waha Cafe',
      telephone: '+96891234567',
      address: { postalCode: '112', addressCountry: 'OM' },
      geo: { latitude: 23.588, longitude: 58.3829 },
      openingHoursSpecification: [
        {
          dayOfWeek: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
          opens: '09:00',
          closes: '21:00',
        },
        { dayOfWeek: ['Friday'], opens: '16:00', closes: '24:00' },
      ],
    })
  })

  it('writes what the local business and address rules pass', () => {
    const { jsonLd } = localBusiness(full)
    expect(
      judged(jsonLd, '<p>مقهى</p>', ['local-business-invalid', 'address-schema-gulf']),
    ).toEqual([
      ['address-schema-gulf', 'pass'],
      ['local-business-invalid', 'pass'],
    ])
  })

  it('names what it left out', () => {
    const result = localBusiness({
      ...full,
      nameAr: '',
      nameEn: '',
      telephone: '12',
      postalCode: '1234',
      hours: 'السبت 25:00-26:00\nمتى شئنا',
      latitude: '95',
      longitude: 'x',
      url: 'nope',
      image: 'x.png',
    })
    expect(result.problems.map((p) => p.problem)).toEqual([
      'name-blank',
      'telephone-bad',
      'postal-shape',
      'hours-line',
      'hours-line',
      'geo-bad',
      'url-bad',
      'image-bad',
    ])
    const out = data(result.jsonLd)
    expect(out).not.toHaveProperty('telephone')
    expect(out).not.toHaveProperty('geo')
    expect(out).not.toHaveProperty('openingHoursSpecification')
  })

  it('keeps an international number as typed, drops a trunk 0, and walks a range round the week', () => {
    expect(data(localBusiness({ ...full, telephone: '+971 4 123 4567' }).jsonLd).telephone).toBe(
      '+97141234567',
    )
    expect(
      data(localBusiness({ ...full, country: 'SA', telephone: '050 123 4567' }).jsonLd).telephone,
    ).toBe('+966501234567')
    const wrap = data(localBusiness({ ...full, hours: 'Fri-Mon 10:00-14:00' }).jsonLd)
      .openingHoursSpecification as { dayOfWeek: string[] }[]
    expect(wrap[0]?.dayOfWeek).toEqual(['Friday', 'Saturday', 'Sunday', 'Monday'])
  })

  it('escapes a "<" so a name cannot end the script block', () => {
    expect(
      localBusiness({ ...full, nameAr: 'مقهى </script>' }).jsonLd.match(/<\/script>/g),
    ).toHaveLength(1)
  })
})

describe('breadcrumbMarkup', () => {
  const lines =
    'الرئيسية | https://example.com/\nالعطور | https://example.com/perfumes\nعطر العود الملكي'
  it('numbers the steps, writes full addresses, and the last step needs none', () => {
    const result = breadcrumbMarkup(lines)
    expect(result.count).toBe(3)
    expect(result.problems).toEqual([])
    const data = JSON.parse(result.jsonLd.replace(/^<script[^>]*>|<\/script>$/g, '')) as {
      itemListElement: Record<string, unknown>[]
    }
    expect(data.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: 'https://example.com/' },
      { '@type': 'ListItem', position: 2, name: 'العطور', item: 'https://example.com/perfumes' },
      { '@type': 'ListItem', position: 3, name: 'عطر العود الملكي' },
    ])
  })

  it('writes what the breadcrumb rule passes', () => {
    expect(
      judged(breadcrumbMarkup(lines).jsonLd, '<p>x</p>', ['breadcrumb-schema-invalid']),
    ).toEqual([['breadcrumb-schema-invalid', 'pass']])
  })

  it('reads a path address and an Arabic one, and names what it left out', () => {
    const result = breadcrumbMarkup(
      'Home | https://example.com/\nنص بلا عنوان\nخطأ | nope\n | https://example.com/x\nالصفحة',
    )
    expect(result.problems.map((p) => [p.problem, p.line])).toEqual([
      ['url-missing', 2],
      ['url-missing', 3],
      ['name-blank', 4],
    ])
    expect(result.count).toBe(2)
  })

  it('needs two steps at least', () => {
    expect(
      breadcrumbMarkup('الرئيسية | https://example.com/').problems.map((p) => p.problem),
    ).toEqual(['too-few'])
  })
})
