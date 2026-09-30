import { describe, expect, it } from 'vitest'
import { collectPage, type Header, type PageFacts } from '../src/page'
import { concat, encodeSingleByte, utf8 } from './helpers'

const URL = 'https://example.com/ar/perfume'
const HTML: Header = ['content-type', 'text/html; charset=utf-8']

function page(html: string, headers: readonly Header[] = [HTML], status = 200): PageFacts {
  return collectPage({ url: URL, status, headers, body: utf8(html) })
}

function htmlOf(facts: PageFacts) {
  if (facts.html === null) throw new Error('expected HTML facts')
  return facts.html
}

function textOf(facts: PageFacts) {
  if (facts.text === null) throw new Error('expected text facts')
  return facts.text
}

const SHOP = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>  متجر
    العطور </title>
  <base href="https://example.com/shop/">
  <meta name="Robots" content="noindex, follow">
  <link rel="Canonical" href="page">
  <link rel="alternate" hreflang="ar-SA" href="https://example.com/sa/">
  <script type="application/ld+json">{"@type": "Organization"}</script>
</head>
<body>
  <p id="contact">تواصل <a href="https://wa.me/96891234567">واتساب</a></p>
  <div><div><a href="/x">x</a><a href="/y">y</a></div></div>
  <map><area href="https://wa.me/1" alt=""></map>
