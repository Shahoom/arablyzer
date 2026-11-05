import { describe, expect, it } from 'vitest'
import { detectAll, evidenceOf, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const page = (url: string, head = '') =>
  htmlPage(`<html lang="ar"><head>${head}</head><body><p>x</p></body></html>`, { url })
const canonical = (href: string) => `<link rel="canonical" href="${href}">`
const found = (url: string, head = '') =>
  detectAll(rule, evidenceOf(page(url, head))).map((finding) => finding.message)
const enc = encodeURIComponent

describe('url-slug-invalid', () => {
  it('fails the wrong fixture: a canonical slug with a fatha, an underscore and Eastern digits', async () => {
    const evidence = await fixtureEvidence(rule.id, 'wrong')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(
      detectAll(rule, evidence).map((finding) => [finding.message, finding.values?.slug]),
    ).toEqual([
      ['marks', 'قَهوة_عربية-٢٠٢٦'],
      ['digits', 'قَهوة_عربية-٢٠٢٦'],
      ['separators', 'قَهوة_عربية-٢٠٢٦'],
    ])
  })

  it('passes the right fixture: a clean Arabic slug, percent-encoded', async () => {
    const evidence = await fixtureEvidence(rule.id, 'right')
    expect(rule.appliesTo(evidence.page)).toBe(true)
    expect(detectAll(rule, evidence)).toEqual([])
  })

  it.each([
    ['https://shop.example/' + enc('مَرحبا'), ['marks']],
    ['https://shop.example/' + enc('قـهوة'), ['marks']],
    ['https://shop.example/offers-' + enc('٢٠٢٦'), ['digits']],
    ['https://shop.example/offers-' + enc('۲۰۲۶'), ['digits']],
    ['https://shop.example/coffee_beans', ['separators']],
    ['https://shop.example/Coffee-Beans', ['separators']],
    ['https://shop.example/coffee--beans', ['separators']],
    ['https://shop.example/coffee%20beans', ['separators']],
    ['https://shop.example/coffee+beans', ['separators']],
    ['https://shop.example/coffee%2520beans', ['separators']],
    ['https://shop.example/coffee,beans', ['separators']],
    ['https://shop.example/' + enc('قهوة (عربية)'), ['separators']],
    ['https://shop.example/' + enc('قهوة_عربية'), ['separators']],
  ])('%s has %j', (url, messages) => {
    expect(rule.appliesTo(page(url))).toBe(true)
    expect(found(url)).toEqual(messages)
  })

  it.each([
    ['https://shop.example/' + enc('قهوة-عربية')],
    ['https://shop.example/products/coffee-beans-2026'],
    ['https://shop.example/products/coffee-beans.html'],
    ['https://shop.example/ar/' + enc('قهوة') + '/' + enc('هيل-أخضر')],
    ['https://shop.example/en/products/oud?page=2&sort=price'],
  ])('%s is clean', (url) => {
    expect(found(url)).toEqual([])
  })

  it('judges a slug of 100 characters as clean and one of 101 as long', () => {
    expect(found(`https://shop.example/${'a'.repeat(100)}`)).toEqual([])
    expect(found(`https://shop.example/${'a'.repeat(101)}`)).toEqual(['long'])
    // Counted as people read it, not as it is encoded.
    expect(found(`https://shop.example/${enc('ق'.repeat(100))}`)).toEqual([])
    expect(found(`https://shop.example/${enc('ق'.repeat(101))}`)).toEqual(['long'])
  })

  it('judges the last segment for length, not the whole path', () => {
    expect(found(`https://shop.example/${'a'.repeat(60)}/${'b'.repeat(60)}`)).toEqual([])
  })

  it('reads the canonical as well as the address, and names the one with the problem', () => {
    const evidence = evidenceOf(
      page('https://shop.example/ok', canonical('https://shop.example/not_ok')),
    )
    expect(detectAll(rule, evidence).map((finding) => finding.values?.url)).toEqual([
      'https://shop.example/not_ok',
    ])
    const both = evidenceOf(page('https://shop.example/a_b', canonical('https://shop.example/c_d')))
    expect(detectAll(rule, both).map((finding) => finding.values?.slug)).toEqual(['a_b', 'c_d'])
  })

  it('does not say it twice for a canonical on the address’s own path', () => {
    const evidence = evidenceOf(
      page('https://shop.example/a_b?x=1', canonical('https://shop.example/a_b')),
    )
    expect(detectAll(rule, evidence)).toHaveLength(1)
  })

  it('leaves a segment that is not valid UTF-8 to the mojibake rule', () => {
    expect(found('https://shop.example/%E0%A4%A')).toEqual([])
  })

  it('does not apply to the home page, or to a page that is not HTML', () => {
    expect(rule.appliesTo(page('https://shop.example/'))).toBe(false)
    expect(rule.appliesTo(page('https://shop.example/', canonical('https://shop.example/')))).toBe(
      false,
    )
    expect(
      rule.appliesTo(page('https://shop.example/a_b', canonical('https://shop.example/'))),
    ).toBe(true)
  })
})
