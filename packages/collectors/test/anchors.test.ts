import { describe, expect, it } from 'vitest'
import { collectPage } from '../src/index'

const page = (html: string) =>
  collectPage({
    url: 'https://example.com/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(html),
  })

describe('anchors', () => {
  it('keep their text (images by their alt), rel and aria-label', () => {
    const { html } = page(
      `<body><a href="/a" rel="NoFollow  sponsored" aria-label="الرئيسية">
         اضغط   <b>هنا</b> <img src="x.png" alt="أيقونة"></a>
       <map><area href="/z" alt="منطقة"></map><a href="/e"></a></body>`,
    )
    expect(html?.anchors.map((a) => [a.tag, a.text, a.rel, a.ariaLabel])).toEqual([
      ['a', 'اضغط هنا أيقونة', ['nofollow', 'sponsored'], 'الرئيسية'],
      ['area', 'منطقة', [], null],
      ['a', '', [], null],
    ])
  })

  it('cut a long text', () => {
    const { html } = page(`<a href="/a">${'ب'.repeat(500)}</a>`)
    expect(html?.anchors[0]?.text).toHaveLength(200)
  })
})
