import { atomXml } from '@arablyzer/seo/feed'
import type { APIRoute } from 'astro'
import { blogFeed } from '../../lib/blog-feeds'
import { siteOf } from '../../lib/site'

export const GET: APIRoute = async ({ site }) =>
  new Response(atomXml(await blogFeed(siteOf(site), 'ar', 'atom')), {
    headers: { 'content-type': 'application/atom+xml; charset=utf-8' },
  })
