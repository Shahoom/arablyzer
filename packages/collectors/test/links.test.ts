import { describe, expect, it } from 'vitest'
import { collectPage, MAX_SITE_LINKS, siteLinks } from '../src/index'
import { utf8 } from './helpers'

const page = (html: string, url = 'https://shop.example/ar/') =>
  collectPage({
    url,
    status: 200,
    headers: [['content-type', 'text/html; charset=utf-8']],
    body: utf8(html),
  })

describe('siteLinks', () => {
  it("gives the page's links to its own origin, each once, in the page's order", () => {
    const html = `
      <a href="/ar/offers/">العروض</a>
      <a href="offers/#top">العروض</a>
      <a href="https://shop.example/ar/offers/?page=2">التالي</a>
      <map><area href="/ar/map/" alt="الخريطة"></map>
      <a href="/ar/about">من نحن</a>`
    expect(siteLinks(page(html))).toEqual({
      links: [
        'https://shop.example/ar/offers/',
        'https://shop.example/ar/offers/?page=2',
        'https://shop.example/ar/map/',
        'https://shop.example/ar/about',
      ],
      more: false,
    })
  })

  it('leaves out the page itself, other origins, other schemes and credentials', () => {
    const html = `
      <a href="#main">تخطَّ</a>
      <a href="/ar/">الرئيسية</a>
      <a href="http://shop.example/ar/x">HTTP</a>
      <a href="https://www.shop.example/ar/x">www</a>
      <a href="https://shop.example:8443/ar/x">port</a>
      <a href="http://127.0.0.1/admin">local</a>
      <a href="http://169.254.169.254/latest/meta-data/">metadata</a>
      <a href="mailto:orders@shop.example">mail</a>
      <a href="tel:+96891234567">phone</a>
      <a href="javascript:void(0)">js</a>
      <a href="https://user:secret@shop.example/ar/x">credentials</a>
      <a href="https://[::1]/">v6</a>`
    expect(siteLinks(page(html))).toEqual({ links: [], more: false })
  })

  it('resolves against the base URL, and has nothing without HTML', () => {
    expect(siteLinks(page('<base href="/en/"><a href="about">About</a>'))).toEqual({
      links: ['https://shop.example/en/about'],
      more: false,
    })
    const text = collectPage({
      url: 'https://shop.example/a.txt',
      status: 200,
      headers: [['content-type', 'text/plain']],
      body: utf8('<a href="/x">x</a>'),
    })
    expect(siteLinks(text)).toEqual({ links: [], more: false })
  })

  // M2.3c review: a page with a hundred thousand links must not make a scan count, or test, them all.
  it('counts the first MAX_SITE_LINKS distinct addresses, and says there are more', () => {
    const anchors = (count: number) =>
      Array.from({ length: count }, (_, index) => `<a href="/p/${String(index)}">x</a>`).join('')
    // Repeats do not count: the same address a thousand times is one link.
    const repeated = siteLinks(page(`${anchors(MAX_SITE_LINKS)}${anchors(MAX_SITE_LINKS)}`))
    expect(repeated.links).toHaveLength(MAX_SITE_LINKS)
    expect(repeated.more).toBe(false)
    const exact = siteLinks(page(anchors(MAX_SITE_LINKS)))
    expect(exact.links).toHaveLength(MAX_SITE_LINKS)
    expect(exact.more).toBe(false)
    const over = siteLinks(page(anchors(MAX_SITE_LINKS + 1)))
    expect(over.links).toHaveLength(MAX_SITE_LINKS)
    expect(over.links.at(-1)).toBe(`https://shop.example/p/${String(MAX_SITE_LINKS - 1)}`)
    expect(over.more).toBe(true)
  })

  it('takes a limit of its own, and reads no further than it needs', () => {
    const html = Array.from({ length: 5 }, (_, i) => `<a href="/p/${String(i)}">x</a>`).join('')
    expect(siteLinks(page(html), 3)).toEqual({
      links: ['https://shop.example/p/0', 'https://shop.example/p/1', 'https://shop.example/p/2'],
      more: true,
    })
  })

  it('is fast on a hundred thousand anchors, however few lead to the site', () => {
    const external = Array.from(
      { length: 100_000 },
      (_, index) => `<a href="https://elsewhere.example/${String(index)}">x</a>`,
    ).join('')
    const facts = page(external)
    const started = performance.now()
    expect(siteLinks(facts)).toEqual({ links: [], more: false })
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})
