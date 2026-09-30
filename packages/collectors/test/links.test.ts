import { describe, expect, it } from 'vitest'
import {
  collectPage,
  linkCheck,
  MAX_SITE_LINKS,
  REFUSAL_STATUSES,
  retriesWithGet,
  siteLinks,
} from '../src/index'
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
    // Parsing the page is the test's setup, and slow when the machine is busy.
  }, 60_000)
})

// M2.3c review: a site that takes a check for a bot answers 401, 403, 407, 429 or 503, as it does a
// visitor it takes for one (the report page reads these five as a refusal too). That says nothing
// of whether the link works, so the link is not judged.
describe('linkCheck', () => {
  const url = 'https://shop.example/ar/members/'

  it('reads the five statuses of a refusal as no answer about the link', () => {
    expect([...REFUSAL_STATUSES].sort()).toEqual([401, 403, 407, 429, 503])
    for (const status of REFUSAL_STATUSES) {
      expect(linkCheck(url, 'GET', status), String(status)).toEqual({
        url,
        outcome: 'unanswered',
        reason: 'refused',
      })
    }
  })

  it.each([200, 204, 301, 302, 304, 400, 404, 405, 410, 451, 500, 501, 502, 504])(
    'reads %s as the link’s answer, with the request that got it',
    (status) => {
      expect(linkCheck(url, 'HEAD', status)).toEqual({
        url,
        outcome: 'answered',
        status,
        method: 'HEAD',
      })
      expect(linkCheck(url, 'GET', status)).toMatchObject({ outcome: 'answered', method: 'GET' })
    },
  )

  it('gives why a request got no status', () => {
    expect(linkCheck(url, 'HEAD', { failure: 'timeout' })).toEqual({
      url,
      outcome: 'unanswered',
      reason: 'timeout',
    })
  })
})

describe('retriesWithGet', () => {
  it('asks again with GET where HEAD answered an error, as servers that refuse HEAD do', () => {
    for (const status of [400, 403, 404, 405, 500, 501, 503]) {
      expect(retriesWithGet(status), String(status)).toBe(true)
    }
    for (const status of [200, 204, 301, 302, 304]) {
      expect(retriesWithGet(status), String(status)).toBe(false)
    }
  })

  it('asks again where the connection failed, as a server that drops HEAD makes it', () => {
    expect(retriesWithGet({ failure: 'connect-failed' })).toBe(true)
  })

  it('does not ask again after a timeout, a refused address, or any other failure', () => {
    for (const failure of [
      'timeout',
      'out-of-time',
      'aborted',
      'blocked-address',
      'blocked-host',
      'port-not-allowed',
      'dns-failed',
      'tls-failed',
      'too-large',
      'failed',
    ]) {
      expect(retriesWithGet({ failure }), failure).toBe(false)
    }
  })

  it('does not ask again after a 429: the site asked for fewer requests', () => {
    expect(retriesWithGet(429)).toBe(false)
  })
})
