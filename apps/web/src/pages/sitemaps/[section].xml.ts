import { SITEMAP_SECTIONS, sitemapXml, type SitemapSection } from '@arablyzer/seo/sitemap'
import type { APIRoute } from 'astro'
import { siteOf } from '../../lib/site'
import { sitemapPages } from '../../lib/sitemaps'

export function getStaticPaths() {
  return SITEMAP_SECTIONS.map((section) => ({ params: { section } }))
}

export const GET: APIRoute = async ({ params, site }) =>
  new Response(sitemapXml(siteOf(site), await sitemapPages(params.section as SitemapSection)), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  })
