import { escapeHtml } from './html'
import { alternates, pageUrl, type Lang, type Site } from './site'

// Sitemaps (BUILD-PLAN §6.5): an index and one sitemap per section, every page in both languages,
// each naming its alternates as its <head> does, so Google finds the pairs from either side.

/** A page of the site, by its Arabic path: the English one is derived from it. */
export interface SitemapPage {
  readonly path: string
  /** YYYY-MM-DD, when the page has a date of its own (a tool's last update). */
  readonly lastmod?: string
  /**
   * The languages the page exists in; both when unset. A blog article with no translation is in
   * one: it is listed once, and names no alternate that is not there.
   */
  readonly langs?: readonly Lang[]
}

/** The sections, each one sitemap, in the order the index lists them. */
export const SITEMAP_SECTIONS = [
  'pages',
  'tools',
  'rules',
  'fix',
  'glossary',
  'blog',
  'compare',
] as const
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number]

/** Where a section's sitemap is, on the site: /sitemaps/tools.xml. */
export function sitemapPath(section: SitemapSection): string {
  return `/sitemaps/${section}.xml`
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** A sitemap of pages, each in Arabic and in English, with the hreflang of both and x-default. */
export function sitemapXml(site: Site, pages: readonly SitemapPage[]): string {
  const urls = pages.flatMap((page) => {
    if (page.lastmod !== undefined && !DATE.test(page.lastmod)) {
      throw new TypeError(`A sitemap date is YYYY-MM-DD: ${page.lastmod}`)
    }
    const langs = page.langs ?? (['ar', 'en'] as const)
    const links = alternates(site, page.path, langs)
      .map(
        (alternate) =>
          `<xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${escapeHtml(alternate.href)}"/>`,
      )
      .join('')
    const lastmod = page.lastmod === undefined ? '' : `<lastmod>${page.lastmod}</lastmod>`
    return langs.map(
      (lang) =>
        `<url><loc>${escapeHtml(pageUrl(site, lang, page.path))}</loc>${lastmod}${links}</url>`,
    )
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}

/** The index of the sections' sitemaps. */
export function sitemapIndexXml(site: Site): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...SITEMAP_SECTIONS.map(
      (section) =>
        `<sitemap><loc>${escapeHtml(`${site.origin}${sitemapPath(section)}`)}</loc></sitemap>`,
    ),
    '</sitemapindex>',
    '',
  ].join('\n')
}

/**
 * The site's robots.txt: every crawler may read every page but the API, and the sitemaps are
 * named. Reports stay open to crawlers, which must read their noindex to keep them out.
 */
export function robotsTxt(site: Site): string {
  return `User-agent: *\nDisallow: /api/\n\nSitemap: ${site.origin}/sitemap.xml\n`
}

/**
 * Where a page's Open Graph image is (M2.4c): /og/tools/rtl-check.png for /tools/rtl-check,
 * /og/en/index.png for /en/. The site's build draws it.
 */
export function ogImagePath(pagePath: string): string {
  if (!pagePath.startsWith('/')) throw new TypeError(`A path starts with "/": ${pagePath}`)
  return `/og${pagePath.endsWith('/') ? `${pagePath}index` : pagePath}.png`
}
