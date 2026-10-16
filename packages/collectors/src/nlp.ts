/**
 * What the Arabic NLP service said of a page (docs/design/plans/m7-deep-arabic.md): spelling slips
 * it is sure of, and the dialect model's reading. The service is optional: without its answer the
 * rules that need it do not apply, and the dialect rule falls back to its word list.
 */
export const NLP_VARIETIES = ['msa', 'gulf', 'egyptian', 'levantine', 'maghrebi'] as const
export type NlpVariety = (typeof NLP_VARIETIES)[number]

export const SPELLING_FAMILIES = [
  'hamza',
  'ta-marbuta',
  'alef-maqsura',
  'tanween',
  'typo',
  'phrase',
] as const
export type SpellingFamily = (typeof SPELLING_FAMILIES)[number]

export interface NlpSpelling {
  /** The word as the page writes it. */
  readonly word: string
  readonly suggestion: string
  readonly family: SpellingFamily
  /** 0 to 1: the service's own estimate that the word is a slip and the suggestion is its fix. */
  readonly confidence: number
  /** A little of the text each side, for the finding to show. */
  readonly before: string
  readonly after: string
  /** Other spellings the word might have been meant as, likeliest first. */
  readonly alternatives: readonly string[]
}

export interface NlpSpellingFacts {
  readonly findings: readonly NlpSpelling[]
  readonly words: number
  /** Words the check weighed (the rest are quotations, addresses, marks and the like). */
  readonly judged: number
  /** The service cut its work short at its time limit, or the page's text was cut to the caps. */
  readonly truncated: boolean
  /** The threshold the findings passed. */
  readonly minConfidence: number
}

export interface NlpDialectFacts {
  readonly label: NlpVariety | null
  /** The share of the text's sentences, weighted by words, each variety has, 0 to 1. */
  readonly probabilities: Readonly<Record<NlpVariety, number>>
  /** The sentences each variety won. */
  readonly votes: Readonly<Record<NlpVariety, number>>
  readonly chunks: number
  readonly words: number
  readonly truncated: boolean
}

export interface NlpFacts {
  /** Null where the service was not asked, or did not answer this part. */
  readonly spelling: NlpSpellingFacts | null
  readonly dialect: NlpDialectFacts | null
}

export interface NlpOptions {
  /** The service's address, such as http://arabic-nlp:8790. */
  readonly url: string
  /** The whole ask, both parts together; NLP_TIMEOUT_MS by default. */
  readonly timeoutMs?: number
  /** The lowest confidence a spelling finding may have; 0.9 by default. */
  readonly minConfidence?: number
  /** Another way to call; tests give a stand-in so that no service is needed. */
  readonly fetch?: typeof fetch
  /** The clock; tests only. */
  readonly now?: () => number
}

/** Both asks together: the service answers a page in about a second; past this the scan goes on without it. */
export const NLP_TIMEOUT_MS = 6_000
export const NLP_MIN_CONFIDENCE = 0.9
/** What a page may send: the service's own caps are 400 texts of 5,000 characters and 60,000 in all. */
export const NLP_MAX_TEXTS = 300
export const NLP_MAX_TEXT_CHARS = 4_000
export const NLP_MAX_TOTAL_CHARS = 50_000
/** After a failure the service is not asked again for this long, so a service that is down costs a scan nothing. */
export const NLP_REST_MS = 20_000

const rest = new Map<string, number>()

export interface NlpWants {
  readonly spelling: boolean
  readonly dialect: boolean
}

export interface NlpRun {
  /** What was answered; undefined when nothing was (the service was not asked, or no part answered). */
  readonly facts: NlpFacts | undefined
  /** The service was asked and a part of the ask failed: the report says so. */
  readonly failed: boolean
}

/**
 * Asks the service about these texts (what a page sent, or what a visitor pasted): the spelling
 * slips and the dialect model's reading, each only if wanted. A failure rests the service for
 * NLP_REST_MS, so a service that is down costs nothing after the first scan; a part that did not
 * answer is null and `failed` says so.
 */
