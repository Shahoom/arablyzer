/**
 * A domain's authority from Open PageRank (Keywords Everywhere's API, built on Common Crawl's web
 * graph): a score of 0 to 10, the domain's place among all domains, how many domains link to it,
 * and a trend read from its monthly history. The engine asks the API; this reads its answer.
 */
export interface OpenPageRankFacts {
  /** found: the domain has a score; not-found: Open PageRank lists none; failed: no usable answer. */
  readonly outcome: 'found' | 'not-found' | 'failed'
  /** A failure because the API refused the request (401 or 403): the key, most often. */
  readonly refused?: boolean
  readonly domain: string
  /** 0 to 10, up to two decimals; null unless found. */
  readonly score: number | null
  /** The domain's place among all domains (1 is first); null when the API gives none. */
  readonly position: number | null
  /** The domains that link to it; null when the API gives none. */
  readonly referringDomains: number | null
  /** The score's direction over the last year; null with too little history. */
  readonly trend: 'rising' | 'stable' | 'falling' | null
  /** The month of the latest score, YYYY-MM-DD, when the API gives it. */
  readonly asOf: string | null
}

export interface OpenPageRankAnswer {
  readonly status: number | null
  readonly body: unknown
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const bounded = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null

/** A change of a third of a point or more in a year is a trend; less is stable. */
const TREND_STEP = 0.3
/** The earlier month a trend compares with: 12 months back, at the least 6 (history may start late). */
const TREND_MONTHS = { wanted: 12, least: 6 } as const

const monthsBetween = (from: string, to: string): number => {
  const [fy = 0, fm = 0] = from.split('-').map(Number)
  const [ty = 0, tm = 0] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** The direction of the score from its history: [{ date, open_page_rank }], any order. */
export function trendOf(history: unknown, latest: number): 'rising' | 'stable' | 'falling' | null {
  if (!Array.isArray(history)) return null
  const points = (history as unknown[])
    .flatMap((point) => {
      // A month the API estimated is not a measurement: a trend is read from measured ones.
      if (!isObject(point) || typeof point.date !== 'string' || point.estimated === true) return []
      const score = bounded(point.open_page_rank, 0, 10)
      return /^\d{4}-\d{2}-\d{2}$/.test(point.date) && score !== null
        ? [{ date: point.date, score }]
        : []
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  const last = points.at(-1)
  if (last === undefined) return null
  const earlier = points.find((point) => {
    const months = monthsBetween(point.date, last.date)
    return months >= TREND_MONTHS.least && months <= TREND_MONTHS.wanted
  })
  if (earlier === undefined) return null
  const change = latest - earlier.score
  return change >= TREND_STEP ? 'rising' : change <= -TREND_STEP ? 'falling' : 'stable'
}

/**
 * `{ results: [{ domain, found, open_page_rank, rank, referring_domains, history }] }`: the row
 * for the domain asked about.
 */
export function collectOpenPageRank(domain: string, answer: OpenPageRankAnswer): OpenPageRankFacts {
  const none = {
    domain,
    score: null,
    position: null,
    referringDomains: null,
    trend: null,
    asOf: null,
  } as const
  if (answer.status === 401 || answer.status === 403) {
    return { outcome: 'failed', refused: true, ...none }
  }
  const rows =
    answer.status === 200 && isObject(answer.body) && Array.isArray(answer.body.results)
      ? (answer.body.results as unknown[])
      : null
  const row = rows?.find((item) => isObject(item) && item.domain === domain)
  if (!isObject(row)) return { outcome: rows === null ? 'failed' : 'not-found', ...none }
  const score = bounded(row.open_page_rank, 0, 10)
  if (row.found === false || row.open_page_rank === null) return { outcome: 'not-found', ...none }
  if (score === null) return { outcome: 'failed', ...none }
  const history = Array.isArray(row.history) ? (row.history as unknown[]) : []
  const asOf = isObject(answer.body) ? answer.body.as_of : undefined
  const latest =
    typeof asOf === 'string'
      ? asOf
      : history
          .flatMap((point) =>
            isObject(point) && typeof point.date === 'string' ? [point.date] : [],
          )
          .sort()
          .at(-1)
  return {
    outcome: 'found',
    domain,
    score,
    position: bounded(row.rank, 1, 1e12),
    referringDomains: bounded(row.referring_domains, 0, 1e12),
    trend: trendOf(row.history, score),
    asOf: latest !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(latest) ? latest : null,
  }
}
