import type { PageFacts } from './page'

/**
 * How the check of one of the page's links to its own site ended (M2.3c): the status it
 * answered, to HEAD, or to GET when HEAD answered an error; or no answer, with why: an egress
 * error code (a timeout, a refused address, a failed connection), `rate-limited` for a 429, or
 * `out-of-time` when the checks' time ran out first.
 */
export type LinkCheck =
  | {
      readonly url: string
      readonly outcome: 'answered'
      readonly status: number
      readonly method: 'HEAD' | 'GET'
    }
  | { readonly url: string; readonly outcome: 'unanswered'; readonly reason: string }

/**
 * The page's links to its own site (siteLinks), each address once, and how each check ended.
 * The count is bounded (MAX_SITE_LINKS), so a page of a hundred thousand links costs no more to
 * count than one of a thousand.
 */
export interface LinkFacts {
  /**
   * The page's links to its own site that were counted: at most MAX_SITE_LINKS, the first ones
   * on the page. With `more`, the page has others, and this is "at least".
   */
  readonly total: number
  /** The page has more links to its own site than were counted. */
  readonly more: boolean
  /** Those asked for, in the page's order, with how each check ended. */
  readonly checks: readonly LinkCheck[]
  /**
   * Those not asked for: past the number a scan checks, or in paths the site's robots.txt keeps
   * the scan's bot from. Links past the number a scan checks were not tested against robots.txt.
   */
  readonly skipped: { readonly limit: number; readonly robots: number }
}

/**
 * The most links to its own site a scan counts on a page (M2.3c review): the first distinct ones,
 * in the page's order. Our own parameter, chosen so the count of a hostile page's links stays
 * cheap: a scan asks for a few dozen of them, and reports the number as "at least" past this.
 */
export const MAX_SITE_LINKS = 1_000

/** The page's links to its own site that siteLinks counted, and whether it left any out. */
export interface SiteLinks {
  readonly links: readonly string[]
  readonly more: boolean
}

/**
 * The page's links to its own site (M2.3c): every <a href> and <area href> whose address, its
 * fragment left out, is on the page's origin (the same scheme, host and port), is not the page
 * itself, and names no user or password; each address once, in the order the page first gives
 * it, and at most `limit` of them (MAX_SITE_LINKS): `more` says the page has others. The page's
 * origin is the site the scan read robots.txt for, and asked for the page.
 */
export function siteLinks(page: PageFacts, limit = MAX_SITE_LINKS): SiteLinks {
  if (page.html === null) return { links: [], more: false }
  let own: URL
  try {
    own = new URL(page.url)
  } catch {
    return { links: [], more: false }
  }
  own.hash = ''
  const seen = new Set<string>([own.href])
  const links: string[] = []
  for (const anchor of page.html.anchors) {
    const url = linkUrl(anchor.url)
    if (url?.origin !== own.origin) continue
    if (url.username !== '' || url.password !== '' || seen.has(url.href)) continue
    // One more than the limit is enough to know there are others; the rest is never read.
    if (links.length >= limit) return { links, more: true }
    seen.add(url.href)
    links.push(url.href)
  }
  return { links, more: false }
}

/** An anchor's address without its fragment, over http or https; null otherwise. */
export function linkUrl(address: string | null): URL | null {
  if (address === null) return null
  let url: URL
  try {
    url = new URL(address)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  url.hash = ''
  return url
}
