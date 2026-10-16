import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const ALL = `<a href="/privacy">x</a><a href="/terms">x</a><a href="/returns">x</a><a href="/shipping">x</a>`
const page = (body: string, headers: [string, string][] = []) =>
  htmlPage(`<html lang="ar"><body>${body}</body></html>`, {
    headers: [['content-type', 'text/html'], ...headers],
  })
const missing = (body: string, headers: [string, string][] = []) =>
  detectAll(rule, evidenceOf(page(body, headers))).map((finding) => finding.message)

describe('policy-pages-missing', () => {
  it('fails the wrong fixture: a store that links to none of its four policies', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [finding.message, finding.values?.evidence]),
    ).toEqual([
      ['privacy', 'cart link'],
      ['terms', 'cart link'],
      ['returns', 'cart link'],
      ['shipping', 'cart link'],
    ])
  })

  it('passes the right fixture', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['<a href="/cart">x</a>'],
    ['<a href="/ar/cart/">x</a>'],
    ['<a href="https://shop.example/checkout?step=1">x</a>'],
    ['<a href="/basket">x</a>'],
    ['<a href="/p/1">سلة المشتريات</a>'],
    ['<a href="/p/1">عربة التسوق (2)</a>'],
  ])('%s makes the page a store’s', (body) => {
    expect(rule.appliesTo(page(body))).toBe(true)
  })

  it('does not take a page for a store’s for a word in an address or a text', () => {
    for (const body of [
      '<a href="/blog/shopping-cart-tips">x</a>',
      '<a href="/carts">x</a>',
      '<a href="/discartes">x</a>',
      '<a href="/about">نقدّم السلة</a>',
    ]) {
      expect(rule.appliesTo(page(body)), body).toBe(false)
    }
  })

  it('makes a page of a store platform a store’s', () => {
    const salla: [string, string][] = [['x-powered-by', 'Salla']]
    expect(rule.appliesTo(page('<a href="/about">x</a>', salla))).toBe(true)
    expect(missing('<a href="/about">x</a>', salla)).toEqual([
      'privacy',
      'terms',
      'returns',
      'shipping',
    ])
    expect(missing(`<a href="/about">x</a>${ALL}`, salla)).toEqual([])
  })

  it('finds a policy by the text of its link, its aria-label or the words of its address', () => {
    const cart = '<a href="/cart">x</a>'
    expect(missing(`${cart}${ALL}`)).toEqual([])
    expect(
      missing(
        `${cart}<a href="/p/1">Privacy Policy</a><a href="/p/2">Terms &amp; Conditions</a><a href="/p/3">Returns</a><a href="/p/4">Shipping info</a>`,
      ),
    ).toEqual([])
    expect(
      missing(
        `${cart}<a href="/pages/1" aria-label="سياسة الخصوصية">★</a><a href="/pages/%D8%A7%D9%84%D8%B4%D8%B1%D9%88%D8%B7-%D9%88%D8%A7%D9%84%D8%A3%D8%AD%D9%83%D8%A7%D9%85">x</a><a href="/pages/refund-policy">x</a><a href="/pages/delivery">x</a>`,
      ),
    ).toEqual([])
    expect(missing(`${cart}<a href="/privacy">x</a><a href="/returns">x</a>`)).toEqual([
      'terms',
      'shipping',
    ])
  })

  it('takes the links of the whole page, whatever the language of the policy', () => {
    expect(missing('<a href="/cart">x</a><a href="/ar/استرجاع">x</a>')).toEqual([
      'privacy',
      'terms',
      'shipping',
    ])
  })

  it('does not judge a page with no links in its HTML', () => {
    expect(rule.appliesTo(page('<p>x</p>', [['x-powered-by', 'Salla']]))).toBe(false)
  })

  it('does not apply to a page that is not a store’s', () => {
    expect(rule.appliesTo(page('<a href="/about">x</a>'))).toBe(false)
  })
})
