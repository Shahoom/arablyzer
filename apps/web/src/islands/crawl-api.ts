import {
  crawlCancelPath,
  crawlPagesPath,
  crawlPath,
  siteCrawlsPath,
  type CrawlPagesResponse,
  type CrawlReport,
  type CrawlSummary,
} from '@arablyzer/api-contract/codes'
import { isCrawlPages, isCrawlReport, isCrawlSummary } from './crawl-model'
import { jsonOf, read, request, type SiteOutcome } from './sites-api'
import { siteProblemOf } from './sites-model'

/** The account page's requests about deep crawls (M4.5), on the same origin with the session cookie. */

/** Starts a crawl of a saved site. */
export function startCrawl(
  siteId: string,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<CrawlSummary>> {
  return request(send, 'POST', siteCrawlsPath(siteId)).then((response) =>
    read(response, isCrawlSummary),
  )
}

export function getCrawl(
  id: string,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<CrawlReport>> {
  return request(send, 'GET', crawlPath(id)).then((response) => read(response, isCrawlReport))
}

export function getCrawlPages(
  id: string,
  options: { readonly template?: string; readonly offset?: number } = {},
  send: typeof fetch = fetch,
): Promise<SiteOutcome<CrawlPagesResponse>> {
  const query = new URLSearchParams()
  if (options.template !== undefined) query.set('template', options.template)
  if ((options.offset ?? 0) > 0) query.set('offset', String(options.offset))
  const suffix = query.size === 0 ? '' : `?${query.toString()}`
  return request(send, 'GET', `${crawlPagesPath(id)}${suffix}`).then((response) =>
    read(response, isCrawlPages),
  )
}

export function cancelCrawl(
  id: string,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<CrawlSummary>> {
  return request(send, 'POST', crawlCancelPath(id)).then((response) =>
    read(response, isCrawlSummary),
  )
}

export async function deleteCrawl(
  id: string,
  send: typeof fetch = fetch,
): Promise<SiteOutcome<null>> {
  const response = await request(send, 'DELETE', crawlPath(id))
  if (response === null) return { ok: false, problem: 'network' }
  if (response.ok) return { ok: true, value: null }
  return { ok: false, ...siteProblemOf(response.status, await jsonOf(response)) }
}
