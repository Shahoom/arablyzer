import {
  collectOpenPageRank,
  type OpenPageRankAnswer,
  type OpenPageRankFacts,
} from '@arablyzer/collectors'
import { safeFetch, type SafeFetchOptions } from '@arablyzer/egress'

/** Open PageRank's API (Keywords Everywhere): POST, with the key as a bearer token. */
export const OPEN_PAGE_RANK_ENDPOINT = 'https://openpagerank.keywordseverywhere.com/v1/domains/bulk'

const MAX_BYTES = 256 * 1024
const TIMEOUT_MS = 10_000

export interface OpenPageRankOptions {
  /**
   * The API key, sent in the Authorization header, never in a URL (ARABLYZER_OPR_KEY). Without
   * it, a whole scan says the check is off; a scan that is not given this option says nothing.
   */
  readonly apiKey: string | undefined
  /** Another endpoint for the API; tests use a local stand-in. */
  readonly endpoint?: string
}

/**
 * Asks Open PageRank for a domain's score and its monthly history. Only the domain goes to it,
 * with the key. Any failure to get a usable answer is `failed`.
 */
export async function fetchOpenPageRank(
  domain: string,
  apiKey: string,
  endpoint: string | undefined,
  base: SafeFetchOptions,
): Promise<OpenPageRankFacts> {
  let answer: OpenPageRankAnswer = { status: null, body: null }
  try {
    const fetched = await safeFetch(endpoint ?? OPEN_PAGE_RANK_ENDPOINT, {
      ...base,
      timeoutMs: Math.min(base.timeoutMs ?? TIMEOUT_MS, TIMEOUT_MS),
      accept: 'application/json',
      maxBytes: MAX_BYTES,
      json: { domains: [domain], include_history: true },
      headers: { authorization: `Bearer ${apiKey}` },
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
