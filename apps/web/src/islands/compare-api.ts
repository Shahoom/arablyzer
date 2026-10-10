import {
  COMPARE_CRAWLS_PATH,
  COMPARE_SCANS_PATH,
  NOT_COMPARABLE,
  siteCrawlsPath,
  siteHistoryPath,
  type CrawlComparison,
  type CrawlsResponse,
  type ScanComparison,
  type SiteHistory,
} from '@arablyzer/api-contract/codes'
import { isCrawlComparison, isScanComparison, isSiteHistory } from './compare-model'
import { isCrawlList } from './crawl-model'
import { jsonOf, request } from './sites-api'

/** The comparison page's and the chart's requests (M4.6), on the same origin with the session cookie. */
export type CompareProblem = 'not-comparable' | 'not-found' | 'unauthorized' | 'other'
export type CompareOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: CompareProblem }

async function get<T>(
  send: typeof fetch,
  path: string,
  accept: (value: unknown) => value is T,
): Promise<CompareOutcome<T>> {
  const response = await request(send, 'GET', path)
  if (response === null) return { ok: false, problem: 'other' }
  const body = await jsonOf(response)
  if (response.ok) return accept(body) ? { ok: true, value: body } : { ok: false, problem: 'other' }
  if (response.status === 401) return { ok: false, problem: 'unauthorized' }
  if (response.status === 404) return { ok: false, problem: 'not-found' }
  const code = isRecord(body) ? body.error : null
  return {
    ok: false,
    problem: response.status === 422 && code === NOT_COMPARABLE ? 'not-comparable' : 'other',
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const pair = (base: string, head: string): string =>
  `?${new URLSearchParams({ base, head }).toString()}`

export const compareScans = (
  base: string,
  head: string,
  send: typeof fetch = fetch,
): Promise<CompareOutcome<ScanComparison>> =>
  get(send, `${COMPARE_SCANS_PATH}${pair(base, head)}`, isScanComparison)

export const compareCrawls = (
  base: string,
  head: string,
  send: typeof fetch = fetch,
): Promise<CompareOutcome<CrawlComparison>> =>
  get(send, `${COMPARE_CRAWLS_PATH}${pair(base, head)}`, isCrawlComparison)

export const getSiteHistory = (
  siteId: string,
  send: typeof fetch = fetch,
): Promise<CompareOutcome<SiteHistory>> => get(send, siteHistoryPath(siteId), isSiteHistory)

/** A site's crawls, newest first. */
export const listCrawls = (
  siteId: string,
  send: typeof fetch = fetch,
): Promise<CompareOutcome<CrawlsResponse>> => get(send, siteCrawlsPath(siteId), isCrawlList)
