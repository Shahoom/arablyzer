import Anthropic from '@anthropic-ai/sdk'
import type { Language } from '@arablyzer/api-contract'
import type { Report } from '@arablyzer/report-schema'
import { FIX_CACHE_DAYS, quietly, type AiData } from '@arablyzer/store'
import { ANSWER_SCHEMA, parseAnswer, StoredAnswer, type Answer } from './answer'
import type { ModelClient } from './client'
import { costMicro, worstCaseMicro } from './cost'
import { cacheKey, evidenceOf, SYSTEM_PROMPT, userMessage } from './prompt'
import type { AiSettings } from './settings'

const DAY_MS = 24 * 60 * 60 * 1000

export interface AssistantDeps {
  readonly settings: AiSettings
  readonly data: AiData
  readonly client: ModelClient
  readonly newId: () => string
  readonly now?: () => Date
  readonly log?: (message: string) => void
}

export interface SuggestInput {
  readonly userId: string
  /** The account's suggestions a day (its plan). */
  readonly perDay: number
  readonly report: Report
  readonly ruleId: string
  readonly language: Language
}

export type Suggested =
  | { readonly ok: true; readonly answer: Answer; readonly cached: boolean }
  | {
      readonly ok: false
      readonly error:
        'not-found' | 'limit' | 'busy' | 'budget' | 'refused' | 'unavailable' | 'failed'
      readonly retryAfterSeconds?: number
    }

export interface Assistant {
  readonly settings: AiSettings
  /** Asks for a suggested fix of one rule of a report, or gives the one stored for the same evidence. */
  suggest(input: SuggestInput): Promise<Suggested>
  /** The requests the account has made in the last day. */
  used(userId: string): Promise<number>
}

/**
 * What goes to the model, and nothing besides: the fixed system prompt, one user message holding the
 * data in its tags, the answer's schema. No tool, no tool choice, no search, no fetch: the model can
 * only answer. Thinking and sampling are the model's own.
 */
export function requestFor(
  settings: AiSettings,
  user: string,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: settings.model,
    max_tokens: settings.maxOutputTokens,
    // The system prompt never changes, so the model's cache can keep it between requests.
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: {
      format: { type: 'json_schema', schema: ANSWER_SCHEMA },
      ...(settings.effort === undefined ? {} : { effort: settings.effort }),
    },
  }
}

/** Whether the SDK's error is one of those that mean the model, not the request, is the problem. */
function statusOf(error: unknown): number | null {
  return error instanceof Anthropic.APIError && typeof error.status === 'number'
    ? error.status
    : null
}

/**
 * The fix assistant (BUILD-PLAN §12). Cached answers cost nothing and use none of the account's
 * day; a new one takes its place in the ledger first (the account's day, its waiting requests and
 * the spend caps, as one step), asks the model, and is settled at what the response says it cost.
 * A failure before the model answered gives the place back. What it tells of a failure is a word:
 * never the model's reply, the request, or the key.
 */
export function createAssistant(deps: AssistantDeps): Assistant {
  const { settings, data, client } = deps
  const now = deps.now ?? (() => new Date())
  const told = quietly('Fix assistant', deps.log)
  const tell = (text: string) => {
    told(new Error(text))
  }

  return {
    settings,
    used: (userId) => data.used(userId, now()),

    async suggest(input): Promise<Suggested> {
      const evidence = evidenceOf(input.report, input.ruleId)
      if (evidence === null) return { ok: false, error: 'not-found' }
      const at = now()
      const key = cacheKey(evidence, input.language, settings.model)
      const stored = await data.cached(key, new Date(at.getTime() - FIX_CACHE_DAYS * DAY_MS))
      if (stored !== null) {
        let parsed: unknown = null
        try {
          parsed = JSON.parse(stored.fix)
        } catch {
          // An answer that cannot be read is asked for again.
        }
        const answer = StoredAnswer.safeParse(parsed)
        if (answer.success) return { ok: true, answer: answer.data, cached: true }
      }

      const request = requestFor(settings, userMessage(evidence, input.language))
      const id = deps.newId()
      const worst = worstCaseMicro(
        Buffer.byteLength(JSON.stringify(request)),
        settings.maxOutputTokens,
        settings.prices,
      )
      const reserved = await data.reserve({
        id,
        userId: input.userId,
        ruleId: input.ruleId,
        at,
        worstMicro: worst,
        perDay: input.perDay,
        maxPending: settings.maxPending,
        dailyCapMicro: settings.dailyCapMicro,
        monthlyCapMicro: settings.monthlyCapMicro,
      })
      if (reserved.kind === 'limit') {
        return { ok: false, error: 'limit', retryAfterSeconds: reserved.retryAfterSeconds }
      }
      if (reserved.kind === 'busy') return { ok: false, error: 'busy' }
      if (reserved.kind === 'budget') {
        tell(`The ${reserved.cap}'s spend cap is reached`)
        return { ok: false, error: 'budget' }
      }

      let message: Anthropic.Message
      try {
        message = await client.messages.create(request)
      } catch (error) {
        // Nothing was answered, so nothing is billed: the place goes back.
        await data.release(id).catch(() => undefined)
        const status = statusOf(error)
        tell(
          status === null
            ? 'The model could not be reached'
            : `The model answered with status ${String(status)}`,
        )
        return { ok: false, error: 'unavailable' }
      }

      // Whatever the response is, it was billed: settle it before reading it.
      const usage = {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cacheRead: message.usage.cache_read_input_tokens ?? 0,
        cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
      }
      await data.settle(
        id,
        {
          model: message.model,
          inputTokens: usage.input,
          outputTokens: usage.output,
          cacheReadTokens: usage.cacheRead,
          cacheWriteTokens: usage.cacheWrite,
          costMicro: costMicro(usage, settings.prices),
        },
        now(),
      )

      if (message.stop_reason === 'refusal') return { ok: false, error: 'refused' }
      if (message.stop_reason !== 'end_turn') {
        tell(`The model stopped with ${message.stop_reason ?? 'no reason'}`)
        return { ok: false, error: 'failed' }
      }
      const block = message.content.find((part) => part.type === 'text')
      const answer = block === undefined ? null : parseAnswer(block.text, input.language)
      if (answer === null) {
        tell('The model’s answer was not in the required form')
        return { ok: false, error: 'failed' }
      }
      await data.cache(key, JSON.stringify(answer), settings.model, now()).catch(() => undefined)
      return { ok: true, answer, cached: false }
    },
  }
}
