import { describe, expect, it } from 'vitest'
import { evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const detect = (href: string) =>
  rule.detect(
    evidenceOf(
      htmlPage(`<html lang="ar" dir="rtl"><body><a href="${href}">واتساب</a></body></html>`),
    ),
  )

describe('whatsapp-link-format', () => {
  it('fires once per badly written number on the wrong fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      rule
        .detect(evidence)
        .map((finding) => [finding.message, finding.values?.number, finding.values?.suggestion]),
    ).toEqual([
      ['not-digits-only', '+968 9123-4567', '96891234567'],
      ['leading-zero', '0501234567', null],
      ['arabic-digits', '٩٦٨٩١٢٣٤٥٦٧', '96891234567'],
      ['trunk-zero', '9660501234567', '966501234567'],
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(rule.detect(evidence)).toEqual([])
  })

  it('points at the link', () => {
    expect(detect('https://wa.me/+96891234567')[0]).toMatchObject({
      selector: 'body > a',
      snippet: '<a href="https://wa.me/+96891234567">',
      location: { line: 1, column: 33 },
      values: { href: 'https://wa.me/+96891234567' },
    })
  })

  it.each([
    ['https://wa.me/00968 9123 4567', 'not-digits-only', '96891234567'],
    ['https://wa.me/0096891234567', 'leading-zero', '96891234567'],
    ['https://wa.me/۹۶۸۹۱۲۳۴۵۶۷', 'arabic-digits', '96891234567'],
    ['https://wa.me/501234567', 'not-international', null],
    ['https://wa.me/96812', 'not-international', null],
    ['https://wa.me/4407981555555', 'trunk-zero', '447981555555'],
    ['https://wa.me/c/+96891234567', 'not-digits-only', '96891234567'],
    [
      'https://api.whatsapp.com/send/?phone=%2B96891234567&text=hi',
      'not-digits-only',
      '96891234567',
    ],
    ['https://web.whatsapp.com/send?phone=968-9123-4567', 'not-digits-only', '96891234567'],
    ['whatsapp://send?phone=+96891234567', 'not-digits-only', '96891234567'],
    ['https://wa.me/p/5089023457814242/+96891234567', 'not-digits-only', '96891234567'],
    ['https://wa.me/send?phone=0501234567', 'leading-zero', null],
  ])('%s → %s', (href, message, suggestion) => {
    const [finding] = detect(href)
    expect([finding?.message, finding?.values?.suggestion]).toEqual([message, suggestion])
  })

  it.each([
    'https://wa.me/96891234567',
    'https://wa.me/96891234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7',
    'https://www.wa.me/966501234567/',
    'https://wa.me/390612345678',
    'https://api.whatsapp.com/send?phone=971501234567',
    'https://wa.me/p/5089023457814242/966501234567',
  ])('accepts %s', (href) => {
    expect(detect(href)).toEqual([])
  })

  it('skips links without a number and does not apply without them', () => {
    for (const href of [
      'https://wa.me/',
      'https://wa.me/?text=hi',
      'https://wa.me/message/ABCDEF123',
      'https://wa.me/p/5089023457814242',
      'https://wa.me/catalog/966501234567',
      'https://wa.me/channel/0029VaAbCdEf',
      'https://wa.me/about',
      'https://chat.whatsapp.com/AbC',
      'https://api.whatsapp.com/send?text=hi',
    ]) {
      const page = htmlPage(`<html lang="ar"><body><a href="${href}">واتساب</a></body></html>`)
      expect(rule.appliesTo(page)).toBe(false)
    }
  })
})
