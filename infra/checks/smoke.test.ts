import { describe, expect, it } from 'vitest'
import { formatSmoke, PAGES, runSmoke } from './smoke'

// The smoke checks against a site made of answers: no network. What the real stack answers is
// `pnpm smoke` on a stack that runs (docs/deploy/staging.md, §9).

const SITE = new URL('https://staging.example.com')
const GOOD_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy': "frame-ancestors 'none'",
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=()',
  server: 'cloudflare',
}

interface Answer {
  status?: number
  headers?: Record<string, string>
  body?: string
}

/** A site that does everything right; `override` changes one answer. */
function site(override: Record<string, Answer> = {}): typeof fetch {
  const sitemap = `<urlset><loc>${SITE.origin}/</loc></urlset>`
  const answers: Record<string, Answer> = {
    '/robots.txt': {
      body: `User-agent: *\nDisallow: /api/\nSitemap: ${SITE.origin}/sitemap.xml\n`,
    },
    '/sitemap.xml': {
      body: `<sitemapindex><loc>${SITE.origin}/sitemaps/a.xml</loc></sitemapindex>`,
    },
    '/sitemaps/a.xml': { headers: { 'content-type': 'text/xml' }, body: sitemap },
    '/og/tools/rtl-check.png': { headers: { 'content-type': 'image/png' } },
    '/tools/rtl-check/': { status: 308, headers: { location: '/tools/rtl-check?a=b' } },
    '/no-such-page': { status: 404, headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/en/no-such-page': { status: 404, headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/api/reports/AbCdEfGhIjKlMnOpQrSt_-': { status: 404 },
    '/r/AbCdEfGhIjKlMnOpQrSt_-': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/en/r/AbCdEfGhIjKlMnOpQrSt_-': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/api/scans': { status: 403 },
    ...override,
  }
  return ((input: URL | string) => {
    const url = new URL(input.toString())
    if (url.protocol === 'http:') {
      return Promise.resolve(
        new Response(null, { status: 301, headers: { location: `https://${url.host}/` } }),
      )
    }
    const key = url.pathname
    const page = PAGES.find((p) => p.path === url.pathname)
    const answer =
      answers[key] ??
      (page !== undefined
        ? {
            body: `<html lang="${page.lang}" dir="${page.dir ?? (page.lang === 'ar' ? 'rtl' : 'ltr')}">`,
          }
        : { status: 404 })
    return Promise.resolve(
      new Response(answer.body ?? '', {
        status: answer.status ?? 200,
        headers: { ...GOOD_HEADERS, 'content-type': 'text/html', ...answer.headers },
      }),
    )
  }) as typeof fetch
}

const byName = (results: Awaited<ReturnType<typeof runSmoke>>) =>
  Object.fromEntries(results.map((r) => [r.name, r.problems]))

describe('runSmoke', () => {
  it('passes a site that does everything right', async () => {
    const results = await runSmoke({ site: SITE, fetch: site() })
    expect(results.flatMap((r) => r.problems)).toEqual([])
    expect(formatSmoke(results).failed).toBe(0)
  })

  it('finds a login page where the home page should be', async () => {
    const results = await runSmoke({
      site: SITE,
      fetch: site({
        '/': { status: 302, headers: { location: 'https://x.cloudflareaccess.com/' } },
      }),
    })
    expect(byName(results)['the home page answers, in Arabic, right to left']?.[0]).toMatch(/302/)
    expect(formatSmoke(results).failed).toBeGreaterThan(0)
  })

  it('finds a missing header and an origin that names its server', async () => {
    const results = await runSmoke({
      site: SITE,
      fetch: site({ '/': { headers: { 'x-frame-options': '', server: 'Caddy' } } }),
    })
    const problems = byName(results)['security headers, on a page and on a 404'] ?? []
    expect(problems.join('\n')).toMatch(/x-frame-options is ""/)
    expect(problems.join('\n')).toMatch(/Server says "Caddy"/)
  })

  it('finds a scan gate that is open, and an API that is down', async () => {
    const open = byName(
      await runSmoke({ site: SITE, fetch: site({ '/api/scans': { status: 202 } }) }),
    )
    expect(open['the scan API is there, and refuses a request without Turnstile']?.[0]).toMatch(
      /gate is open/,
    )
    const down = byName(
      await runSmoke({ site: SITE, fetch: site({ '/api/scans': { status: 502 } }) }),
    )
    expect(down['the scan API is there, and refuses a request without Turnstile']?.[0]).toMatch(
      /502/,
    )
  })

  it('finds a sitemap that names another site, and a 404 that may be indexed', async () => {
    const results = await runSmoke({
      site: SITE,
      fetch: site({
        '/sitemaps/a.xml': {
          headers: { 'content-type': 'text/xml' },
          body: '<loc>https://other.example/</loc>',
        },
        '/no-such-page': { status: 404 },
      }),
    })
    const named = byName(results)
    expect(named['every sitemap is XML, and every address in it is on this site']?.[0]).toMatch(
      /off the site/,
    )
    expect(named['an address with no page is a 404, never indexed']?.[0]).toMatch(/X-Robots-Tag/)
  })

  it('warns, and does not fail, when plain HTTP is not sent to HTTPS', async () => {
    const base = site()
    const fetcher = ((input: URL | string, init?: RequestInit) => {
      const url = new URL(input.toString())
      return url.protocol === 'http:'
        ? Promise.resolve(new Response('', { status: 200 }))
        : base(input, init)
    }) as typeof fetch
    const results = await runSmoke({ site: SITE, fetch: fetcher })
    const http = results.find((r) => r.name === 'plain HTTP goes to HTTPS')
    expect(http?.level).toBe('warn')
    expect(http?.problems.length).toBeGreaterThan(0)
    expect(formatSmoke(results).failed).toBe(0)
  })

  it('reports a request that throws as a failed check, not a crash', async () => {
    const results = await runSmoke({
      site: SITE,
      fetch: () => Promise.reject(new Error('connect ECONNREFUSED')),
    })
    expect(results.every((r) => r.problems.length > 0)).toBe(true)
    expect(results[0]?.problems[0]).toMatch(/ECONNREFUSED/)
  })
})
