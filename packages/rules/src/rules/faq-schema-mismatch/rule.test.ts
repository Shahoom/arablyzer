import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const faq = (...items: [string, string][]) =>
  `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(([name, text]) => ({
      '@type': 'Question',
      name,
      acceptedAnswer: { '@type': 'Answer', text },
    })),
  })}</script>`
const page = (body: string, ...items: [string, string][]) =>
  htmlPage(`<html lang="ar"><head>${faq(...items)}</head><body>${body}</body></html>`)
const found = (body: string, ...items: [string, string][]) =>
  detectAll(rule, evidenceOf(page(body, ...items))).map((finding) => [
    finding.message,
    finding.values?.count,
  ])

describe('faq-schema-mismatch', () => {
  it('fails the wrong fixture: an answer in the markup that the page does not say', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((f) => [f.message, f.values?.count])).toEqual([
      ['question', 1],
      ['answer', 1],
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it('passes a question and an answer that stand on the page, whatever the spacing and case', () => {
    expect(
      found('<h2>Where  do you SHIP?</h2><p>We ship worldwide, in two days.</p>', [
        'where do you ship?',
        'We ship worldwide,   in two days.',
      ]),
    ).toEqual([])
  })

  it('reads an answer written with markup as the text it makes', () => {
    expect(
      found('<h2>كم الشحن؟</h2><p>يومان <b>فقط</b> لكل المدن.</p>', [
        'كم الشحن؟',
        '<p>يومان <b>فقط</b></p><p>لكل المدن.</p>',
      ]),
    ).toEqual([])
  })

  it('names a question not on the page, and does not also name its answer', () => {
    expect(found('<p>لا شيء هنا</p>', ['كم الشحن؟', 'يومان.'])).toEqual([['question', 1]])
  })

  it('names an answer not on the page when its question is', () => {
    expect(
      found('<h2>كم الشحن؟</h2><p>ثلاثة أيام.</p>', ['كم الشحن؟', 'يومان فقط لكل المدن الكبرى.']),
    ).toEqual([['answer', 1]])
  })

  it('counts each kind and shows the first', () => {
    const findings = detectAll(rule, evidenceOf(page('<p>x</p>', ['س1؟', 'ج1.'], ['س2؟', 'ج2.'])))
    expect(findings.map((f) => [f.message, f.values?.count, f.values?.question])).toEqual([
      ['question', 2, 'س1؟'],
    ])
  })

  it('reads a question that has code in it, and words split across elements', () => {
    expect(
      found('<h2>متى أستخدم <code>dir="ltr"</code> ؟</h2><p>في <b>الأرقام</b> .</p>', [
        'متى أستخدم dir="ltr" ؟',
        'في الأرقام.',
      ]),
    ).toEqual([])
  })

  it('does not read a script or a style as the page’s text', () => {
    expect(
      found(
        '<script>var q = "كم الشحن؟ يومان.";</script><style>.a::after{content:"كم الشحن؟"}</style>',
        ['كم الشحن؟', 'يومان.'],
      ),
    ).toEqual([['question', 1]])
  })

  it('does not apply to a page with no FAQPage', () => {
    expect(rule.appliesTo(htmlPage('<html><head></head><body><p>x</p></body></html>'))).toBe(false)
  })
})
