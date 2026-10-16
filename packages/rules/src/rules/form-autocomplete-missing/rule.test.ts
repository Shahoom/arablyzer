import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (fields: string) =>
  htmlPage(`<html lang="ar"><body><form>${fields}</form></body></html>`)
const found = (fields: string) =>
  detectAll(rule, evidenceOf(page(fields))).map((finding) => finding.values?.token)

describe('form-autocomplete-missing', () => {
  it('fails the wrong fixture: name, email and phone without a token', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence).map((finding) => finding.values?.token)).toEqual([
      'name',
      'email',
      'tel',
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['<input type="email" name="e">', 'email'],
    ['<input type="tel" name="t">', 'tel'],
    ['<input name="mobile">', 'tel'],
    ['<label for="n">الاسم الكامل</label><input id="n" name="x">', 'name'],
    ['<input name="first_name">', 'name'],
    ['<input name="city">', 'address-level2'],
    ['<label for="c">المدينة</label><input id="c" name="x">', 'address-level2'],
    ['<input name="street">', 'street-address'],
    ['<input name="address2">', 'street-address'],
    ['<input name="zip">', 'postal-code'],
    ['<input name="postal_code">', 'postal-code'],
  ])('%s asks for %s', (field, token) => {
    expect(found(field)).toEqual([token])
  })

  it.each([
    '<input type="email" autocomplete="email">',
    '<input type="email" autocomplete="billing email">',
    '<input type="tel" autocomplete="section-b shipping tel">',
    '<input name="city" autocomplete="address-level2">',
    '<input name="first_name" autocomplete="given-name">',
    '<input type="email" name="e" autocomplete="off">',
  ])('accepts %s', (field) => {
    expect(found(field)).toEqual([])
  })

  it('judges only fields whose purpose is clear, and not a user, a company or a coupon', () => {
    for (const field of [
      '<input name="q" type="search">',
      '<input name="username">',
      '<input name="company_name">',
      '<input name="coupon">',
      '<label for="c">الاسم على البطاقة</label><input id="c" name="x">',
      '<input name="password" type="password">',
      '<textarea name="notes"></textarea>',
      '<select name="city"><option>الرياض</option></select>',
      '<input type="checkbox" name="phone">',
    ]) {
      expect(rule.appliesTo(page(field)), field).toBe(false)
    }
  })

  it('has WCAG 1.3.5 as its criterion', () => {
    expect(rule.wcag).toEqual(['1.3.5'])
  })
})
