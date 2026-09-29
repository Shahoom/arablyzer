import { describe, expect, it } from 'vitest'
import {
  collectSitemap,
  readSitemap,
  SITEMAP_NAMESPACE,
  sitemapTargets,
  sitemapUrl,
} from '../src/sitemap'
import { concat, utf8 } from './helpers'

const read = (text: string, truncated = false) => readSitemap(utf8(text), truncated)

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="${SITEMAP_NAMESPACE}">
  <url>
    <loc>https://shop.example/ar/</loc>
    <lastmod>2026-09-29</lastmod>
  </url>
  <url><loc>https://shop.example/ar/oud?size=large&amp;color=black</loc></url>
</urlset>
`

describe('readSitemap', () => {
  it('reads the protocol’s urlset and sitemapindex, and counts their entries', () => {
    expect(read(URLSET)).toEqual({ kind: 'sitemap', format: 'urlset', entries: 2 })
    expect(
      read(
        `<sitemapindex xmlns="${SITEMAP_NAMESPACE}"><sitemap><loc>https://shop.example/a.xml.gz</loc></sitemap></sitemapindex>`,
      ),
    ).toEqual({ kind: 'sitemap', format: 'sitemapindex', entries: 1 })
    // A prefix is as good as none, and extensions' elements are not entries.
    expect(
      read(
        `<s:urlset xmlns:s="${SITEMAP_NAMESPACE}" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"><s:url><s:loc>https://shop.example/</s:loc><image:image/></s:url></s:urlset>`,
      ),
    ).toEqual({ kind: 'sitemap', format: 'urlset', entries: 1 })
  })

  it('allows a byte order mark, whitespace before the start, comments and instructions', () => {
    const body = concat(new Uint8Array([0xef, 0xbb, 0xbf]), utf8(`\n  ${URLSET}`))
    expect(readSitemap(body, false)).toMatchObject({ kind: 'sitemap', format: 'urlset' })
    expect(
      read(
        `<?xml version="1.0"?>\n<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>\n<!-- generated -->\n<urlset xmlns="${SITEMAP_NAMESPACE}"/>`,
      ),
    ).toEqual({ kind: 'sitemap', format: 'urlset', entries: 0 })
  })

  it('reads RSS 2.0 and Atom 1.0 feeds, which Google reads as sitemaps', () => {
    expect(read('<rss version="2.0"><channel><item/></channel></rss>')).toEqual({
      kind: 'sitemap',
      format: 'rss',
      entries: null,
    })
    expect(read('<feed xmlns="http://www.w3.org/2005/Atom"><entry/></feed>')).toEqual({
      kind: 'sitemap',
      format: 'atom',
      entries: null,
    })
    expect(read('<rss version="0.91"><channel/></rss>')).toEqual({
      kind: 'root',
      root: 'rss',
      namespace: '',
    })
  })

  it('names a urlset or sitemapindex outside the protocol’s namespace', () => {
    expect(read('<urlset><url><loc>https://shop.example/</loc></url></urlset>')).toEqual({
      kind: 'namespace',
      root: 'urlset',
      namespace: '',
    })
    expect(
      read('<sitemapindex xmlns="https://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>'),
    ).toEqual({
      kind: 'namespace',
      root: 'sitemapindex',
      namespace: 'https://www.sitemaps.org/schemas/sitemap/0.9',
    })
  })

  it('names any other root, as written: XML names are case-sensitive', () => {
    expect(read(`<urlSet xmlns="${SITEMAP_NAMESPACE}"/>`)).toEqual({
      kind: 'root',
      root: 'urlSet',
      namespace: SITEMAP_NAMESPACE,
    })
    expect(read('<products><product/></products>')).toEqual({
      kind: 'root',
      root: 'products',
      namespace: '',
    })
  })

  it('tells an HTML page apart, whether or not it parses as XML', () => {
    expect(
      read('<!DOCTYPE html>\n<html lang="ar"><head><meta charset="utf-8"></head></html>'),
    ).toEqual({ kind: 'html' })
    expect(read('<!-- 404 --><html><body><p>غير موجود</p></body></html>')).toEqual({
      kind: 'html',
    })
  })

  it('finds where XML is not well-formed, from line 1', () => {
    // An unescaped ampersand: the mistake Search Console names first.
    expect(
      read(
        `<urlset xmlns="${SITEMAP_NAMESPACE}">\n  <url><loc>https://shop.example/?a=1&b=2</loc></url>\n</urlset>`,
      ),
    ).toMatchObject({ kind: 'not-xml', line: 2 })
    expect(read(`<urlset xmlns="${SITEMAP_NAMESPACE}"><url></urlset>`)).toMatchObject({
      kind: 'not-xml',
      line: 1,
    })
    // HTML's entities are not XML's.
    expect(read(`<urlset xmlns="${SITEMAP_NAMESPACE}">&nbsp;</urlset>`)).toMatchObject({
      kind: 'not-xml',
    })
    // One root element, and nothing after it.
    expect(
      read(`<urlset xmlns="${SITEMAP_NAMESPACE}"/>\n<urlset xmlns="${SITEMAP_NAMESPACE}"/>`),
    ).toMatchObject({ kind: 'not-xml', line: 2 })
    expect(read(`<urlset xmlns="${SITEMAP_NAMESPACE}"/>trailing`)).toMatchObject({
      kind: 'not-xml',
    })
    // A root that never closes, and a document without one.
    expect(read(`<urlset xmlns="${SITEMAP_NAMESPACE}"><url>`)).toMatchObject({ kind: 'not-xml' })
    expect(read('<?xml version="1.0"?>')).toMatchObject({ kind: 'not-xml' })
    expect(read('<x:urlset/>')).toMatchObject({ kind: 'not-xml' })
  })

  it('judges a body cut at the read limit up to the cut, and not the cut itself', () => {
    const cut = `<urlset xmlns="${SITEMAP_NAMESPACE}"><url><loc>https://shop.example/`
    expect(read(cut, true)).toEqual({ kind: 'sitemap', format: 'urlset', entries: 1 })
    expect(read(cut, false)).toMatchObject({ kind: 'not-xml' })
    expect(read(`<urlset xmlns="${SITEMAP_NAMESPACE}"><u`, true)).toEqual({
      kind: 'sitemap',
      format: 'urlset',
      entries: null,
    })
    // A character the cut splits in two is left out, not read as a broken one.
    const body = utf8(`<urlset xmlns="${SITEMAP_NAMESPACE}"><url><loc>https://shop.example/عود`)
    expect(readSitemap(body.subarray(0, body.length - 1), true)).toMatchObject({
      kind: 'sitemap',
    })
  })

  it('reads text as a text sitemap: a full URL on each line that is not blank', () => {
    expect(read('https://shop.example/\r\nhttps://shop.example/ar/عود\n\n')).toEqual({
      kind: 'sitemap',
      format: 'text',
      entries: 2,
    })
    expect(read('https://shop.example/\n/ar/oud\n')).toEqual({ kind: 'text', line: 2 })
    expect(read('{"urls": []}')).toEqual({ kind: 'text', line: 1 })
    expect(read('https://shop.example/\nhttps://shop.exa', true)).toEqual({
      kind: 'sitemap',
      format: 'text',
      entries: 1,
    })
  })

  it('reads an empty body as a sitemap without entries', () => {
    expect(read('')).toEqual({ kind: 'sitemap', format: 'text', entries: 0 })
    expect(read(' \n\t')).toEqual({ kind: 'sitemap', format: 'text', entries: 0 })
  })

  it('reads the protocol’s largest sitemap in well under a second', () => {
    const entry = '<url><loc>https://shop.example/ar/products/item?size=large&amp;x=1</loc></url>\n'
    const big = `<urlset xmlns="${SITEMAP_NAMESPACE}">\n${entry.repeat(50_000)}</urlset>`
    const started = performance.now()
    expect(read(big)).toEqual({ kind: 'sitemap', format: 'urlset', entries: 50_000 })
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})

