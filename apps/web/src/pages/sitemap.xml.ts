import { sitemapIndexXml } from '@arablyzer/seo/sitemap'
import type { APIRoute } from 'astro'
import { siteOf } from '../lib/site'

export const GET: APIRoute = ({ site }) =>
  new Response(sitemapIndexXml(siteOf(site)), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  })
