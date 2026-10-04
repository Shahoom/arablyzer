/**
 * A domain's rank from Open PageRank (getPageRank): 0 to 10, and the domain's place in its list of
 * the web's top domains. The engine asks the API; this reads its answer.
 */
export interface OpenPageRankFacts {
  /** found: the domain has a rank; not-found: Open PageRank lists none; failed: no usable answer. */
  readonly outcome: 'found' | 'not-found' | 'failed'
  /** A failure because the API refused the request (401 or 403): the key, most often. */
  readonly refused?: boolean
  readonly domain: string
  /** 0 to 10; null unless found. */
  readonly rank: number | null
  /** The same with its decimals, 0 to 10. */
  readonly decimal: number | null
  /** The domain's place among all domains (1 is first); null when the API gives none. */
  readonly position: number | null
}

export interface OpenPageRankAnswer {
  readonly status: number | null
  readonly body: unknown
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const number = (value: unknown, min: number, max: number): number | null => {
  const parsed = typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null
}

/** `{ status_code: 200, response: [{ status_code: 200, page_rank_integer, page_rank_decimal, rank, domain }] }`. */
export function collectOpenPageRank(domain: string, answer: OpenPageRankAnswer): OpenPageRankFacts {
  const none = { domain, rank: null, decimal: null, position: null } as const
  if (answer.status === 401 || answer.status === 403) {
    return { outcome: 'failed', refused: true, ...none }
  }
  const rows =
    answer.status === 200 && isObject(answer.body) && Array.isArray(answer.body.response)
      ? (answer.body.response as unknown[])
      : null
  const row = rows?.find((item) => isObject(item) && item.domain === domain) ?? rows?.[0]
  if (!isObject(row)) return { outcome: 'failed', ...none }
  if (row.status_code === 404) return { outcome: 'not-found', ...none }
  const rank = number(row.page_rank_integer, 0, 10)
  const decimal = number(row.page_rank_decimal, 0, 10)
  if (row.status_code !== 200 || rank === null) return { outcome: 'failed', ...none }
  return {
    outcome: 'found',
    domain,
    rank,
    decimal,
    position: number(row.rank, 1, 1e12),
  }
}
