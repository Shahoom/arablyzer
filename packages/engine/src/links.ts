import {
  linkCheck,
  retriesWithGet,
  siteLinks,
  type LinkAnswer,
  type LinkCheck,
  type LinkFacts,
  type PageFacts,
} from '@arablyzer/collectors'
import { safeFetch, type FetchResult, type SafeFetchOptions } from '@arablyzer/egress'
import { budget } from './timeout'

/** The page's links to its own site a scan asks for, at most: the first ones on the page. */
export const MAX_LINKS = 50
/** Each request, HEAD or GET, gets this long at most. */
export const LINK_TIMEOUT_MS = 10_000
/** All the checks together; a link not answered by then is not judged. */
export const LINKS_TIMEOUT_MS = 20_000
/** Requests to the site at once. */
export const CONCURRENCY = 4
/**
 * Choosing the links to ask for is synchronous work, robots.txt tested for each; after this long
 * without giving the event loop back, it does (M2.3c review), so a timer, an abort or a health
 * check can fire while a hostile robots.txt is read.
 */
const SLICE_MS = 20

const PAGE_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

export interface LinkContext {
  /** The page's own fetch options: its user agent, its lockdown policy and its resolver. */
  readonly base: SafeFetchOptions
  /**
   * Whether robots.txt keeps the scan's bot from an address. The links follow the `*` group too,
   * which the page does not; the caller decides, and asks of the links to be checked alone.
   */
  readonly optedOut: (url: string) => boolean
}

/**
 * Checks the page's links to its own site (siteLinks, M2.3c): the first MAX_LINKS that robots.txt
 * does not keep the bot from, each with one request, HEAD, then GET where HEAD answers an error,
 * as a browser asks. Every request goes through safeFetch, which vets every address, under the
 * page's own policy; none follows a redirect, whose status is the link's answer, and none reads a
 * body. At most CONCURRENCY at once, within LINKS_TIMEOUT_MS in all. The checks come back in the
 * page's order, whatever order they end in.
 *
 * The links counted are bounded (MAX_SITE_LINKS) and robots.txt is tested only for those that
 * are asked for: once MAX_LINKS are taken, the rest are counted as over the limit and go
 * untested, so a hostile page and robots.txt cost a scan no more than a plain one.
 */
export async function checkLinks(page: PageFacts, context: LinkContext): Promise<LinkFacts> {
  const { links, more } = siteLinks(page)
  const { signal, stop } = budget(LINKS_TIMEOUT_MS, context.base.signal)
  try {
    const asked: string[] = []
    let robots = 0
    let slice = performance.now()
    let examined = 0
    for (const url of links) {
      if (asked.length >= MAX_LINKS) break
      if (performance.now() - slice > SLICE_MS) {
        await new Promise<void>((resolve) => {
          setImmediate(resolve)
        })
        slice = performance.now()
      }
      if (signal.aborted) break
      examined++
      if (context.optedOut(url)) robots++
      else asked.push(url)
    }
    // What was not examined is over the limit, robots.txt untested.
    const limit = links.length - examined
    const base: SafeFetchOptions = {
      ...context.base,
      signal,
      timeoutMs: Math.min(context.base.timeoutMs ?? LINK_TIMEOUT_MS, LINK_TIMEOUT_MS),
    }
    const checks: LinkCheck[] = []
    let next = 0
    // The site asked for fewer requests (429): no other link is asked for after that one.
    let limited = false
    const work = async () => {
      for (let index = next++; index < asked.length; index = next++) {
        const url = asked[index] ?? ''
        if (signal.aborted) {
          checks[index] = { url, outcome: 'unanswered', reason: 'out-of-time' }
        } else if (limited) {
          checks[index] = { url, outcome: 'unanswered', reason: 'rate-limited' }
        } else {
          const { check, rateLimited } = await checkLink(url, base)
          checks[index] = check
          if (rateLimited) limited = true
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, asked.length) }, work))
    return { total: links.length, more, checks, skipped: { limit, robots } }
  } finally {
    stop()
  }
}

/**
 * HEAD, then GET where HEAD answers an error or fails to connect (retriesWithGet): the GET's
 * answer is what a visitor gets. A 429 ends the link's checks at once, and tells the caller to ask
 * for no more links. How a request's answer becomes the link's check is the collectors' linkCheck.
 */
async function checkLink(
  url: string,
  base: SafeFetchOptions,
): Promise<{ check: LinkCheck; rateLimited: boolean }> {
  const head = await ask(url, 'HEAD', base)
  if (head === 429 || !retriesWithGet(head)) {
    return { check: linkCheck(url, 'HEAD', head), rateLimited: head === 429 }
  }
  const get = await ask(url, 'GET', base)
  return { check: linkCheck(url, 'GET', get), rateLimited: get === 429 }
}

/** One request to a link: its status, or why it got none. */
async function ask(
  url: string,
  method: 'HEAD' | 'GET',
  base: SafeFetchOptions,
): Promise<LinkAnswer> {
  const fetched = await safeFetch(url, {
    ...base,
    method,
    accept: PAGE_ACCEPT,
    discardBody: true,
    // One request: a redirect's status is the link's answer, and where it leads is never asked.
    beforeRedirect: () => Promise.resolve(false),
  })
  const status = statusOf(fetched)
  if (status === null) {
    return {
      failure: base.signal?.aborted === true ? 'out-of-time' : (fetched.error?.code ?? 'failed'),
    }
  }
  return status
}

/** The response's status, or the redirect's that the fetch declined to follow; null without. */
function statusOf(fetched: FetchResult): number | null {
  if (fetched.response !== null) return fetched.response.status
  if (fetched.error === null) return fetched.redirects.at(-1)?.status ?? null
  return null
}
