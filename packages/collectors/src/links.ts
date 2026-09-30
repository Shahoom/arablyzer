import type { PageFacts } from './page'

/**
 * How the check of one of the page's links to its own site ended (M2.3c): the status it
 * answered, to HEAD, or to GET where HEAD answered an error; or no answer, with why. The reasons
 * are `refused` for one of the statuses by which a site turns a visitor it takes for a bot away
 * (REFUSAL_STATUSES), `rate-limited` for a link never asked for because an earlier one got a 429,
 * `out-of-time` when the checks' time ran out first, or an egress error code (a timeout, a
 * refused address, a failed connection).
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
 * The statuses by which a site refuses a visitor it takes for a bot, one that must sign in, or
 * one it cannot serve just now: 401, 403, 407, 429 and 503. They say nothing of whether a link
 * works, so a link that answers one is not judged (M2.3c review). The report page reads the
 * same five as a site refusing the scan (apps/web report-model.ts, which a test ties to this).
 */
export const REFUSAL_STATUSES: ReadonlySet<number> = new Set([401, 403, 407, 429, 503])

/** What a request to a link came to: its status, or the code of why it got none. */
export type LinkAnswer = number | { readonly failure: string }

/**
 * How a check ends with a request's answer: a refusal is no answer about the link
 * (REFUSAL_STATUSES), any other status is, and a request without a status is no answer, with its
 * failure as the reason. The engine's checks and the rules' tests both end so.
 */
export function linkCheck(url: string, method: 'HEAD' | 'GET', answer: LinkAnswer): LinkCheck {
  if (typeof answer !== 'number') return { url, outcome: 'unanswered', reason: answer.failure }
  if (REFUSAL_STATUSES.has(answer)) return { url, outcome: 'unanswered', reason: 'refused' }
  return { url, outcome: 'answered', status: answer, method }
}

/**
 * Whether HEAD's answer leaves the link to a GET, which is what a visitor's browser asks: HEAD
 * answered an error (some servers do, and answer GET well), or the connection failed (some drop
 * HEAD). Not a timeout, nor an address the policy refuses, which GET would meet again; and not a
 * 429, by which the site asks for fewer requests (RFC 6585 §4).
 */
export function retriesWithGet(head: LinkAnswer): boolean {
  if (typeof head === 'number') return head >= 400 && head !== 429
  return head.failure === 'connect-failed'
}

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
