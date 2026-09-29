import { siteLinks, type LinkCheck, type LinkFacts, type PageFacts } from '@arablyzer/collectors'
import { safeFetch, type FetchResult, type SafeFetchOptions } from '@arablyzer/egress'

/** The page's links to its own site a scan asks for, at most: the first ones on the page. */
export const MAX_LINKS = 50
/** Each request, HEAD or GET, gets this long at most. */
export const LINK_TIMEOUT_MS = 10_000
/** All the checks together; a link not answered by then is not judged. */
export const LINKS_TIMEOUT_MS = 20_000
/** Requests to the site at once. */
const CONCURRENCY = 4

const PAGE_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

export interface LinkContext {
  /** The page's own fetch options: its user agent, its lockdown policy and its resolver. */
  readonly base: SafeFetchOptions
  /** Whether robots.txt keeps the scan's bot from an address, as it would the page (optOutRule). */
  readonly optedOut: (url: string) => boolean
}

/**
 * Checks the page's links to its own site (siteLinks, M2.3c): the first MAX_LINKS that robots.txt
 * does not keep the bot from, each with one request, HEAD, then GET where HEAD answers an error,
 * as a browser asks. Every request goes through safeFetch, which vets every address, under the
 * page's own policy; none follows a redirect, whose status is the link's answer, and none reads a
 * body. At most CONCURRENCY at once, within LINKS_TIMEOUT_MS in all. The checks come back in the
 * page's order, whatever order they end in.
 */
export async function checkLinks(page: PageFacts, context: LinkContext): Promise<LinkFacts> {
  const links = siteLinks(page)
  const asked: string[] = []
  let robots = 0
  let limit = 0
  for (const url of links) {
    if (context.optedOut(url)) robots++
    else if (asked.length < MAX_LINKS) asked.push(url)
    else limit++
  }
  const signal = AbortSignal.any([
    AbortSignal.timeout(LINKS_TIMEOUT_MS),
    ...(context.base.signal === undefined ? [] : [context.base.signal]),
  ])
  const base: SafeFetchOptions = {
    ...context.base,
    signal,
    timeoutMs: Math.min(context.base.timeoutMs ?? LINK_TIMEOUT_MS, LINK_TIMEOUT_MS),
  }
  const checks: LinkCheck[] = []
  let next = 0
  const work = async () => {
    for (let index = next++; index < asked.length; index = next++) {
      const url = asked[index] ?? ''
      checks[index] = signal.aborted
        ? { url, outcome: 'unanswered', reason: 'out-of-time' }
        : await checkLink(url, base)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, asked.length) }, work))
  return { total: links.length, checks, skipped: { limit, robots } }
}

/** HEAD, then GET where HEAD answers an error: the GET's answer is what a visitor gets. */
async function checkLink(url: string, base: SafeFetchOptions): Promise<LinkCheck> {
  const head = await ask(url, 'HEAD', base)
  if (head.outcome !== 'answered' || head.status < 400) return head
  return ask(url, 'GET', base)
}

async function ask(
  url: string,
  method: 'HEAD' | 'GET',
  base: SafeFetchOptions,
): Promise<LinkCheck> {
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
    const reason = base.signal?.aborted === true ? 'out-of-time' : (fetched.error?.code ?? 'failed')
    return { url, outcome: 'unanswered', reason }
  }
  // 429 asks the client to slow down (RFC 6585 §4): an answer about the scan, not the link.
  if (status === 429) return { url, outcome: 'unanswered', reason: 'rate-limited' }
  return { url, outcome: 'answered', status, method }
}

/** The response's status, or the redirect's that the fetch declined to follow; null without. */
function statusOf(fetched: FetchResult): number | null {
  if (fetched.response !== null) return fetched.response.status
  if (fetched.error === null) return fetched.redirects.at(-1)?.status ?? null
  return null
}
