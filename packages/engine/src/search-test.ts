import {
  collectPage,
  compareProbe,
  COUNTED_KINDS,
  findSearch,
  pickNumbers,
  pickWords,
  planQueries,
  searchUrl,
  type PageFacts,
  type SearchFacts,
  type SearchProbe,
  type SearchQuery,
  type SearchTarget,
  type SearchVariantResult,
  type SearchWordResult,
} from '@arablyzer/collectors'
import { safeFetch, type SafeFetchOptions } from '@arablyzer/egress'
import { budget } from './timeout'

/** Requests the test makes at most, the baseline included: a site's search is not ours to load. */
export const MAX_SEARCH_REQUESTS = 12
/** Each request gets this long. */
export const SEARCH_TIMEOUT_MS = 10_000
/** All of them together. */
export const SEARCH_TOTAL_MS = 45_000
/** Between one request and the next, so the site never sees a burst. */
export const SEARCH_PAUSE_MS = 400
/** A query nobody could match: what the search answers when it finds nothing, nav and footer included. */
const NONSENSE = 'zzqxjv'
const MAX_BODY_BYTES = 2 * 1024 * 1024
const PAGE_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

export interface SearchContext {
  /** The page's own fetch options: its user agent (ArablyzerBot), lockdown policy and resolver. */
  readonly base: SafeFetchOptions
  /** Whether robots.txt keeps the bot from an address. */
  readonly optedOut: (url: string) => boolean
  /** The platform the page runs on (`facts.platform.primary.id`), for a search address it did not give. */
  readonly platformId: string | null
  /** Between requests; tests make it short. */
  readonly pauseMs?: number
}

const sameOrigin = (a: string, b: string): boolean => {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/** A link as the results compare it: no fragment. */
function keyOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    parsed.hash = ''
    return parsed.href
  } catch {
    return null
  }
}

/**
 * The links an answer holds that the answer to a query nobody could match does not: its results,
 * as far as the first page shows them. The links of the site's own chrome (menu, footer, a sidebar)
 * are in both and cancel out; pagination, which carries the query, is left out.
 */
function resultsOf(page: PageFacts, origin: string, param: string, baseline: ReadonlySet<string>) {
  const seen = new Set<string>()
  const results: string[] = []
  for (const anchor of page.html?.anchors ?? []) {
    const key = anchor.url === null ? null : keyOf(anchor.url)
    if (key === null || seen.has(key) || baseline.has(key) || !sameOrigin(key, origin)) continue
    seen.add(key)
    if (new URL(key).searchParams.has(param)) continue
    results.push(key)
  }
  return results
}

/**
 * Asks the site's search for words of its own page in their spelling variants, and compares what
 * comes back (docs/design/plans/arabic-native.md §2). Politeness: at most MAX_SEARCH_REQUESTS GETs
 * in all, one at a time with a pause between, none that robots.txt keeps the bot from (the
 * whole test is skipped when the search is one of them, and no redirect is followed to such a
 * place or off the site), under the page's own lockdown and user agent, each within
 * SEARCH_TIMEOUT_MS and all within SEARCH_TOTAL_MS; a 429 or a 5xx ends the test there.
 */
export async function runSearchTest(page: PageFacts, context: SearchContext): Promise<SearchFacts> {
  const target = findSearch(page, context.platformId)
  if (target === null) return { outcome: 'not-found' }
  const baselineUrl = searchUrl(target, NONSENSE)
  if (context.optedOut(baselineUrl)) return { outcome: 'robots', via: target.via, url: target.url }
  const words = pickWords(page, 4)
  const numbers = pickNumbers(page, 1)
  if (words.length === 0) return { outcome: 'no-words', via: target.via, url: target.url }

  const { signal, stop } = budget(SEARCH_TOTAL_MS, context.base.signal)
  const options: SafeFetchOptions = {
    ...context.base,
    signal,
    method: 'GET',
    accept: PAGE_ACCEPT,
    timeoutMs: Math.min(context.base.timeoutMs ?? SEARCH_TIMEOUT_MS, SEARCH_TIMEOUT_MS),
    maxBytes: MAX_BODY_BYTES,
    onTooLarge: 'truncate',
    beforeRedirect: (to) => Promise.resolve(sameOrigin(to, page.url) && !context.optedOut(to)),
  }
  let requests = 0
  let halted = false
  const pause = context.pauseMs ?? SEARCH_PAUSE_MS
  const ask = async (url: string): Promise<PageFacts | null> => {
    if (halted || signal.aborted || requests >= MAX_SEARCH_REQUESTS || context.optedOut(url)) {
      return null
    }
    if (requests > 0 && pause > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, pause)
      })
    }
    requests++
    const fetched = await safeFetch(url, options)
    const response = fetched.response
    if (response === null) return null
    if (response.status === 429 || response.status >= 500) halted = true
    if (response.status !== 200) return null
    try {
      return collectPage({
        url: response.url,
        status: response.status,
        headers: response.headers,
        body: response.body,
        certificate: null,
      })
    } catch {
      return null
    }
  }
  try {
    const empty = await ask(baselineUrl)
    if (empty?.html == null) return { outcome: 'unreachable', via: target.via, url: target.url }
    const baseline = new Set(
      empty.html.anchors.flatMap((anchor) => {
        const key = anchor.url === null ? null : keyOf(anchor.url)
        return key === null ? [] : [key]
      }),
    )
    const plan = planQueries(words, numbers, MAX_SEARCH_REQUESTS - 1)
    const probes = new Map<SearchQuery, SearchProbe>()
    for (const query of plan) {
      const answer = await ask(searchUrl(target, query.query))
      probes.set(query, probeOf(query.query, answer, target, baseline))
    }
    return {
      outcome: 'tested',
      via: target.via,
      url: target.url,
      param: target.param,
      requests,
      words: wordResults(plan, probes),
    }
  } finally {
    stop()
  }
}

function probeOf(
  query: string,
  answer: PageFacts | null,
  target: SearchTarget,
  baseline: ReadonlySet<string>,
): SearchProbe {
  if (answer === null) return { query, status: null, results: null, first: null }
  const results = resultsOf(answer, target.url, target.param, baseline)
  const first = results[0]
  return {
    query,
    status: answer.status,
    results: results.length,
    first: first === undefined ? null : `${new URL(first).pathname}${new URL(first).search}`,
  }
}

/** Each word with its own spelling's answer and each variant's compared to it. */
function wordResults(
  plan: readonly SearchQuery[],
  probes: ReadonlyMap<SearchQuery, SearchProbe>,
): SearchWordResult[] {
  const words: SearchWordResult[] = []
  for (const query of plan) {
    const probe = probes.get(query)
    if (probe === undefined || query.kind !== 'base') continue
    const variants: SearchVariantResult[] = []
    for (const other of plan) {
      const variant = probes.get(other)
      if (variant === undefined || other.word !== query.word || other.kind === 'base') continue
      variants.push({
        ...variant,
        kind: other.kind,
        counted: COUNTED_KINDS.has(other.kind),
        outcome: compareProbe(probe, variant),
      })
    }
    words.push({ word: query.word, base: probe, variants })
  }
  return words
}
