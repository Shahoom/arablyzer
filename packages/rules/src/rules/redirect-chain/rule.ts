import { defineRule, type DetectorFinding } from '../../rule'

/**
 * A page reached through more than one redirect: each is another request before the page, and
 * Google advises redirecting to the final address at once. The finding points at the first
 * address, which should lead straight to the page.
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
    const [first] = redirects
    if (first === undefined || redirects.length < 2) return []
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
