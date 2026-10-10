import { rssXml } from '@arablyzer/seo/feed'
import type { APIRoute } from 'astro'
import { blogFeed } from '../../../lib/blog-feeds'
import { siteOf } from '../../../lib/site'

export const GET: APIRoute = async ({ site }) =>
  new Response(rssXml(await blogFeed(siteOf(site), 'en', 'rss')), {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  })
