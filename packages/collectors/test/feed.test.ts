import { describe, expect, it } from 'vitest'
import { collectFeed, MAX_FEED_ITEMS, type FeedFacts } from '../src/index'

const encode = (text: string) => new TextEncoder().encode(text)
const read = (text: string): FeedFacts => collectFeed({ body: encode(text) })

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>متجر الواحة</title>
    <link>https://shop.example/</link>
    <description>منتجات</description>
    <item>
      <g:id>A1</g:id>
      <title><![CDATA[عطر العود الملكي]]></title>
      <description>عطر فاخر</description>
      <link>https://shop.example/p/a1</link>
      <g:image_link>https://shop.example/a1.jpg</g:image_link>
      <g:price>120.00 SAR</g:price>
      <g:availability>in_stock</g:availability>
      <g:shipping><g:country>SA</g:country><g:price>0 SAR</g:price></g:shipping>
    </item>
    <item>
      <g:id>A2</g:id>
      <title>Oud</title>
    </item>
  </channel>
</rss>`

describe('collectFeed', () => {
  it('reads an RSS 2.0 feed with the Google namespace', () => {
    const feed = read(RSS)
    expect(feed.kind).toBe('feed')
    if (feed.kind !== 'feed') return
    expect(feed.format).toBe('rss')
    expect(feed.more).toBe(false)
    expect(feed.items).toHaveLength(2)
    const first = feed.items[0]
    expect(first?.line).toBe(7)
    expect(first?.attributes.get('id')).toBe('A1')
    expect(first?.attributes.get('title')).toBe('عطر العود الملكي')
    expect(first?.attributes.get('image_link')).toBe('https://shop.example/a1.jpg')
    expect(first?.attributes.get('price')).toBe('120.00 SAR')
    // A nested attribute is there, its inner values are not the item's own.
    expect(first?.attributes.get('shipping')).toBe('')
    expect(first?.attributes.has('country')).toBe(false)
    expect(feed.items[1]?.attributes.has('price')).toBe(false)
  })

  it('reads an Atom 1.0 feed: the link in href, the summary as the description', () => {
    const feed =
      read(`<feed xmlns="http://www.w3.org/2005/Atom" xmlns:g="http://base.google.com/ns/1.0">
      <title>x</title><link href="https://shop.example/"/>
      <entry><g:id>1</g:id><title>t</title><summary>d</summary>
        <link rel="alternate" href="https://shop.example/p/1"/></entry></feed>`)
    expect(feed.kind).toBe('feed')
    if (feed.kind !== 'feed') return
    expect(feed.format).toBe('atom')
    expect(feed.items[0]?.attributes.get('link')).toBe('https://shop.example/p/1')
    expect(feed.items[0]?.attributes.get('description')).toBe('d')
  })

  it('reads a tab-delimited feed: names folded, quotes and a byte order mark allowed', () => {
    const feed = read(
      '﻿id\ttitle\t"Image Link"\tprice\r\n1\tعطر\thttps://x/a.jpg\t12.500 OMR\r\n\r\n2\tمسك\n',
    )
    expect(feed.kind).toBe('feed')
    if (feed.kind !== 'feed') return
    expect(feed.format).toBe('tsv')
    expect(feed.items.map((item) => item.attributes.get('id'))).toEqual(['1', '2'])
    expect(feed.items[0]?.attributes.get('image_link')).toBe('https://x/a.jpg')
    expect(feed.items[0]?.line).toBe(2)
    expect(feed.items[1]?.attributes.has('price')).toBe(false)
  })

  it('stops after MAX_FEED_ITEMS and says there were more', () => {
    const item = '<item><g:id>1</g:id><title>t</title></item>'
    const feed = read(
      `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>${item.repeat(MAX_FEED_ITEMS + 3)}</channel></rss>`,
    )
    expect(feed.kind === 'feed' && feed.items.length).toBe(MAX_FEED_ITEMS)
    expect(feed.kind === 'feed' && feed.more).toBe(true)
  })

  it.each([
    ['', 'empty'],
    ['   \n', 'empty'],
    ['<!doctype html><html><body>مرحبا</body></html>', 'html'],
    ['<html><head></head></html>', 'html'],
    ['<rss version="2.0"><channel><title>x</title></channel></rss>', 'no-items'],
    ['{"items":[]}', 'not-a-feed'],
    ['<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url/></urlset>', 'not-a-feed'],
    ['<rss><channel><item><title>x</item></channel></rss>', 'not-xml'],
    ['hello world\nfoo bar', 'no-columns'],
    ['id\ttitle\n', 'no-items'],
  ])('%j is %s', (text, reason) => {
    expect(read(text)).toMatchObject({ kind: 'unreadable', reason })
  })

  it('names the root of a file that is XML but no feed, and where broken XML breaks', () => {
    expect(read('<urlset></urlset>')).toMatchObject({ reason: 'not-a-feed', root: 'urlset' })
    expect(read('<rss>\n<channel>\n<item></channel>')).toMatchObject({
      reason: 'not-xml',
      line: 3,
    })
  })

  it('refuses bytes that are not UTF-8 and a gzip file', () => {
    expect(collectFeed({ body: Uint8Array.of(0xe3, 0xd1, 0xcd, 0xc8, 0xc7) })).toMatchObject({
      reason: 'not-utf8',
    })
    expect(collectFeed({ body: Uint8Array.of(0x1f, 0x8b, 8, 0) })).toMatchObject({
      reason: 'compressed',
    })
  })

  it('keeps the first value of a repeated attribute and ignores other namespaces', () => {
    const feed = read(`<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0" xmlns:x="urn:x">
      <channel><item><g:id>1</g:id><x:id>2</x:id><g:id>3</g:id><title>t</title></item></channel></rss>`)
    expect(feed.kind === 'feed' && feed.items[0]?.attributes.get('id')).toBe('1')
  })
})
