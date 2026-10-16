import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (href: string) =>
  htmlPage(`<html lang="ar"><body><a href="${href}">x</a></body></html>`)
const found = (href: string) =>
  detectAll(rule, evidenceOf(page(href))).map((finding) => finding.message)

describe('contact-link-invalid', () => {
  it('fails the wrong fixture: a local number, Arabic digits, an impossible number, a broken address', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.message)).toEqual([
      'tel-no-country',
      'tel-arabic-digits',
      'mailto-invalid',
      'tel-invalid',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['tel:+966501234567', []],
    ['tel:+966 50 123 4567', []],
    ['TEL:+968-9123-4567', []],
    ['tel:%2B96891234567', []],
    ['tel:00966501234567', []],
    ['tel:+96891234567;ext=12', []],
    ['tel:0501234567', ['tel-no-country']],
    ['tel:91234567', ['tel-no-country']],
    ['tel:٩١٢٣٤٥٦٧', ['tel-arabic-digits']],
    ['tel:+٩٦٨٩١٢٣٤٥٦٧', ['tel-arabic-digits']],
    ['tel:+96812', ['tel-invalid']],
    ['tel:+9', ['tel-invalid']],
    ['tel:', []],
  ])('%s → %j', (href, messages) => {
    expect(found(href)).toEqual(messages)
  })

  it.each([
    ['mailto:orders@shop.example', []],
    ['mailto:orders@shop.example?subject=%D8%B7%D9%84%D8%A8', []],
    ['mailto:a@shop.example,b@shop.example', []],
    ['mailto:%D8%B7%D9%84%D8%A8@shop.example', []],
    ['mailto:info@متجر.السعودية', []],
    ['mailto:orders at shop.example', ['mailto-invalid']],
    ['mailto:orders@shop', ['mailto-invalid']],
    ['mailto:orders', ['mailto-invalid']],
    ['mailto:', ['mailto-invalid']],
    ['mailto:@shop.example', ['mailto-invalid']],
  ])('%s → %j', (href, messages) => {
    expect(found(href)).toEqual(messages)
  })

  it('does not apply to a page without telephone or email links', () => {
    expect(rule.appliesTo(page('/contact'))).toBe(false)
    expect(rule.appliesTo(page('https://wa.me/96891234567'))).toBe(false)
  })
})
