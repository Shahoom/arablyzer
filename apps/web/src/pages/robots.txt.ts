import { robotsTxt } from '@arablyzer/seo/sitemap'
import type { APIRoute } from 'astro'
import { siteOf } from '../lib/site'

export const GET: APIRoute = ({ site }) =>
  new Response(robotsTxt(siteOf(site)), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