</body>
</html>`

describe('collectPage: HTML facts', () => {
  const facts = page(SHOP)
  const html = htmlOf(facts)

  it('reads <html> lang and dir with location and the start tag as written', () => {
    expect(html.root).toEqual({
      selector: 'html',
      location: { line: 2, column: 1 },
      snippet: '<html lang="ar" dir="rtl">',
      lang: 'ar',
      dir: 'rtl',
    })
    expect(html.body?.selector).toBe('body')
  })

  it('collapses whitespace in the title and resolves the base URL', () => {
    expect(html.title).toBe('متجر العطور')
    expect(html.baseUrl).toBe('https://example.com/shop/')
    expect(html.encoding).toEqual({ name: 'utf-8', source: 'http' })
  })

  it('collects metas with lowercased names', () => {
    const robots = html.metas.find((meta) => meta.name === 'robots')
    expect(robots).toMatchObject({ content: 'noindex, follow', inHead: true })
    expect(robots?.selector).toBe('head > meta:nth-of-type(2)')
  })

  it('collects links with rel tokens, resolved URLs and hreflang', () => {
    expect(html.links.map((link) => [link.rel, link.url, link.hreflang, link.inHead])).toEqual([
      [['canonical'], 'https://example.com/shop/page', null, true],
      [['alternate'], 'https://example.com/sa/', 'ar-SA', true],
    ])
  })

  it('collects anchors and areas with selectors anchored at a unique id', () => {
    expect(html.anchors.map((anchor) => [anchor.tag, anchor.selector, anchor.url])).toEqual([
      ['a', '#contact > a', 'https://wa.me/96891234567'],
      ['a', 'body > div > div > a:nth-of-type(1)', 'https://example.com/x'],
      ['a', 'body > div > div > a:nth-of-type(2)', 'https://example.com/y'],
      ['area', 'body > map > area', 'https://wa.me/1'],
    ])
  })

  it('keeps script text exactly and says where it starts', () => {
    expect(html.scripts).toHaveLength(1)
    expect(html.scripts[0]).toMatchObject({
      type: 'application/ld+json',
      text: '{"@type": "Organization"}',
      textLocation: { line: 11, column: 38 },
      inHead: true,
    })
  })
})

describe('collectPage: edge cases', () => {
  it('has no location or snippet for an <html> the parser implied', () => {
    const html = htmlOf(page('<p>مرحبا</p>'))
    expect(html.root).toMatchObject({ lang: null, dir: null, location: null, snippet: null })
  })

  it('marks links pushed out of <head> by body content', () => {
    const html = htmlOf(page('<p>x</p><link rel="canonical" href="/a">'))
    expect(html.links[0]?.inHead).toBe(false)
  })

  it('does not anchor selectors at duplicated ids', () => {
    const html = htmlOf(
      page('<div id="a"><a href="/1">1</a></div><div id="a"><a href="/2">2</a></div>'),
    )
    expect(html.anchors.map((anchor) => anchor.selector)).toEqual([
      'body > div:nth-of-type(1) > a',
      'body > div:nth-of-type(2) > a',
    ])
  })

  it('caps snippets at 300 characters', () => {
    const html = htmlOf(page(`<html lang="ar" data-x="${'x'.repeat(400)}">`))
    expect(html.root.snippet).toHaveLength(300)
    expect(html.root.snippet?.endsWith('…')).toBe(true)
  })

  it('does not parse non-HTML responses', () => {
    const pdf = collectPage({
      url: URL,
      status: 200,
      headers: [
        ['content-type', 'application/pdf'],
        ['x-robots-tag', 'noindex'],
      ],
      body: utf8('%PDF-1.7'),
    })
    expect(pdf).toMatchObject({
      isHtml: false,
      mimeType: 'application/pdf',
      html: null,
      text: null,
    })
  })

  it('sniffs HTML when there is no Content-Type', () => {
    const facts = collectPage({
      url: URL,
      status: 200,
      headers: [],
      body: utf8('  <!DOCTYPE html><p>x'),
    })
    expect(facts.isHtml).toBe(true)
    const plain = collectPage({ url: URL, status: 200, headers: [], body: utf8('<pathology>') })
    expect(plain.isHtml).toBe(false)
  })

  it('parses every Link header against the page URL', () => {
    const facts = page('<p>x</p>', [
      HTML,
      ['link', '</ar/perfume>; rel=canonical'],
      ['link', '<https://example.com/en/>; rel=alternate; hreflang=en'],
    ])
    expect(facts.linkHeaders.map((entry) => [entry.rel, entry.url])).toEqual([
      [['canonical'], 'https://example.com/ar/perfume'],
      [['alternate'], 'https://example.com/en/'],
    ])
  })

  it('ignores a <base> whose URL is data: or javascript:, as HTML does', () => {
    for (const href of ['javascript:void(0)', 'data:text/html,x']) {
      expect(htmlOf(page(`<base href="${href}"><a href="/x">x</a>`)).baseUrl).toBe(URL)
    }
  })

  it('reads xml:lang on XHTML pages only', () => {
    const xhtml = collectPage({
      url: URL,
      status: 200,
      headers: [['content-type', 'application/xhtml+xml']],
      body: utf8('<html xml:lang="ar"><body><p>مرحبا</p></body></html>'),
    })
    expect(htmlOf(xhtml).root.lang).toBe('ar')
    expect(
      htmlOf(page('<html xml:lang="ar"><body><p>مرحبا</p></body></html>')).root.lang,
    ).toBeNull()
  })

  it('takes the title from the HTML <title>, not an SVG one', () => {
    const html = htmlOf(page('<body><svg><title>أيقونة</title></svg></body>'))
    expect(html.title).toBeNull()
  })

  it('decodes a windows-1256 page declared in the header', () => {
    const body = concat(utf8('<p>'), encodeSingleByte('العربية', 'windows-1256'), utf8('</p>'))
    const facts = collectPage({
      url: URL,
      status: 200,
      headers: [['content-type', 'text/html; charset=windows-1256']],
      body,
    })
    expect(textOf(facts).letters.arabic).toBe(7)
    expect(htmlOf(facts).encoding).toEqual({ name: 'windows-1256', source: 'http' })
  })
})

describe('collectPage: visible text', () => {
  it('counts letters of visible body text by script', () => {
    const text = textOf(
      page(`<title>عنوان طويل جدا</title>
        <p>مرحباً بكم في Arablyzer ١٢٣ 123</p>
        <script>var عربي = 1</script><style>p{}</style><noscript>نص</noscript>
        <template><p>قالب</p></template><div hidden>مخفي</div><div style="display: none">مخفي</div>
        <textarea>نص</textarea><p>日本</p>`),
    )
    // مرحباً بكم في = 5 + 3 + 2 letters (the tanween is a mark, not a letter); Arablyzer = 9.
    expect(text.letters).toEqual({ arabic: 10, latin: 9, other: 2, total: 21 })
    expect(text.dominantScript).toBe('arabic')
  })

  it('reports none without letters and breaks ties towards Arabic', () => {
    expect(textOf(page('<p>123</p>')).dominantScript).toBe('none')
    expect(textOf(page('<p>ab عر</p>')).dominantScript).toBe('arabic')
    expect(textOf(page('<p>abc عر</p>')).dominantScript).toBe('latin')
  })

  it('records the character before a text node across inline elements only', () => {
    const text = textOf(page('<p><b>مرحبا</b>, كيف</p><p>بداية</p><p>نص <code>a,b</code></p>'))
    expect(
      text.segments.map((segment) => [segment.text, segment.precededBy, segment.code]),
    ).toEqual([
      ['مرحبا', '', false],
      [', كيف', 'ا', false],
      ['بداية', '', false],
      ['نص ', '', false],
      ['a,b', ' ', true],
    ])
    expect(text.segments[1]).toMatchObject({
      selector: 'body > p:nth-of-type(1)',
      location: { line: 1, column: 16 },
    })
  })
})

describe('collectPage: loads over http: (mixed content)', () => {
  it('lists each element that loads over http:, with how browsers treat it', () => {
    const facts = page(`<!doctype html><html><head>
