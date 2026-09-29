import { defineRule, type DetectorFinding } from '../../rule'

/**
 * Whether a redirect only moves an address from HTTP to HTTPS on the same name: the move the HSTS
 * preload list asks for first (hstspreload.org), before any move to the site's canonical name.
 */
function upgradesOnly(from: string, to: string): boolean {
  try {
    const [a, b] = [new URL(from), new URL(to)]
    return (
      a.protocol === 'http:' &&
      b.protocol === 'https:' &&
      a.hostname === b.hostname &&
      a.port === '' &&
      b.port === '' &&
      a.pathname === b.pathname &&
      a.search === b.search
    )
  } catch {
    return false
  }
}

/**
 * A page reached through more than one redirect: each is another request before the page, and
 * Google advises redirecting to the final address at once. A first redirect that only moves the
 * address to HTTPS on the same name is not counted, since HSTS preload asks for it; after it, one
 * more is the most a page needs. The finding points at the first address.
 */
export const rule = defineRule({
  id: 'redirect-chain',
  version: '1.0.0',
  category: 'crawl',
  severity: 'minor',
  needs: ['redirects'],
  messages: ['chain'],
  appliesTo: (_page, evidence) => (evidence?.redirects?.length ?? 0) > 0,
  detect: ({ page, redirects = [] }): DetectorFinding<'chain'>[] => {
    const [first, second] = redirects
    if (first === undefined) return []
    const upgrade = upgradesOnly(first.url, second?.url ?? page.url) ? 1 : 0
    if (redirects.length - upgrade < 2) return []
    return [
      {
        message: 'chain',
        values: { count: redirects.length, from: first.url, to: page.url },
        url: first.url,
        snippet: [...redirects.map((hop) => `${hop.status} ${hop.url}`), page.url].join(' → '),
      },
    ]
  },
})
