/**
 * What Google Safe Browsing's Lookup API (v4, threatMatches:find) says of the page's URL and its
 * origin: a list of threats, or nothing. The engine asks the API; this reads its answer.
 */
export type SafeBrowsingThreat =
  'MALWARE' | 'SOCIAL_ENGINEERING' | 'UNWANTED_SOFTWARE' | 'POTENTIALLY_HARMFUL_APPLICATION'

/** The threat types the engine asks about, and the only ones read from an answer. */
export const SAFE_BROWSING_THREATS: readonly SafeBrowsingThreat[] = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
]

export interface SafeBrowsingFacts {
  /** clean: Google lists neither; flagged: it lists one of them; failed: no usable answer. */
  readonly outcome: 'clean' | 'flagged' | 'failed'
  /** A failure because the API refused the request (400, 401 or 403): the key, most often. */
  readonly refused?: boolean
  /** One per threat type, in the order of SAFE_BROWSING_THREATS; empty unless flagged. */
  readonly threats: readonly { readonly type: SafeBrowsingThreat; readonly url: string }[]
}

/** The API's answer: its status (null when none came) and its body as JSON. */
export interface SafeBrowsingAnswer {
  readonly status: number | null
  readonly body: unknown
}

const REFUSED: ReadonlySet<number> = new Set([400, 401, 403])

/** A clean page gets `{}`; a flagged one `{ matches: [{ threatType, threat: { url } }] }`. */
export function collectSafeBrowsing(answer: SafeBrowsingAnswer): SafeBrowsingFacts {
  if (answer.status !== null && REFUSED.has(answer.status)) {
    return { outcome: 'failed', refused: true, threats: [] }
  }
  if (answer.status !== 200 || !isObject(answer.body)) return { outcome: 'failed', threats: [] }
  const matches = answer.body.matches
  if (matches === undefined) return { outcome: 'clean', threats: [] }
  if (!Array.isArray(matches)) return { outcome: 'failed', threats: [] }
  const found = new Map<SafeBrowsingThreat, string>()
  for (const match of matches as unknown[]) {
    if (!isObject(match)) continue
    const type = SAFE_BROWSING_THREATS.find((threat) => threat === match.threatType)
    if (type === undefined || found.has(type)) continue
    const threat = match.threat
    const url = isObject(threat) && typeof threat.url === 'string' ? threat.url : ''
    found.set(type, url.slice(0, 2048))
  }
  if (found.size === 0) {
    // Matches of types nobody asked about: not a verdict on the page.
    return matches.length === 0
      ? { outcome: 'clean', threats: [] }
      : { outcome: 'failed', threats: [] }
  }
  return {
    outcome: 'flagged',
    threats: SAFE_BROWSING_THREATS.filter((type) => found.has(type)).map((type) => ({
      type,
      url: found.get(type) ?? '',
    })),
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
