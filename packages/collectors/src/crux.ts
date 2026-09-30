/**
 * Real-user data from the Chrome UX Report (CrUX): the 75th percentile of each Core Web Vital on
 * phones over the last 28 days, for the page's URL or, when CrUX has none for it, its origin
 * (M1.3 plan §1). The engine asks the API; this reads its answers.
 */
export interface CruxFacts {
  /** found: CrUX has data; not-found: neither the page nor its origin has any; failed: no answer. */
  readonly outcome: 'found' | 'not-found' | 'failed'
  /** A failure because the API refused the request (400, 401 or 403): the key, most often. */
  readonly refused?: boolean
  /** What the data describes: the page's own URL, or its whole origin. */
  readonly scope: 'url' | 'origin' | null
  /** The URL or origin as CrUX names it. */
  readonly key: string | null
  /** The days the data covers, as YYYY-MM-DD. */
  readonly period: { readonly first: string; readonly last: string } | null
  /** Largest Contentful Paint and Interaction to Next Paint, in milliseconds. */
  readonly lcp: number | null
  readonly inp: number | null
  /** Cumulative Layout Shift, without a unit. */
  readonly cls: number | null
}

/** One answer of the API: its status (null when none came) and its body as JSON. */
export interface CruxAnswer {
  readonly status: number | null
  readonly body: unknown
}

export interface CruxInput {
  /** The answer for the page's URL. */
  readonly url: CruxAnswer
  /** The answer for its origin, asked when the URL had none. */
  readonly origin?: CruxAnswer
}

const EMPTY = { scope: null, key: null, period: null, lcp: null, inp: null, cls: null } as const

/** The API's answers to a request it refused: a bad request, or a key it does not accept. */
const REFUSED: ReadonlySet<number> = new Set([400, 401, 403])

/** Bounds of a plausible 75th percentile: an hour, and a shift far past any page's. */
const MAX_MS = 3_600_000
const MAX_CLS = 100

export function collectCrux(input: CruxInput): CruxFacts {
  if (input.url.status !== 404) return fromAnswer(input.url, 'url')
  if (input.origin === undefined) return { outcome: 'failed', ...EMPTY }
  if (input.origin.status === 404) return { outcome: 'not-found', ...EMPTY }
  return fromAnswer(input.origin, 'origin')
}

/**
 * A record as the API gives it: metrics, the URL or origin it is for, and the days it covers. One
 * without them is not what the API returns, so it counts as no answer (M1.3b review).
 */
function fromAnswer(answer: CruxAnswer, scope: 'url' | 'origin'): CruxFacts {
  if (answer.status !== null && REFUSED.has(answer.status)) {
    return { outcome: 'failed', refused: true, ...EMPTY }
  }
  const record = answer.status === 200 ? field(answer.body, 'record') : undefined
  const metrics = field(record, 'metrics')
  const name = field(field(record, 'key'), scope)
  const period = field(record, 'collectionPeriod')
  const first = dateOf(field(period, 'firstDate'))
  const last = dateOf(field(period, 'lastDate'))
  if (
    !isObject(metrics) ||
    typeof name !== 'string' ||
    name === '' ||
    first === null ||
    last === null
  ) {
    return { outcome: 'failed', ...EMPTY }
  }
  return {
    outcome: 'found',
    scope,
    key: name.slice(0, 2048),
    period: { first, last },
    lcp: p75(metrics, 'largest_contentful_paint', MAX_MS),
    inp: p75(metrics, 'interaction_to_next_paint', MAX_MS),
    cls: p75(metrics, 'cumulative_layout_shift', MAX_CLS),
  }
}

/**
 * A metric's 75th percentile: a number, or a string of one (CLS); null when not a size, or past
 * `max`.
 */
function p75(metrics: Record<string, unknown>, name: string, max: number): number | null {
  const value = field(field(metrics[name], 'percentiles'), 'p75')
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)
        ? Number(value)
        : Number.NaN
  return Number.isFinite(number) && number >= 0 && number <= max ? number : null
}

/** A CrUX date ({ year, month, day }) as YYYY-MM-DD, years 1 to 9999; null when not one. */
function dateOf(value: unknown): string | null {
  const [year, month, day] = ['year', 'month', 'day'].map((part) => field(value, part))
  if (![year, month, day].every((part) => Number.isInteger(part))) return null
  if ((year as number) < 1 || (year as number) > 9999) return null
  const date = new Date(Date.UTC(year as number, (month as number) - 1, day as number))
  // Date.UTC reads years 0 to 99 as 1900 to 1999; setUTCFullYear keeps them.
  date.setUTCFullYear(year as number)
  if (date.getUTCDate() !== day || date.getUTCMonth() !== (month as number) - 1) return null
  return date.toISOString().slice(0, 10)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function field(value: unknown, name: string): unknown {
  return isObject(value) ? value[name] : undefined
}
