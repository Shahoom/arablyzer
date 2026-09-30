import { describe, expect, it } from 'vitest'
import { collectPage } from '../src/index'
import { utf8 } from './helpers'

const textOf = (body: string) => {
  const facts = collectPage({
    url: 'https://shop.example/',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: utf8(
      `<!doctype html><html lang="ar"><head><title>عنوان</title></head><body>${body}</body></html>`,
    ),
  })
  if (facts.text === null) throw new Error('no text')
  return facts.text
}

// M2.3c review: js-only-content asks whether a word is in the HTML as sent, not whether a visitor
// sees it without JavaScript. The text a page has and does not show without scripts is kept beside
// the text it shows: hidden elements, noscript, templates and the like.
describe('collectPage: the text a page has and does not show', () => {
  it('keeps the Arabic text of hidden elements, noscript, template and textarea apart', () => {
    const text = textOf(`<p>ظاهر</p>
      <div hidden>مخفي أول</div>
      <div style="display: none"><p>مخفي ثان <b>وثالث</b></p></div>
      <noscript><p>بلا سكربت</p></noscript>
      <template><p>قالب</p><div><span>داخل القالب</span></div></template>
      <textarea>حقل نص</textarea>
      <div hidden><div hidden><p>متداخل</p></div></div>`)
    expect(text.segments.map((segment) => segment.text)).toEqual(['ظاهر'])
    // In the document's order; noscript's markup is text to a parser that runs scripts, so its
    // words are there among the tags.
    expect(text.hidden.join('|')).toContain('مخفي أول')
    expect(text.hidden.join('|')).toContain('مخفي ثان')
    expect(text.hidden.join('|')).toContain('وثالث')
    expect(text.hidden.join('|')).toContain('بلا سكربت')
    expect(text.hidden.join('|')).toContain('قالب')
    expect(text.hidden.join('|')).toContain('داخل القالب')
    expect(text.hidden.join('|')).toContain('حقل نص')
    expect(text.hidden.join('|')).toContain('متداخل')
  })

  it('counts no letters of it: the letters are those of the text the page shows', () => {
    const text = textOf('<p>ظاهر</p><div hidden>مخفي</div><noscript>نص</noscript>')
    expect(text.letters).toEqual({ arabic: 4, latin: 0, other: 0, total: 4 })
  })

  it('leaves scripts and styles out: they are code, not text', () => {
    const text = textOf(
      '<p>ظاهر</p><script>var عربي = "نص في سكربت"</script><style>p::after{content:"نص في أنماط"}</style>' +
        '<div hidden><script>var x = "آخر"</script>مخفي</div>',
    )
    expect(text.hidden).toEqual(['مخفي'])
  })

  it('keeps only text that has Arabic letters, so a page of Latin hidden text costs nothing', () => {
    const text = textOf(
      '<p>ظاهر</p><div hidden>English only 123</div><noscript>Enable JavaScript</noscript>',
    )
    expect(text.hidden).toEqual([])
  })

  it('has none where nothing is hidden', () => {
    expect(textOf('<p>نص</p><p>آخر</p>').hidden).toEqual([])
  })

  it('reads deep nesting without the call stack', () => {
    const depth = 5_000
    const text = textOf(`${'<div hidden>'.repeat(depth)}عميق${'</div>'.repeat(depth)}`)
    expect(text.hidden).toEqual(['عميق'])
  }, 30_000)
})
