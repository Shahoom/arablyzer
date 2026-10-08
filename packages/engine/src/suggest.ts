import type { PageFacts, SuggestFacts, SuggestTerm, SuggestVariant } from '@arablyzer/collectors'
import { keyTerms, KIND_ORDER, misspellings, pageWords, writes } from '@arablyzer/rules'
import { json, sleep, TtlCache, type Ask } from './outside-http'

/**
 * Google's public suggest endpoint (docs/design/plans/arabic-native.md §12). It is not an API with
 * a contract: its terms do not offer it for automated use, so it is behind ARABLYZER_SUGGEST=1,
 * off by default, called at most MAX_CALLS times a scan, one at a time, identified as ArablyzerBot,
 * cached for a day, and given up at the first answer that is not JSON.
 */
export const SUGGEST_ENDPOINT = 'https://suggestqueries.google.com/complete/search'
export const MAX_CALLS = 12
export const SUGGEST_GAP_MS = 700
const SUGGEST_TIMEOUT_MS = 8_000
export const SUGGEST_TOTAL_MS = 30_000

export interface SuggestOptions {
  /** Another endpoint; tests use a stand-in. */
  readonly endpoint?: string
}

interface Answer {
  readonly suggestions: readonly string[]
}

const cache = new TtlCache<Answer>(24 * 60 * 60 * 1000)

/** Forgets the answers kept (for tests). */
export function clearSuggestCache(): void {
  cache.clear()
}

/** A suggestion list for a query; null when Google did not answer with what we can read. */
async function suggestionsFor(
  ask: Ask,
  query: string,
  endpoint: string,
  signal: AbortSignal | undefined,
): Promise<Answer | null> {
  const cached = cache.get(query)
  if (cached !== undefined) return cached
  const url = new URL(endpoint)
  url.searchParams.set('client', 'firefox')
  url.searchParams.set('hl', 'ar')
  url.searchParams.set('q', query)
  const response = await ask({
    url: url.href,
    accept: 'application/json',
    timeoutMs: SUGGEST_TIMEOUT_MS,
    maxBytes: 64 * 1024,
    ...(signal === undefined ? {} : { signal }),
  })
  if (response?.status !== 200) return null
  const body = json(response)
  if (!Array.isArray(body) || !Array.isArray(body[1])) return null
  const answer: Answer = {
    suggestions: (body[1] as unknown[]).filter((item): item is string => typeof item === 'string'),
  }
  cache.set(query, answer)
  return answer
}

/** People type the variant when a suggestion begins with it as a word. */
export function typedIn(variant: string, suggestions: readonly string[]): string | null {
  return suggestions.find((item) => item === variant || item.startsWith(`${variant} `)) ?? null
}

export interface SuggestContext {
  readonly ask: Ask
  readonly options: SuggestOptions
  readonly signal?: AbortSignal
  readonly gapMs?: number
}

/**
 * For up to three key terms of the page (the h1, then the title), their common misspellings
 * (hamza, ta marbuta, alef maqsura, a letter dropped or swapped, Arabizi), the likeliest first;
 * the suggest endpoint is asked about as many as the MAX_CALLS budget allows, shared among the
 * terms. Which of them the page writes is read from the page's own words.
 */
export async function askSuggest(page: PageFacts, context: SuggestContext): Promise<SuggestFacts> {
  const terms = keyTerms(page)
  if (terms.length === 0) return { outcome: 'no-terms' }
  const words = pageWords(page)
  const endpoint = context.options.endpoint ?? SUGGEST_ENDPOINT
  const perTerm = Math.max(1, Math.floor(MAX_CALLS / terms.length))
  let calls = 0
  let stopped = false
  let answered = 0
  const out: SuggestTerm[] = []
  for (const term of terms) {
    const candidates = misspellings(term)
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
      .slice(0, perTerm + 4)
    const variants: SuggestVariant[] = []
    let asked = 0
    for (const candidate of candidates) {
      const covered = writes(words, candidate.text)
      let typed: boolean | null = null
      let suggestion: string | null = null
      if (!stopped && asked < perTerm && calls < MAX_CALLS && context.signal?.aborted !== true) {
        const fresh = cache.get(candidate.text) === undefined
        if (fresh && calls > 0) await sleep(context.gapMs ?? SUGGEST_GAP_MS, context.signal)
        const answer = await suggestionsFor(context.ask, candidate.text, endpoint, context.signal)
        if (fresh) calls++
        asked++
        if (answer === null) stopped = true
        else {
          answered++
          suggestion = typedIn(candidate.text, answer.suggestions)
          typed = suggestion !== null
        }
      }
      variants.push({ ...candidate, typed, suggestion, covered })
    }
    out.push({ term, written: writes(words, term), variants })
  }
  if (answered === 0) return { outcome: 'failed' }
  return { outcome: 'checked', calls, stopped, terms: out }
}
