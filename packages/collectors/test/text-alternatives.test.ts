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

  // M2.3c review: a store's payment logos sit in its footer, after every product image.
  it(`keeps the first ${String(MAX_TEXT_ALTERNATIVES)} and the last ${String(MAX_TEXT_ALTERNATIVES)}, in document order`, () => {
    const count = 3 * MAX_TEXT_ALTERNATIVES
    const images = Array.from({ length: count }, (_, index) => `<img alt="صورة ${String(index)}">`)
    const kept = alternatives(images.join('')).map(([, , text]) => text)
    expect(kept).toHaveLength(2 * MAX_TEXT_ALTERNATIVES)
    const wanted = [
      ...images.slice(0, MAX_TEXT_ALTERNATIVES),
      ...images.slice(count - MAX_TEXT_ALTERNATIVES),
    ].map((image) => /alt="([^"]*)"/.exec(image)?.[1])
    expect(kept).toEqual(wanted)
    expect(kept).toContain('صورة 0')
    expect(kept).toContain(`صورة ${String(count - 1)}`)
    expect(kept).not.toContain(`صورة ${String(MAX_TEXT_ALTERNATIVES + 5)}`)
  })

  it('keeps every one of a page that has no more than the two ends hold, once each', () => {
    for (const count of [
      MAX_TEXT_ALTERNATIVES - 1,
      MAX_TEXT_ALTERNATIVES,
      2 * MAX_TEXT_ALTERNATIVES,
    ]) {
      const images = Array.from(
        { length: count },
        (_, index) => `<img alt="صورة ${String(index)}">`,
      )
      const kept = alternatives(images.join('')).map(([, , text]) => text)
      expect(kept, String(count)).toHaveLength(count)
      expect(new Set(kept).size, String(count)).toBe(count)
    }
    const over = Array.from(
      { length: 2 * MAX_TEXT_ALTERNATIVES + 1 },
      (_, index) => `<img alt="صورة ${String(index)}">`,
    )
    expect(alternatives(over.join(''))).toHaveLength(2 * MAX_TEXT_ALTERNATIVES)
  })
})