<link rel="stylesheet" href="http://cdn.example.com/site.css">
<link rel="icon" href="http://cdn.example.com/favicon.ico">
<link rel="canonical" href="http://example.com/ar/perfume">
<script src="http://cdn.example.com/app.js"></script>
</head><body>
<img src="/ok.png" srcset="//cdn.example.com/a.png 1x, http://cdn.example.com/b.png 2x">
<iframe src="https://maps.example.com/embed"></iframe>
<form action="http://example.com/subscribe"><input formaction="https://example.com/x"></form>
<a href="http://example.com/old">not a load</a>
<svg><image href="http://cdn.example.com/c.png"></image></svg>
</body></html>`)
    expect(
      htmlOf(facts).insecureLoads.map(({ tag, attribute, url, kind }) => [
        tag,
        attribute,
        url,
        kind,
      ]),
    ).toEqual([
      ['link', 'href', 'http://cdn.example.com/site.css', 'blockable'],
      ['link', 'href', 'http://cdn.example.com/favicon.ico', 'blockable'],
      ['script', 'src', 'http://cdn.example.com/app.js', 'blockable'],
      ['img', 'srcset', 'http://cdn.example.com/b.png', 'blockable'],
      ['form', 'action', 'http://example.com/subscribe', 'form'],
    ])
  })

  it('blocks rather than upgrades an image set, a track, or an image on an IP address (M1.3a review)', () => {
    const facts = page(`<!doctype html><html><body>
<img src="http://cdn.example.com/a.png">
<img src="http://cdn.example.com/b.png" srcset="http://cdn.example.com/b2.png 2x">
<picture><source srcset="http://cdn.example.com/c.avif"><img src="http://cdn.example.com/c.png"></picture>
<img src="http://192.0.2.10/d.png">
<video src="http://cdn.example.com/v.mp4" poster="http://cdn.example.com/p.jpg">
  <source src="http://cdn.example.com/v.webm"><track src="http://cdn.example.com/ar.vtt">
</video>
<input type="image" src="http://cdn.example.com/go.png" alt="ابحث">
</body></html>`)
    expect(
      htmlOf(facts).insecureLoads.map(({ attribute, url, kind }) => [
        attribute,
        new globalThis.URL(url).pathname,
        kind,
      ]),
    ).toEqual([
      ['src', '/a.png', 'upgradable'],
      ['src', '/b.png', 'blockable'],
      ['srcset', '/b2.png', 'blockable'],
      ['srcset', '/c.avif', 'blockable'],
      ['src', '/c.png', 'blockable'],
      ['src', '/d.png', 'blockable'],
      ['src', '/v.mp4', 'upgradable'],
      ['poster', '/p.jpg', 'upgradable'],
      ['src', '/v.webm', 'upgradable'],
      ['src', '/ar.vtt', 'blockable'],
      ['src', '/go.png', 'upgradable'],
    ])
  })

  it('counts formaction only on a submit button with a form, and scripts only when fetched', () => {
    const facts = page(`<!doctype html><html><body>
<form id="join" action="https://example.com/join">
  <button formaction="http://example.com/a">اشترك</button>
  <button type="button" formaction="http://example.com/b">لا</button>
  <input type="text" formaction="http://example.com/c">
</form>
<button formaction="http://example.com/d">بلا نموذج</button>
<button form="join" formaction="http://example.com/e">مسمّى</button>
<button form="missing" formaction="http://example.com/f">اسم غائب</button>
<script src="http://cdn.example.com/g.js"></script>
<script type="module" src="http://cdn.example.com/h.js"></script>
<script nomodule src="http://cdn.example.com/i.js"></script>
<script type="text/template" src="http://cdn.example.com/j.html"></script>
<script type="application/ld+json" src="http://cdn.example.com/k.json"></script>
<script language="vbscript" src="http://cdn.example.com/l.vbs"></script>
</body></html>`)
    expect(
      htmlOf(facts).insecureLoads.map((load) => new globalThis.URL(load.url).pathname),
    ).toEqual(['/a', '/e', '/g.js', '/h.js'])
  })

  it('reads srcset as HTML does: commas inside a URL, and descriptors in parentheses', () => {
    const facts = page(`<!doctype html><html><body>
<img srcset="http://img.example.com/w_300,h_200/a.jpg 300w, http://img.example.com/b.jpg 2x,http://img.example.com/c.jpg,, http://img.example.com/d.jpg future(a, b) 3x">
</body></html>`)
    expect(htmlOf(facts).insecureLoads.map((load) => load.url)).toEqual([
      'http://img.example.com/w_300,h_200/a.jpg',
      'http://img.example.com/b.jpg',
      'http://img.example.com/c.jpg',
      'http://img.example.com/d.jpg',
    ])
  })

  it('resolves against a <base> that points at http:', () => {
    const facts = page('<base href="http://example.com/"><img src="logo.png">')
    expect(htmlOf(facts).insecureLoads.map((load) => load.url)).toEqual([
      'http://example.com/logo.png',
    ])
  })
})
