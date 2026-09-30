import { describe, expect, it } from 'vitest'
import {
  collectSitemap,
  readSitemap,
  SITEMAP_MAX_ATTRIBUTES,
  SITEMAP_MAX_DEPTH,
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

describe('readSitemap: namespaces, resolved without sax', () => {
  const root = (inner: string, attributes = '') =>
    `<urlset xmlns="${SITEMAP_NAMESPACE}"${attributes}>${inner}</urlset>`

  it('counts an entry by the namespace it is in: its own declaration, then its ancestors’', () => {
    // A url in another default namespace, or under a prefix bound elsewhere, is not the protocol's.
    expect(read(root('<url xmlns="urn:other"><loc/></url><url><loc/></url>'))).toMatchObject({
      entries: 1,
    })
    expect(
      read(root('<x:url/><url/><y:url xmlns:y="urn:other"/>', ' xmlns:x="urn:other"')),
    ).toMatchObject({ entries: 1 })
    // The protocol's namespace under a prefix of its own, declared on the root or on the entry.
    expect(
      read(
        root(
          '<s:url/><t:url xmlns:t="' + SITEMAP_NAMESPACE + '"/>',
          ` xmlns:s="${SITEMAP_NAMESPACE}"`,
        ),
      ),
    ).toMatchObject({ entries: 2 })
  })

  it('finds a prefix that is not bound where it is used, as XML namespaces ask', () => {
    for (const unbound of [
      root('<url><loc>https://shop.example/</loc><image:image/></url>'),
      root('<url xhtml:href="/ar/"/>'),
      // Bound on a sibling, or on an element that has closed: not in scope.
      root('<a xmlns:p="urn:p"/><p:b/>'),
    ]) {
      expect(read(unbound), unbound).toMatchObject({ kind: 'not-xml' })
    }
    for (const bound of [
      root('<url><image:image/></url>', ' xmlns:image="urn:image"'),
      root('<url xml:lang="ar"><xhtml:link xhtml:x="1" xmlns:xhtml="urn:xhtml"/></url>'),
      root('<a xmlns:p="urn:p"><b><p:c p:d="1"/></b></a>'),
    ]) {
      expect(read(bound), bound).toMatchObject({ kind: 'sitemap', format: 'urlset' })
    }
  })
})

// M2.3c review: sax checks its buffers once per write and slows quadratically with the attributes
// and namespaces of the elements it reads, so a small gzipped file held the scanner's event loop
// for seconds to hours, or its memory for gigabytes, while the watchdog timers could not fire.
describe('readSitemap: input built to be slow or large', () => {
  const NS = SITEMAP_NAMESPACE
  /** The most a scan reads of one file (BUILD-PLAN §11). */
  const READ_LIMIT = 25 * 1024 * 1024
  /** As large as the files the review built: a scan reads them whole, or cut at READ_LIMIT. */
  const LARGE = 25_000_000
  /**
   * A generous bound: the reader takes well under a second on each, and a busy machine running
   * every suite at once took over two; before the fix these inputs took seconds to hours.
   */
  const QUICK_MS = 10_000

  /** Reads text of this size, and says how long it took. */
  function timed(text: string, truncated = false) {
    const body = utf8(text)
    const started = performance.now()
    const content = readSitemap(body, truncated)
    return { content, ms: performance.now() - started, bytes: body.length }
  }

  it('reads a root with 160,000 attributes without slowing down', () => {
    const { content, ms } = timed(`<urlset xmlns="${NS}"` + ' a=""'.repeat(160_000) + '></urlset>')
    expect(ms).toBeLessThan(QUICK_MS)
    // The same attribute again is one attribute to sax: what is left lists nothing.
    expect(content).toEqual({ kind: 'sitemap', format: 'urlset', entries: 0 })
  })

  it('reads a root with 5.2 million attributes, 25 MB of them', () => {
    const { content, ms, bytes } = timed(
      `<urlset xmlns="${NS}"` + ' a=""'.repeat(5_200_000) + '></urlset>',
    )
    expect(bytes).toBeGreaterThan(LARGE)
    expect(ms).toBeLessThan(QUICK_MS)
    expect(content).toEqual({ kind: 'sitemap', format: 'urlset', entries: 0 })
  })

  it('stops at an element with more than the attributes a sitemap needs', () => {
    // The namespace declaration is one of the root's attributes.
    const distinct = (count: number) =>
      Array.from({ length: count }, (_, index) => ` a${String(index)}=""`).join('')
    const most = timed(`<urlset xmlns="${NS}"${distinct(SITEMAP_MAX_ATTRIBUTES - 1)}/>`)
    expect(most.content).toEqual({ kind: 'sitemap', format: 'urlset', entries: 0 })
    const over = timed(`<urlset xmlns="${NS}"${distinct(SITEMAP_MAX_ATTRIBUTES)}/>`)
    expect(over.content).toMatchObject({ kind: 'not-xml', line: 1 })
    // Two million distinct ones held a gigabyte and a half before this stopped them.
    const many = timed(`<urlset xmlns="${NS}"${distinct(2_300_000)}></urlset>`)
    expect(many.content).toMatchObject({ kind: 'not-xml', line: 1 })
    expect(many.ms).toBeLessThan(QUICK_MS)
  })

  it('stops at elements nested deeper than a sitemap goes, closed or not', () => {
    const nested = (levels: number, closed: boolean) =>
      `<urlset xmlns="${NS}">` +
      '<a>'.repeat(levels - 1) +
      (closed ? '</a>'.repeat(levels - 1) : '') +
      (closed ? '</urlset>' : '')
    expect(timed(nested(SITEMAP_MAX_DEPTH, true)).content).toEqual({
      kind: 'sitemap',
      format: 'urlset',
      entries: 0,
    })
    for (const closed of [true, false]) {
      const { content } = timed(nested(SITEMAP_MAX_DEPTH + 1, closed))
      expect(content, String(closed)).toMatchObject({ kind: 'not-xml', line: 1 })
    }
  })

  it('reads 40,000 elements that each declare a prefix without slowing down', () => {
    const { content, ms } = timed(`<urlset xmlns="${NS}">` + '<a xmlns:p="x">'.repeat(40_000))
    expect(ms).toBeLessThan(QUICK_MS)
    expect(content).toMatchObject({ kind: 'not-xml', line: 1 })
  })

  it('reads 8.7 million nested elements, 25 MB of them', () => {
    const { content, ms, bytes } = timed(`<urlset xmlns="${NS}">` + '<a>'.repeat(8_700_000))
    expect(bytes).toBeGreaterThan(LARGE)
    expect(ms).toBeLessThan(QUICK_MS)
    expect(content).toMatchObject({ kind: 'not-xml' })
  })

  it('stops at a name, value or comment longer than sax reads, which it says is not XML', () => {
    const value = timed(`<urlset xmlns="${NS}" a="` + 'x'.repeat(READ_LIMIT) + '"></urlset>')
    expect(value.bytes).toBeGreaterThan(LARGE)
    expect(value.ms).toBeLessThan(QUICK_MS)
    expect(value.content).toMatchObject({ kind: 'not-xml' })
    const comment = timed('<!--' + 'x'.repeat(1_000_000) + `--><urlset xmlns="${NS}"/>`)
    expect(comment.ms).toBeLessThan(QUICK_MS)
    expect(comment.content).toMatchObject({ kind: 'not-xml' })
    // Text is not held whole: a long address, or a long run of text, is read as it comes.
    const long = `<urlset xmlns="${NS}"><url><loc>https://shop.example/${'x'.repeat(1_000_000)}</loc></url></urlset>`
    expect(timed(long).content).toEqual({ kind: 'sitemap', format: 'urlset', entries: 1 })
  })

  it('reads text of 25 MiB of blank lines after a first line that is no URL, at once', () => {
    const { content, ms, bytes } = timed('h' + '\n'.repeat(READ_LIMIT))
    expect(bytes).toBeGreaterThan(LARGE)
    expect(ms).toBeLessThan(QUICK_MS)
    expect(content).toEqual({ kind: 'text', line: 1 })
  })

  it('reads text whose only fault is on its last line, out of millions of lines', () => {
    const urls = 'https://a.example/\r\n'.repeat(200_000)
    const { content, ms } = timed(`${urls}\n\n\r\n${'\n'.repeat(3_000_000)}nope`)
    expect(ms).toBeLessThan(QUICK_MS)
    expect(content).toEqual({ kind: 'text', line: 200_000 + 3_000_000 + 4 })
  })

  it('is never thrown at by what sax does with an attribute named like an Object method', () => {
    const at = (name: string) =>
      `<urlset xmlns="${NS}" ${name}="x" b="y"><url><loc>https://shop.example/</loc></url></urlset>`
    // sax keeps attributes on a plain object, and asks it hasOwnProperty for each attribute after.
    expect(() => read(at('hasOwnProperty'))).not.toThrow()
    expect(read(at('hasOwnProperty'))).toMatchObject({ kind: 'not-xml' })
    for (const name of ['toString', '__proto__', 'constructor']) {
      expect(read(at(name)), name).toEqual({ kind: 'sitemap', format: 'urlset', entries: 1 })
    }
  })

  it('still reads a sitemap of 400,000 URLs', () => {
    const entry = (index: number) =>
      `<url><loc>https://shop.example/ar/products/${String(index)}?size=large&amp;x=1</loc><lastmod>2026-09-29</lastmod></url>\n`
    let body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${NS}">\n`
    for (let index = 0; index < 400_000; index++) body += entry(index)
    const { content, ms } = timed(`${body}</urlset>`)
    expect(content).toEqual({ kind: 'sitemap', format: 'urlset', entries: 400_000 })
    expect(ms).toBeLessThan(QUICK_MS)
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

describe('collectSitemap: what could not be checked', () => {
  const base = { url: 'https://shop.example/sitemap.xml', named: true, truncated: false }

  it('keeps as failed a sitemap the site turns the scan away from, or cannot answer for', () => {
    for (const status of [401, 403, 407, 429, 500, 502, 503]) {
      expect(collectSitemap({ ...base, status, body: utf8('no') }), String(status)).toEqual({
        outcome: 'failed',
        url: base.url,
        named: true,
        code: 'refused',
        status,
      })
    }
  })

  it('keeps as unavailable what the site says is not there, or cannot be had', () => {
    for (const status of [400, 404, 410, 451]) {
      expect(collectSitemap({ ...base, status, body: utf8('no') }), String(status)).toEqual({
        outcome: 'unavailable',
        url: base.url,
        named: true,
        status,
      })
    }
  })

  it('reads a gzip file that will not decompress as the site’s own fault', () => {
    expect(collectSitemap({ ...base, status: 200, body: null })).toEqual({
      outcome: 'fetched',
      url: base.url,
      named: true,
      status: 200,
      content: { kind: 'compression' },
      truncated: false,
    })
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
