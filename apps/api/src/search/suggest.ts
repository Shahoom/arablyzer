import {
  SEARCH_TERM_MAX,
  SUGGEST_SEED_MAX_WORDS,
  type SuggestGroup,
  type SuggestKind,
  type SuggestResponse,
} from '@arablyzer/api-contract/codes'
import { safeFetch, type EgressPolicy, type Resolver } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import { DayCache } from './cache'

/**
 * Google's public suggestion endpoint, as the misspellings tool uses it (docs/design/plans/
 * arabic-native.md section 12) and with its caveats: it is not an API with a contract, its terms do
 * not offer it for automated use, it can change or block without notice. So it is behind
 * ARABLYZER_SUGGEST=1, asked one question at a time, a pause between them, as ArablyzerBot,
 * the answers kept a day, and given up at the first answer that is not the JSON we read.
 */
export const SUGGEST_ENDPOINT = 'https://suggestqueries.google.com/complete/search'
/** The 28 letters, ا to ي, each added after the seed. */
export const LETTERS = 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي'.split(' ')
/** The question words put before the seed, and «أفضل». */
export const QUESTIONS = ['كيف', 'لماذا', 'ما', 'أفضل'] as const
export const SUGGEST_GAP_MS = 500
export const SUGGEST_TOTAL_MS = 40_000
const TIMEOUT_MS = 8_000
const MAX_BYTES = 64 * 1024

/** One question to Google, and which group its answers go in. */
export interface Expansion {
  readonly kind: SuggestKind
  readonly trigger: string
  readonly query: string
}

/** The seed, the question words before it, then the letters after it: 33 questions. */
export function expansions(seed: string): Expansion[] {
  return [
    { kind: 'seed', trigger: '', query: seed },
    ...QUESTIONS.map((word): Expansion => ({
      kind: 'question',
      trigger: word,
      query: `${word} ${seed}`,
    })),
    ...LETTERS.map((letter): Expansion => ({
      kind: 'letter',
      trigger: letter,
      query: `${seed} ${letter}`,
    })),
  ]
}

/**
 * A seed the tool takes: one to four words, 60 characters at most, no control characters; the
 * spaces folded. Null for anything else.
 */
export function cleanTerm(input: unknown, maxWords = SUGGEST_SEED_MAX_WORDS): string | null {
  if (typeof input !== 'string') return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(input)) return null
  const term = input.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (term.length < 2 || term.length > SEARCH_TERM_MAX) return null
  if (term.split(' ').length > maxWords) return null
  return /[\p{L}\p{N}]/u.test(term) ? term : null
}

export interface SuggestDeps {
  readonly policy: EgressPolicy
  readonly resolver?: Resolver
  readonly fetcher?: typeof safeFetch
  /** Another place for Google's endpoint: tests' stand-in. */
  readonly endpoint?: string
  readonly now: () => number
  readonly sleep?: (ms: number) => Promise<void>
  readonly gapMs?: number
  readonly totalMs?: number
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

type Answer = readonly string[]

/** The tool's suggestion tree for a seed: asked of Google, deduplicated, grouped. */
export function suggestTree(deps: SuggestDeps) {
  const cache = new DayCache<Answer>(deps.now)
  const ask = async (query: string): Promise<Answer | null> => {
    const cached = cache.get(query)
    if (cached !== undefined) return cached
    const url = new URL(deps.endpoint ?? SUGGEST_ENDPOINT)
    url.searchParams.set('client', 'firefox')
    url.searchParams.set('hl', 'ar')
    url.searchParams.set('q', query)
    try {
      const fetched = await (deps.fetcher ?? safeFetch)(url.href, {
        userAgent: USER_AGENT,
        accept: 'application/json',
        policy: deps.policy,
        ...(deps.resolver === undefined ? {} : { resolver: deps.resolver }),
        timeoutMs: TIMEOUT_MS,
        maxBytes: MAX_BYTES,
      })
      const response = fetched.response
      if (response?.status !== 200) return null
      const body: unknown = JSON.parse(new TextDecoder().decode(response.body))
      if (!Array.isArray(body) || !Array.isArray(body[1])) return null
      const answer = (body[1] as unknown[]).filter(
        (item): item is string => typeof item === 'string' && item.trim() !== '',
      )
      cache.set(query, answer)
      return answer
    } catch {
      return null
    }
  }

  return {
    async run(seed: string): Promise<SuggestResponse> {
      const plan = expansions(seed)
      const started = deps.now()
      const seen = new Set<string>()
      const groups: SuggestGroup[] = []
      let answered = 0
      let asked = 0
      let stopped: SuggestResponse['stopped'] = null
      for (const step of plan) {
        if (deps.now() - started >= (deps.totalMs ?? SUGGEST_TOTAL_MS)) {
          stopped = 'time'
          break
        }
        const fresh = cache.get(step.query) === undefined
        if (fresh && asked > 0) await (deps.sleep ?? wait)(deps.gapMs ?? SUGGEST_GAP_MS)
        const answer = await ask(step.query)
        asked++
        if (answer === null) {
          // Not what we read: stop asking, and keep what came before.
          stopped = 'unreadable'
          break
        }
        answered++
        const fresher: string[] = []
        for (const suggestion of answer) {
          const clean = suggestion.replace(/\s+/g, ' ').trim()
          const key = clean.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          fresher.push(clean)
        }
        groups.push({ kind: step.kind, trigger: step.trigger, suggestions: fresher })
      }
      return { seed, groups, total: seen.size, answered, asked, stopped }
    },
  }
}

export type SuggestTree = ReturnType<typeof suggestTree>
