import { collectCrux, type CruxAnswer, type CruxFacts } from '@arablyzer/collectors'
import { safeFetch, type SafeFetchOptions } from '@arablyzer/egress'

/** The Chrome UX Report API's query endpoint (M1.3 plan §0): POST only. */
export const CRUX_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord'

/** Its answers are a few kilobytes; this bounds a server that sends more. */
const CRUX_MAX_BYTES = 256 * 1024

/**
 * Each question gets this long at most, within the scan's own limit: the API answers in well
 * under a second, and time spent waiting here is taken from the render (M1.3b review).
 */
const CRUX_TIMEOUT_MS = 10_000

/** The three Core Web Vitals the rules read; asking for them alone keeps the answer small. */
const METRICS = ['largest_contentful_paint', 'interaction_to_next_paint', 'cumulative_layout_shift']

export interface CruxOptions {
  /** The API key, sent in the X-Goog-Api-Key header, never in a URL (ARABLYZER_CRUX_API_KEY). */
  readonly apiKey: string
  /** Another endpoint for the API; tests use a local stand-in. */
  readonly endpoint?: string
}

/**
 * Asks CrUX for the page's URL on phones, then for its origin when the URL has no data. The
 * scanned URL goes to Google with the key; nothing else does.
 */
export async function fetchCrux(
  pageUrl: string,
  crux: CruxOptions,
  base: SafeFetchOptions,
): Promise<CruxFacts> {
  const ask = async (target: { url: string } | { origin: string }): Promise<CruxAnswer> => {
    const fetched = await safeFetch(crux.endpoint ?? CRUX_ENDPOINT, {
      ...base,
      timeoutMs: Math.min(base.timeoutMs ?? CRUX_TIMEOUT_MS, CRUX_TIMEOUT_MS),
      accept: 'application/json',
      maxBytes: CRUX_MAX_BYTES,
      json: { ...target, formFactor: 'PHONE', metrics: METRICS },
      headers: { 'x-goog-api-key': crux.apiKey },
    })
    const response = fetched.response
    if (response === null) return { status: null, body: null }
    try {
      return { status: response.status, body: JSON.parse(new TextDecoder().decode(response.body)) }
    } catch {
      return { status: response.status, body: null }
    }
  }
  // A fragment never reaches a server, nor Google: CrUX keys pages without it.
  const page = new URL(pageUrl)
  page.hash = ''
  const url = await ask({ url: page.href })
  if (url.status !== 404) return collectCrux({ url })
  return collectCrux({ url, origin: await ask({ origin: page.origin }) })
}
