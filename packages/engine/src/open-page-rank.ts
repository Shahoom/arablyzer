import {
  collectOpenPageRank,
  type OpenPageRankAnswer,
  type OpenPageRankFacts,
} from '@arablyzer/collectors'
import { safeFetch, type SafeFetchOptions } from '@arablyzer/egress'

/** Open PageRank's API: GET, with the key in the API-OPR header. */
export const OPEN_PAGE_RANK_ENDPOINT = 'https://openpagerank.com/api/v1.0/getPageRank'

const MAX_BYTES = 64 * 1024
const TIMEOUT_MS = 10_000

export interface OpenPageRankOptions {
  /** The API key, sent in the API-OPR header, never in a URL (ARABLYZER_OPR_KEY). */
  readonly apiKey: string
  /** Another endpoint for the API; tests use a local stand-in. */
  readonly endpoint?: string
}

/**
 * Asks Open PageRank for a domain's rank. Only the domain goes to it, with the key. Any failure to
 * get a usable answer is `failed`.
 */
export async function fetchOpenPageRank(
  domain: string,
  options: OpenPageRankOptions,
  base: SafeFetchOptions,
): Promise<OpenPageRankFacts> {
  const url = new URL(options.endpoint ?? OPEN_PAGE_RANK_ENDPOINT)
  url.searchParams.append('domains[]', domain)
  let answer: OpenPageRankAnswer = { status: null, body: null }
  try {
    const fetched = await safeFetch(url.href, {
      ...base,
      timeoutMs: Math.min(base.timeoutMs ?? TIMEOUT_MS, TIMEOUT_MS),
      accept: 'application/json',
      maxBytes: MAX_BYTES,
      headers: { 'api-opr': options.apiKey },
    })
    if (fetched.response !== null) {
      let body: unknown = null
      try {
        body = JSON.parse(new TextDecoder().decode(fetched.response.body))
      } catch {
        // Not JSON: a status alone.
      }
      answer = { status: fetched.response.status, body }
    }
  } catch {
    // No answer.
  }
  return collectOpenPageRank(domain, answer)
}
