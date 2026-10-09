import { describe, expect, it } from 'vitest'
import { collectPage, readSitemapLocs, skeletonSimilarity } from '../src/index'

// M4.5: what a deep crawl reads of a page and of a sitemap.

const facts = (body: string) =>
  collectPage({
    url: 'https://shop.example/p',
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: new TextEncoder().encode(
      `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`,
    ),
  })

const skeleton = (body: string) => facts(body).html?.skeleton ?? ''

describe('the skeleton of a page', () => {
  it('lists the paths of its structural elements, once each, sorted', () => {
    expect(
      skeleton(
        '<header><nav><ul><li>a</li></ul></nav></header><main><article><h1>x</h1></article></main>',
      ),
    ).toBe('header header>nav header>nav>ul main main>article main>article>h1')
  })

  it('does not count how many times a block repeats', () => {
    const items = (n: number) => `<main><ul>${'<li><a href="/x">x</a></li>'.repeat(n)}</ul></main>`
    expect(skeleton(items(3))).toBe(skeleton(items(30)))
  })

  it('tells a product page from an article by how it is built', () => {
    const product = skeleton('<main><section><form><input></form></section><table></table></main>')
    const article = skeleton('<main><article><h1>t</h1><h2>s</h2></article><aside></aside></main>')
    expect(product).not.toBe(article)
    expect(skeletonSimilarity(product, article)).toBeLessThan(0.5)
    expect(skeletonSimilarity(product, product)).toBe(1)
  })

  it('leaves <head> and non-structural wrappers out', () => {
    expect(skeleton('<div><div><main><p>x</p></main></div></div>')).toBe('main')
  })
})

describe('readSitemapLocs', () => {
  const bytes = (text: string) => new TextEncoder().encode(text)
  it('reads the loc of each url, decoding entities and CDATA', () => {
    const read = readSitemapLocs(
      bytes(
        '<?xml version="1.0"?><urlset><url><loc>https://a.example/x?a=1&amp;b=2</loc></url><url><loc><![CDATA[https://a.example/y]]></loc></url><url><loc>not a url</loc></url></urlset>',
      ),
      false,
      10,
    )
    expect(read).toEqual({
      index: false,
      locs: ['https://a.example/x?a=1&b=2', 'https://a.example/y'],
      more: false,
    })
  })

  it('tells an index, stops at the limit, and reads a text file', () => {
    const index = readSitemapLocs(
      bytes('<sitemapindex><sitemap><loc>https://a.example/s.xml</loc></sitemap></sitemapindex>'),
      false,
      10,
    )
    expect(index).toMatchObject({ index: true, locs: ['https://a.example/s.xml'] })
    const many = readSitemapLocs(
      bytes('<urlset>' + '<url><loc>https://a.example/p</loc></url>'.repeat(5) + '</urlset>'),
      false,
      3,
    )
    expect(many).toMatchObject({ locs: expect.any(Array) as string[], more: true })
    expect(many.locs).toHaveLength(3)
    expect(
      readSitemapLocs(bytes('https://a.example/1\r\n\r\nhttps://a.example/2\n'), false, 10),
    ).toEqual({
      index: false,
      locs: ['https://a.example/1', 'https://a.example/2'],
      more: false,
    })
  })

  it('never throws on a body cut mid-element or on nonsense', () => {
    expect(readSitemapLocs(bytes('<urlset><url><loc>https://a.example/p'), true, 5).more).toBe(true)
    expect(readSitemapLocs(bytes(''), false, 5)).toEqual({ index: false, locs: [], more: false })
  })
})
