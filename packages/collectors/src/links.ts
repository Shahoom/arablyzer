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

/** The page's links to its own site, and how each check ended. */
export interface LinkFacts {
  /** The page's links to its own site (siteLinks), each address once. */
  readonly total: number
  /** Those asked for, in the page's order, with how each check ended. */
  readonly checks: readonly LinkCheck[]
  /**
   * Those not asked for: past the number a scan checks, or in paths the site's robots.txt keeps
   * the scan's bot from.
   */
  readonly skipped: { readonly limit: number; readonly robots: number }
}

/**
 * The page's links to its own site (M2.3c): every <a href> and <area href> whose address, its
 * fragment left out, is on the page's origin (the same scheme, host and port), is not the page
 * itself, and names no user or password; each address once, in the order the page first gives
 * it. The page's origin is the site the scan read robots.txt for, and asked for the page.
 */
export function siteLinks(page: PageFacts): string[] {
  if (page.html === null) return []
  let own: URL
  try {
    own = new URL(page.url)
  } catch {
    return []
  }
  own.hash = ''
  const seen = new Set<string>([own.href])
  const links: string[] = []
  for (const anchor of page.html.anchors) {
    const url = linkUrl(anchor.url)
    if (url?.origin !== own.origin) continue
    if (url.username !== '' || url.password !== '' || seen.has(url.href)) continue
    seen.add(url.href)
    links.push(url.href)
  }
  return links
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
