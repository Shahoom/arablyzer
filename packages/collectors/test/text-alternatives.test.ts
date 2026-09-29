import { describe, expect, it } from 'vitest'
import { collectPage, MAX_TEXT_ALTERNATIVES } from '../src/index'
import { utf8 } from './helpers'

const alternatives = (body: string) => {
  const facts = collectPage({
    url: 'https://shop.example/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: utf8(`<!doctype html><html lang="ar"><body>${body}</body></html>`),
  })
  return (facts.html?.textAlternatives ?? []).map(({ tag, source, text }) => [tag, source, text])
}

// M2.3c: what a page names its graphics and controls for those who cannot see them.
describe('collectPage: text alternatives', () => {
  it("reads images' alt, SVG titles and aria-labels, in document order", () => {
    expect(
      alternatives(`
        <img src="/pay/mada.svg" alt="  مدى  ">
        <map><area href="/x" alt="الخريطة"></map>
        <input type="image" src="/go.png" alt="إرسال">
        <svg role="img" aria-labelledby="pi"><title id="pi">Apple
          Pay</title><path d=""/></svg>
        <span class="icon" aria-label="STC Pay"></span>`),
    ).toEqual([
      ['img', 'alt', 'مدى'],
      ['area', 'alt', 'الخريطة'],
      ['input', 'alt', 'إرسال'],
      ['svg', 'svg-title', 'Apple Pay'],
      ['span', 'aria-label', 'STC Pay'],
    ])
  })

  it('leaves out empty names, text inputs, and an SVG title not its own', () => {
    expect(
      alternatives(`
        <img src="/a.png" alt="">
        <img src="/b.png">
        <input type="text" alt="ليس صورة">
        <svg><g><title>في مجموعة</title></g></svg>
        <button aria-label=" "></button>`),
    ).toEqual([])
  })

  it(`keeps the first ${String(MAX_TEXT_ALTERNATIVES)}`, () => {
    const images = '<img alt="صورة">'.repeat(MAX_TEXT_ALTERNATIVES + 10)
    expect(alternatives(images)).toHaveLength(MAX_TEXT_ALTERNATIVES)
  })
})
