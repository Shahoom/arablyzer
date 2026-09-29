import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const on = (body: string) => ({
  page: htmlPage(`<!doctype html><html lang="ar"><body>${body}</body></html>`, {
    url: 'https://shop.example/ar/',
  }),
})
const methods = (body: string) => detectAll(rule, on(body)).map((finding) => finding.values?.method)

describe('payment-methods', () => {
  it('is information, never deducted', () => {
    expect(rule.severity).toBe('info')
    expect(rule.category).toBe('commerce')
  })

  it("lists each Gulf payment method the page shows: logos' names and the providers' widgets", async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'wrong'))).toEqual([
      {
        message: 'named',
        values: { method: 'mada', text: 'mada' },
        selector: 'body > footer > img:nth-of-type(1)',
        snippet: '<img src="/pay/mada.svg" alt="mada" width="48" height="32" />',
        location: { line: 23, column: 7 },
        key: 'mada',
      },
      {
        message: 'named',
        values: { method: 'Apple Pay', text: 'Apple Pay' },
        selector: 'body > footer > img:nth-of-type(2)',
        snippet: '<img src="/pay/apple-pay.svg" alt="Apple Pay" width="48" height="32" />',
        location: { line: 24, column: 7 },
        key: 'Apple Pay',
      },
      {
        message: 'widget',
        values: { method: 'Tabby', host: 'checkout.tabby.ai' },
        selector: 'body > script',
        snippet: '<script src="https://checkout.tabby.ai/tabby-promo.js">',
        location: { line: 26, column: 5 },
        key: 'Tabby',
      },
    ])
  })

  it('finds none on a page that shows none of them', async () => {
    expect(detectAll(rule, await fixtureEvidence(rule.id, 'right'))).toEqual([])
  })

  it('reads a name whole, with a word such as logo, in either language and letter case', () => {
    expect(
      methods(`
        <img alt="شعار مدى"><img alt="Mada logo"><img alt="apple-pay"><img alt="ApplePay icon">
        <img alt="STC Pay"><img alt="stc_pay"><img alt="إس تي سي باي"><img alt="تابي">
        <svg><title>Tamara</title></svg><span aria-label="تمارا"></span>`),
    ).toEqual(['mada', 'Apple Pay', 'STC Pay', 'Tabby', 'Tamara'])
  })

  it('reads no name inside other words or sentences, nor in the running text', () => {
    expect(
      methods(`
        <img alt="على مدى عشرين عاماً"><img alt="Pay with Apple Pay today">
        <img alt="تمارا، مديرة المتجر"><img alt="madam"><img alt="tabby cat">
        <p>نقبل الدفع بمدى وApple Pay وSTC Pay وتابي وتمارا.</p>`),
    ).toEqual([])
  })

  it("knows each provider's widget by the host its documentation gives, and by it alone", () => {
    expect(
      methods(`
        <script src="https://cdn.tamara.co/widget-v2/tamara-widget.js"></script>
        <script src="https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"></script>
        <script src="https://checkout.tabby.ai/tabby-card.js" type="module"></script>`),
    ).toEqual(['Tamara', 'Apple Pay', 'Tabby'])
    expect(
      methods(`
        <script src="https://evil.example/checkout.tabby.ai.js"></script>
        <script src="https://checkout.tabby.ai.evil.example/tabby-promo.js"></script>
        <script type="application/json" src="https://cdn.tamara.co/widget-v2/tamara-widget.js"></script>`),
    ).toEqual([])
  })

  it('names each method once, at the first place the page shows it', () => {
    expect(
      detectAll(rule, on('<img alt="mada"><img alt="مدى"><span aria-label="mada"></span>')),
    ).toMatchObject([{ values: { method: 'mada' }, selector: 'body > img:nth-of-type(1)' }])
  })

  it('applies to an HTML page', () => {
    expect(applies(rule, on('<p>نص</p>'))).toBe(true)
  })
})