export async function askNlpTexts(
  texts: readonly string[],
  options: NlpOptions,
  wants: NlpWants,
  capped = false,
  signal?: AbortSignal,
): Promise<NlpRun> {
  if (texts.length === 0 || (!wants.spelling && !wants.dialect)) {
    return { facts: undefined, failed: false }
  }
  const now = options.now ?? Date.now
  const base = options.url.replace(/\/+$/, '')
  if ((rest.get(base) ?? 0) > now()) return { facts: undefined, failed: true }
  const call = options.fetch ?? fetch
  const minConfidence = options.minConfidence ?? NLP_MIN_CONFIDENCE
  const until = now() + (options.timeoutMs ?? NLP_TIMEOUT_MS)
  const ask = async (path: string, body: object): Promise<unknown> => {
    const left = Math.max(1, until - now())
    const response = await call(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal:
        signal === undefined
          ? AbortSignal.timeout(left)
          : AbortSignal.any([signal, AbortSignal.timeout(left)]),
    })
    if (!response.ok) throw new Error(`status ${String(response.status)}`)
    const answer: unknown = await response.json()
    return answer
  }
  let failed = false
  let spelling: NlpSpellingFacts | null = null
  if (wants.spelling) {
    try {
      spelling = readSpelling(
        await ask('/spell', { texts, min_confidence: minConfidence }),
        minConfidence,
        capped,
      )
    } catch {
      failed = true
    }
  }
  // A service that did not answer the first ask is not asked the second.
  let dialect: NlpDialectFacts | null = null
  if (wants.dialect && !failed) {
    try {
      dialect = readDialect(await ask('/dialect', { texts }))
    } catch {
      failed = true
    }
  }
  if (failed) rest.set(base, now() + NLP_REST_MS)
  else rest.delete(base)
  const facts: NlpFacts | undefined =
    spelling === null && dialect === null ? undefined : { spelling, dialect }
  return { facts, failed }
}

/** Forgets that the service failed: tests, and a scan after the operator restarts it. */
export function forgetNlpFailures(): void {
  rest.clear()
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.length > 0 && value.length <= max ? value : null
const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const FAMILIES: ReadonlySet<string> = new Set(SPELLING_FAMILIES)

function readSpelling(answer: unknown, minConfidence: number, capped: boolean): NlpSpellingFacts {
  if (!isRecord(answer) || !Array.isArray(answer.findings)) throw new TypeError('spelling')
  const findings: NlpSpelling[] = []
  for (const item of answer.findings.slice(0, 200) as unknown[]) {
    if (!isRecord(item)) continue
    const word = text(item.word, 80)
    const suggestion = text(item.suggestion, 80)
    const confidence = number(item.confidence)
    if (
      word === null ||
      suggestion === null ||
      confidence === null ||
      confidence < 0 ||
      confidence > 1 ||
      typeof item.family !== 'string' ||
      !FAMILIES.has(item.family)
    ) {
      continue
    }
    const others = Array.isArray(item.alternatives) ? (item.alternatives as unknown[]) : []
    findings.push({
      word,
      suggestion,
      family: item.family as SpellingFamily,
      confidence,
      before: typeof item.before === 'string' ? item.before.slice(0, 60) : '',
      after: typeof item.after === 'string' ? item.after.slice(0, 60) : '',
      alternatives: others.flatMap((other) => {
        const value = text(other, 80)
        return value === null ? [] : [value]
      }),
    })
  }
  return {
    findings,
    words: Math.max(0, Math.trunc(number(answer.words) ?? 0)),
    judged: Math.max(0, Math.trunc(number(answer.judged) ?? 0)),
    truncated: answer.truncated === true || capped,
    minConfidence: Math.max(minConfidence, number(answer.min_confidence) ?? 0),
  }
}

function varieties<T extends number>(value: unknown): Record<NlpVariety, T> {
  const source = isRecord(value) ? value : {}
  return Object.fromEntries(
    NLP_VARIETIES.map((variety) => [variety, (number(source[variety]) ?? 0) as T]),
  ) as Record<NlpVariety, T>
}

function readDialect(answer: unknown): NlpDialectFacts {
  if (!isRecord(answer)) throw new TypeError('dialect')
  const label = NLP_VARIETIES.find((variety) => variety === answer.label) ?? null
  return {
    label,
    probabilities: varieties(answer.probabilities),
    votes: varieties(answer.votes),
    chunks: Math.max(0, Math.trunc(number(answer.chunks) ?? 0)),
    words: Math.max(0, Math.trunc(number(answer.words) ?? 0)),
    truncated: answer.truncated === true,
  }
}
