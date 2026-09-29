import { defineRule, type DetectorFinding } from '../../rule'

/** The temporary redirects that keep the request's method (RFC 9110 §15.4.3, §15.4.8). */
const TEMPORARY: ReadonlySet<number> = new Set([302, 307])

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * Whether a move from one address to the next is permanent by nature: from http: to https:, or
 * between a name and the same name with www., or both, and nothing else, port, path and query
 * kept. A site does not go back to HTTP, nor to its other name.
 */
function movesForGood(from: URL, to: URL): boolean {
  const scheme =
    from.protocol === to.protocol || (from.protocol === 'http:' && to.protocol === 'https:')
  const name =
    from.hostname === to.hostname ||
    from.hostname === `www.${to.hostname}` ||
    to.hostname === `www.${from.hostname}`
  const moved = from.protocol !== to.protocol || from.hostname !== to.hostname
  return (
    moved &&
    scheme &&
    name &&
    from.port === to.port &&
    from.pathname === to.pathname &&
    from.search === to.search
  )
}

/**
 * A temporary redirect (302 or 307) where the move is for good: to HTTPS, or between example.com
 * and www.example.com. Search engines take a permanent redirect as a sign that the new address
 * is the page's own, and a temporary one as none. Other temporary moves, to a language's path say,
 * may be meant: they are left alone.
 */
export const rule = defineRule({
  id: 'redirect-temporary',
  version: '1.0.0',
  category: 'crawl',
  severity: 'minor',
  needs: ['redirects'],
  messages: ['temporary'],
  appliesTo: (_page, evidence) => (evidence?.redirects?.length ?? 0) > 0,
  detect: ({ page, redirects = [] }): DetectorFinding<'temporary'>[] =>
    redirects.flatMap((hop, index) => {
      const to = redirects[index + 1]?.url ?? page.url
      const [fromUrl, toUrl] = [parse(hop.url), parse(to)]
      if (!TEMPORARY.has(hop.status) || fromUrl === null || toUrl === null) return []
      if (!movesForGood(fromUrl, toUrl)) return []
      return [
        {
          message: 'temporary',
          values: { status: hop.status, from: hop.url, to },
          url: hop.url,
          snippet: `${hop.status} ${hop.url} → ${to}`,
        },
      ]
    }),
})
