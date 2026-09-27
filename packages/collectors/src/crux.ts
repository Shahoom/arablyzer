/**
 * Real-user data from the Chrome UX Report (CrUX): the 75th percentile of each Core Web Vital on
 * phones over the last 28 days, for the page's URL or, when CrUX has none for it, its origin
 * (M1.3 plan §1). The engine asks the API; this reads its answers.
 */
export interface CruxFacts {
  /** found: CrUX has data; not-found: neither the page nor its origin has any; failed: no answer. */
  readonly outcome: 'found' | 'not-found' | 'failed'
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

export function collectCrux(input: CruxInput): CruxFacts {
  if (input.url.status !== 404) return fromAnswer(input.url, 'url')
  if (input.origin === undefined) return { outcome: 'failed', ...EMPTY }
  if (input.origin.status === 404) return { outcome: 'not-found', ...EMPTY }
  return fromAnswer(input.origin, 'origin')
}

function fromAnswer(answer: CruxAnswer, scope: 'url' | 'origin'): CruxFacts {
  const record = answer.status === 200 ? field(answer.body, 'record') : undefined
  const metrics = field(record, 'metrics')
  const key = field(record, 'key')
  const name = field(key, scope)
  if (!isObject(metrics) || typeof name !== 'string') return { outcome: 'failed', ...EMPTY }
  const period = field(record, 'collectionPeriod')
  const first = dateOf(field(period, 'firstDate'))
  const last = dateOf(field(period, 'lastDate'))
  return {
    outcome: 'found',
    scope,
    key: name.slice(0, 2048),
    period: first === null || last === null ? null : { first, last },
    lcp: p75(metrics, 'largest_contentful_paint'),
    inp: p75(metrics, 'interaction_to_next_paint'),
    cls: p75(metrics, 'cumulative_layout_shift'),
  }
}

/** A metric's 75th percentile: a number, or a string of one (CLS); null when not a size. */
function p75(metrics: Record<string, unknown>, name: string): number | null {
  const value = field(field(metrics[name], 'percentiles'), 'p75')
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)
        ? Number(value)
        : Number.NaN
  return Number.isFinite(number) && number >= 0 ? number : null
}

/** A CrUX date ({ year, month, day }) as YYYY-MM-DD; null when not one. */
function dateOf(value: unknown): string | null {
  const [year, month, day] = ['year', 'month', 'day'].map((part) => field(value, part))
  if (![year, month, day].every((part) => Number.isInteger(part))) return null
  const date = new Date(Date.UTC(year as number, (month as number) - 1, day as number))
  if (date.getUTCDate() !== day || date.getUTCMonth() !== (month as number) - 1) return null
  return date.toISOString().slice(0, 10)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function field(value: unknown, name: string): unknown {
  return isObject(value) ? value[name] : undefined
}
