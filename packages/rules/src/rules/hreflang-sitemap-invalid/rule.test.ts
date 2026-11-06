import type { SitemapFacts, SitemapUrl } from '@arablyzer/collectors'
import { describe, expect, it } from 'vitest'
import { applies, detectAll, fixtureEvidence, htmlPage } from '../../../test/helpers'
import { rule } from './rule'

const ORIGIN = 'https://shop.example'
const page = htmlPage('<p>حلوى عمانية</p>', { url: `${ORIGIN}/` })
const robots = {
  outcome: 'fetched',
  url: `${ORIGIN}/robots.txt`,
  status: 200,
  robots: { groups: [], sitemaps: [] },
  truncated: false,
} as const
const AR = `${ORIGIN}/ar/oud`
const EN = `${ORIGIN}/en/oud`
const url = (loc: string, ...alternates: [string, string][]): SitemapUrl => ({
  loc,
  lastmod: null,
  alternates: alternates.map(([hreflang, href]) => ({ hreflang, href })),
})
const evidence = (urls: SitemapUrl[]) => {
  const sitemap: SitemapFacts = {
    named: [{ value: `${ORIGIN}/sitemap.xml`, line: 1 }],
    checked: [
      {
        outcome: 'fetched',
        url: `${ORIGIN}/sitemap.xml`,
        named: true,
        status: 200,
        content: { kind: 'sitemap', format: 'urlset', entries: urls.length },
        truncated: false,
        urls: { urls, total: urls.length },
      },
    ],
    unchecked: 0,
  }
  return { page, robots, sitemap }
}
const found = (urls: SitemapUrl[]) => detectAll(rule, evidence(urls)).map((f) => f.message)

describe('hreflang-sitemap-invalid', () => {
  it('fails the wrong fixture: a code Google does not take, and a page that does not list its partner back', async () => {
    const wrong = await fixtureEvidence(rule.id, 'wrong')
    expect(applies(rule, wrong)).toBe(true)
    expect(detectAll(rule, wrong).map((f) => [f.message, f.values?.url, f.values?.code])).toEqual([
      ['no-return', AR, undefined],
      ['bad-code', AR, 'en-UK'],
    ])
  })

  it('passes the right fixture: each page lists both, and x-default', async () => {
    const right = await fixtureEvidence(rule.id, 'right')
    expect(applies(rule, right)).toBe(true)
    expect(detectAll(rule, right)).toEqual([])
  })

  const both = [url(AR, ['ar', AR], ['en', EN]), url(EN, ['ar', AR], ['en', EN])]

  it('passes two pages that list each other and themselves', () => {
    expect(found(both)).toEqual([])
  })

  it('names an entry that leaves out itself', () => {
    expect(found([url(AR, ['en', EN]), url(EN, ['ar', AR], ['en', EN])])).toEqual(['no-self'])
  })

  it('names an alternate that is a page of the file and does not list the entry back', () => {
    expect(found([url(AR, ['ar', AR], ['en', EN]), url(EN, ['en', EN])])).toEqual(['no-return'])
  })

  it('leaves an alternate that is not an entry of the file: it may be in another sitemap', () => {
    expect(found([url(AR, ['ar', AR], ['en', EN])])).toEqual([])
  })

  it('names a code Google does not accept, and takes x-default and a region', () => {
    expect(found([url(AR, ['ar', AR], ['ara', `${ORIGIN}/x`])])).toEqual(['bad-code'])
    expect(found([url(AR, ['ar-SA', AR], ['x-default', AR], ['en-GB', `${ORIGIN}/x`])])).toEqual([])
  })

  it('names an alternate that is not a full address', () => {
    expect(found([url(AR, ['ar', AR], ['en', '/en/oud'])])).toEqual(['relative'])
  })

  it('counts each kind once for a sitemap, with how many', () => {
    const findings = detectAll(rule, evidence([url(AR, ['en', EN]), url(EN, ['ar', AR])]))
    expect(findings.map((f) => [f.message, f.values?.count])).toEqual([['no-self', 2]])
  })

  it('does not apply when no entry has an alternate, or the site is not public', () => {
    expect(rule.appliesTo(page, evidence([url(AR), url(EN)]))).toBe(false)
    expect(rule.appliesTo(htmlPage('<p>x</p>', { url: 'http://localhost/' }), evidence(both))).toBe(
      false,
    )
  })
})
