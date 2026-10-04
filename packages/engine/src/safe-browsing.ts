import {
  collectSafeBrowsing,
  SAFE_BROWSING_THREATS,
  type SafeBrowsingFacts,
} from '@arablyzer/collectors'
import { safeFetch, type SafeFetchOptions } from '@arablyzer/egress'

/** Google Safe Browsing's Lookup API (v4): one POST asks about every URL and threat type. */
export const SAFE_BROWSING_ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find'

/** Its answers are a few kilobytes at most; this bounds a server that sends more. */
const SAFE_BROWSING_MAX_BYTES = 256 * 1024

/** The answer comes in well under a second; a slow one is taken from the render's time. */
const SAFE_BROWSING_TIMEOUT_MS = 10_000

export interface SafeBrowsingOptions {
  /** The API key, sent in the X-Goog-Api-Key header, never in a URL (ARABLYZER_SAFE_BROWSING_KEY). */
  readonly apiKey: string
  /** Another endpoint for the API; tests use a local stand-in. */
  readonly endpoint?: string
}

/**
 * Asks Safe Browsing about the page's URL and its origin, for malware, social engineering,
 * unwanted software and harmful apps on any platform. The scanned URL goes to Google with the
 * key; nothing else does. Nothing is kept from one scan to the next, and any failure to get a
 * usable answer is `failed`, never a verdict.
 */
export async function fetchSafeBrowsing(
  pageUrl: string,
  options: SafeBrowsingOptions,
  base: SafeFetchOptions,
): Promise<SafeBrowsingFacts> {
  // A fragment never reaches a server, nor Google.
  const page = new URL(pageUrl)
  page.hash = ''
  const entries = [...new Set([page.href, `${page.origin}/`])].map((url) => ({ url }))
  try {
    const fetched = await safeFetch(options.endpoint ?? SAFE_BROWSING_ENDPOINT, {
      ...base,
      timeoutMs: Math.min(base.timeoutMs ?? SAFE_BROWSING_TIMEOUT_MS, SAFE_BROWSING_TIMEOUT_MS),
      accept: 'application/json',
      maxBytes: SAFE_BROWSING_MAX_BYTES,
      json: {
        client: { clientId: 'arablyzer', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: SAFE_BROWSING_THREATS,
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: entries,
        },
      },
      headers: { 'x-goog-api-key': options.apiKey },
    })
    const response = fetched.response
    if (response === null) return { outcome: 'failed', threats: [] }
    let body: unknown = null
    try {
      body = JSON.parse(new TextDecoder().decode(response.body))
    } catch {
      // Not JSON: collectSafeBrowsing reads it as no answer.
    }
    return collectSafeBrowsing({ status: response.status, body })
  } catch {
    return { outcome: 'failed', threats: [] }
  }
}
