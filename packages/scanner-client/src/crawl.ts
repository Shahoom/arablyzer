import { MAX_URL_LENGTH } from '@arablyzer/api-contract/codes'
import { KEBAB_ID, Localized, Severity } from '@arablyzer/report-schema'
import { z } from 'zod'
import { ScannerUnavailable, type Fetcher } from './client'

// How the crawler and the scanner talk (M4.5): the crawler asks for one page, or for a site's
// start addresses, and the scanner answers with one JSON object. It is the scanner that fetches,
// under the egress rules, and reads what a site chose to send; the crawler gets facts, and every
// one is checked against these schemas where it arrives, as a scan's report is.

/** The path the crawler asks on. */
export const CRAWL_PATH = '/crawl'
/** The links a page gives the crawl, the start addresses a site gives it, the issues of a page: as the engine caps them. */
export const MAX_CRAWL_LINKS = 300
export const MAX_CRAWL_SEEDS = 5_000
const MAX_CRAWL_ISSUES = 400
/** The longest the crawler waits for an answer: a page's fetch, and the sitemaps' reads. */
export const CRAWL_TIMEOUT_MS = 90_000

const address = z
  .string()
  .min(1)
  .max(MAX_URL_LENGTH * 2)

export const CrawlRequest = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('page'), url: address, anyOrigin: z.boolean().optional() }),
  z.strictObject({ op: z.literal('seeds'), url: address }),
])
export type CrawlRequest = z.infer<typeof CrawlRequest>

const IssueCount = z.strictObject({
  id: z.string().regex(KEBAB_ID),
  severity: Severity,
  count: z.number().int().min(1).max(1_000_000),
  title: Localized,
})

export const PageAnswer = z.strictObject({
  outcome: z.enum(['ok', 'blocked', 'error', 'not-html', 'offsite']),
  status: z.number().int().min(100).max(599).nullable(),
  finalUrl: address.nullable(),
  error: z.string().max(64).nullable(),
  title: z.string().max(200).nullable(),
  links: z.array(address).max(MAX_CRAWL_LINKS),
  skeleton: z.string().max(1_000).nullable(),
  issues: z.array(IssueCount).max(MAX_CRAWL_ISSUES),
  score: z.number().int().min(0).max(100).nullable(),
  crawlDelayMs: z.number().int().min(0).max(600_000).nullable(),
})
export type PageAnswer = z.infer<typeof PageAnswer>

export const SeedsAnswer = z.strictObject({
  robots: z.enum(['fetched', 'none', 'blocked']),
  crawlDelayMs: z.number().int().min(0).max(600_000).nullable(),
  sitemaps: z.number().int().min(0).max(100),
  urls: z.array(address).max(MAX_CRAWL_SEEDS),
  more: z.boolean(),
})
export type SeedsAnswer = z.infer<typeof SeedsAnswer>

/** What the crawler asks of the scanner. */
export interface CrawlClient {
  page(
    url: string,
    options?: { readonly anyOrigin?: boolean; readonly signal?: AbortSignal },
  ): Promise<PageAnswer>
  seeds(origin: string, signal?: AbortSignal): Promise<SeedsAnswer>
}

/**
 * The scanner's crawl interface, from the crawler. A scanner that is not there, or busy or ending its
 * process, throws ScannerUnavailable: nothing was read, so the crawler asks again after a wait.
 */
export function remoteCrawler(
  endpoint: string,
  token: string,
  fetcher: Fetcher = fetch,
  timeoutMs = CRAWL_TIMEOUT_MS,
): CrawlClient {
  const url = new URL(CRAWL_PATH, endpoint).href
  async function ask<T>(
    request: CrawlRequest,
    schema: z.ZodType<T>,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    const deadline = AbortSignal.timeout(timeoutMs)
    let response: Response
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: signal === undefined ? deadline : AbortSignal.any([deadline, signal]),
      })
    } catch (error) {
      const code = (error as { cause?: { code?: unknown } }).cause?.code
      if (
        typeof code === 'string' &&
        /^(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH)$/.test(code)
      ) {
        throw new ScannerUnavailable(`The scanner is not there (${code})`, { cause: error })
      }
      throw error
    }
    if (response.status === 503) {
      await response.body?.cancel()
      throw new ScannerUnavailable('The scanner answered 503')
    }
    if (response.status !== 200) {
      await response.body?.cancel()
      throw new Error(`The scanner answered ${String(response.status)}`)
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new Error('The scanner sent an answer that is not JSON')
    }
    const checked = schema.safeParse(body)
    if (!checked.success) throw new Error('The scanner sent an answer its protocol does not have')
    return checked.data
  }
  return {
    page: (page, options = {}) =>
      ask(
        { op: 'page', url: page, ...(options.anyOrigin === true ? { anyOrigin: true } : {}) },
        PageAnswer,
        options.signal,
      ),
    seeds: (origin, signal) => ask({ op: 'seeds', url: origin }, SeedsAnswer, signal),
  }
}
