import { describe, expect, it } from 'vitest'
import { ogImagePath, robotsTxt, sitemapIndexXml, sitemapXml } from '../src/sitemap'
import { PREVIEW_SITE } from '../src/site'

describe('sitemapXml', () => {
  const xml = sitemapXml(PREVIEW_SITE, [
    { path: '/' },
    { path: '/tools/rtl-check', lastmod: '2026-09-24' },
  ])

  it('lists each page in both languages, each with the alternates of both and x-default', () => {
    expect(xml).toContain('<loc>https://arablyzer.example/</loc>')
    expect(xml).toContain('<loc>https://arablyzer.example/en/</loc>')
    expect(xml).toContain('<loc>https://arablyzer.example/en/tools/rtl-check</loc>')
    expect(xml.match(/<url>/g)).toHaveLength(4)
    expect(
      xml.match(/hreflang="x-default" href="https:\/\/arablyzer\.example\/tools\/rtl-check"/g),
    ).toHaveLength(2)
    expect(xml).toContain('<lastmod>2026-09-24</lastmod>')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })

  it('refuses a date that is not YYYY-MM-DD', () => {
    expect(() => sitemapXml(PREVIEW_SITE, [{ path: '/', lastmod: '24/09/2026' }])).toThrow(
      /YYYY-MM-DD/,
    )
  })
})

describe('sitemapIndexXml and robotsTxt', () => {
  it('name the sections’ sitemaps, and the index', () => {
    expect(sitemapIndexXml(PREVIEW_SITE)).toContain(
      '<loc>https://arablyzer.example/sitemaps/tools.xml</loc>',
    )
    expect(robotsTxt(PREVIEW_SITE)).toBe(
      'User-agent: *\nDisallow: /api/\n\nSitemap: https://arablyzer.example/sitemap.xml\n',
    )
  })
})

describe('ogImagePath', () => {
  it("names a page's image after its path", () => {
    expect(ogImagePath('/')).toBe('/og/index.png')
    expect(ogImagePath('/en/')).toBe('/og/en/index.png')
    expect(ogImagePath('/tools/rtl-check')).toBe('/og/tools/rtl-check.png')
    expect(ogImagePath('/en/rules/title-missing')).toBe('/og/en/rules/title-missing.png')
  })
})
