import {
  collectKnowledgeGraph,
  type KnowledgeGraphAnswer,
  type KnowledgeGraphFacts,
} from '@arablyzer/collectors'
import { safeFetch, type SafeFetchOptions } from '@arablyzer/egress'

/** Google's Knowledge Graph Search API. */
export const KNOWLEDGE_GRAPH_ENDPOINT = 'https://kgsearch.googleapis.com/v1/entities:search'

const MAX_BYTES = 256 * 1024
const TIMEOUT_MS = 10_000

export interface KnowledgeGraphOptions {
  /** The API key, sent in the X-Goog-Api-Key header, never in a URL (ARABLYZER_KG_KEY). */
  readonly apiKey: string
  /** Another endpoint for the API; tests use a local stand-in. */
  readonly endpoint?: string
}

/**
 * Asks Knowledge Graph for the brand's name in Arabic and in English. The name goes to Google
 * with the key; the page's address does not. Any failure to get a usable answer is `failed`.
 */
export async function fetchKnowledgeGraph(
  brand: string,
  options: KnowledgeGraphOptions,
  base: SafeFetchOptions,
): Promise<KnowledgeGraphFacts> {
  const ask = async (language: 'ar' | 'en'): Promise<KnowledgeGraphAnswer> => {
    const url = new URL(options.endpoint ?? KNOWLEDGE_GRAPH_ENDPOINT)
    url.searchParams.set('query', brand)
    url.searchParams.set('languages', language)
    url.searchParams.set('limit', '5')
    try {
      const fetched = await safeFetch(url.href, {
        ...base,
        timeoutMs: Math.min(base.timeoutMs ?? TIMEOUT_MS, TIMEOUT_MS),
        accept: 'application/json',
        maxBytes: MAX_BYTES,
        headers: { 'x-goog-api-key': options.apiKey },
      })
      const response = fetched.response
      if (response === null) return { status: null, body: null }
      try {
        return {
          status: response.status,
          body: JSON.parse(new TextDecoder().decode(response.body)),
        }
      } catch {
        return { status: response.status, body: null }
      }
    } catch {
      return { status: null, body: null }
    }
  }
  const [ar, en] = await Promise.all([ask('ar'), ask('en')])
  return collectKnowledgeGraph({ brand, ar, en })
}
