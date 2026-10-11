import type { APIRoute } from 'astro'
import { SECURITY_EMAIL } from '@arablyzer/i18n/legal'
import { pageUrl, PATHS } from '@arablyzer/seo/site'
import { siteOf } from '../../lib/site'

/** RFC 9116: the file asks for an expiry no further than a year, so the build writes one. */
const VALID_DAYS = 365

export const GET: APIRoute = ({ site }) => {
  const origin = siteOf(site)
  const expires = new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000)
  const body = [
    `Contact: mailto:${SECURITY_EMAIL}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: ar, en',
    `Canonical: ${origin.origin}/.well-known/security.txt`,
    `Policy: ${pageUrl(origin, 'en', PATHS.security)}`,
    '',
  ].join('\n')
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