describe('sitemapUrl', () => {
  it('takes full http and https URLs, which need not be percent-encoded', () => {
    expect(sitemapUrl('https://shop.example/sitemap.xml')).toBe('https://shop.example/sitemap.xml')
    expect(sitemapUrl('https://shop.example/خريطة.xml')).toBe(
      'https://shop.example/%D8%AE%D8%B1%D9%8A%D8%B7%D8%A9.xml',
    )
  })

  it('refuses a path, another scheme, and a URL with spaces', () => {
    for (const value of [
      '/sitemap.xml',
      'sitemap.xml',
      'shop.example/sitemap.xml',
      'ftp://shop.example/sitemap.xml',
      'https://shop.example/my sitemap.xml',
      'https://',
    ]) {
      expect(sitemapUrl(value), value).toBeNull()
    }
  })
})

describe('sitemapTargets', () => {
  const line = (value: string, number = 1) => ({ value, line: number })

  it('fetches the distinct full URLs robots.txt names, up to the limit', () => {
    expect(
      sitemapTargets(
        [
          line('https://shop.example/a.xml'),
          line('/relative.xml'),
          line('https://shop.example/a.xml'),
          line('https://cdn.example/b.xml'),
          line('https://shop.example/c.xml'),
        ],
        'https://shop.example',
        2,
      ),
    ).toEqual({
      fetch: [
        { url: 'https://shop.example/a.xml', named: true },
        { url: 'https://cdn.example/b.xml', named: true },
      ],
      unchecked: 1,
    })
  })

  it('looks for /sitemap.xml when robots.txt names none as a full URL', () => {
    for (const named of [[], [line('/sitemap.xml')]]) {
      expect(sitemapTargets(named, 'https://shop.example', 3)).toEqual({
        fetch: [{ url: 'https://shop.example/sitemap.xml', named: false }],
        unchecked: 0,
      })
    }
  })
})

describe('collectSitemap', () => {
  it('reads a 2xx answer, and keeps any other status', () => {
    const base = { url: 'https://shop.example/sitemap.xml', named: true, truncated: false }
    expect(collectSitemap({ ...base, status: 200, body: utf8(URLSET) })).toEqual({
      ...base,
      outcome: 'fetched',
      status: 200,
      content: { kind: 'sitemap', format: 'urlset', entries: 2 },
    })
    expect(collectSitemap({ ...base, status: 404, body: utf8('Not Found') })).toEqual({
      url: base.url,
      named: true,
      outcome: 'unavailable',
      status: 404,
    })
  })
})
