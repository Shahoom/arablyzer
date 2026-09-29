import { describe, expect, it } from 'vitest'
import { collectPage, siteLinks } from '../src/index'
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
    expect(siteLinks(page(html))).toEqual([
      'https://shop.example/ar/offers/',
      'https://shop.example/ar/offers/?page=2',
      'https://shop.example/ar/map/',
      'https://shop.example/ar/about',
    ])
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
    expect(siteLinks(page(html))).toEqual([])
  })

  it('resolves against the base URL, and has nothing without HTML', () => {
    expect(siteLinks(page('<base href="/en/"><a href="about">About</a>'))).toEqual([
      'https://shop.example/en/about',
    ])
    const text = collectPage({
      url: 'https://shop.example/a.txt',
      status: 200,
      headers: [['content-type', 'text/plain']],
      body: utf8('<a href="/x">x</a>'),
    })
    expect(siteLinks(text)).toEqual([])
  })
})
