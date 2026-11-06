import {
  AI_CONFIDENCE,
  AI_MAX_EXPLANATION,
  AI_MAX_PATCH,
  AI_MAX_STEP,
  AI_MAX_STEPS,
  type AiConfidence,
  type Language,
} from '@arablyzer/api-contract'
import { z } from 'zod'

/**
 * The shape the model is held to (structured output): fixed, with no field it could use to ask for
 * anything. The server validates the answer again before it is kept or shown.
 */
export const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    explanation_ar: { type: 'string' },
    explanation_en: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    patch: { type: 'string' },
    confidence: { type: 'string', enum: [...AI_CONFIDENCE] },
  },
  required: ['explanation_ar', 'explanation_en', 'steps', 'patch', 'confidence'],
  additionalProperties: false,
} as const

/** The model's answer as it must arrive: nothing else, no field more. */
const Raw = z.strictObject({
  explanation_ar: z.string().max(20_000),
  explanation_en: z.string().max(20_000),
  steps: z.array(z.string().max(5_000)).max(50),
  patch: z.string().max(50_000),
  confidence: z.enum(AI_CONFIDENCE),
})

/** What is kept and shown: one explanation, in the language asked for. */
export interface Answer {
  readonly explanation: string
  readonly steps: readonly string[]
  readonly patch: string
  readonly confidence: AiConfidence
}

/** What a stored answer must be, read back. */
export const StoredAnswer = z.strictObject({
  explanation: z.string().min(1).max(AI_MAX_EXPLANATION),
  steps: z.array(z.string().max(AI_MAX_STEP)).max(AI_MAX_STEPS),
  patch: z.string().max(AI_MAX_PATCH),
  confidence: z.enum(AI_CONFIDENCE),
})

// Controls but the line break and the tab, and the characters that reorder text: a suggested patch
// must read in code the way it is written (the "trojan source" attack), and text in a line of its own.
/* eslint-disable no-control-regex */
const UNSAFE =
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g
/* eslint-enable no-control-regex */

const tidy = (text: string): string => text.replace(UNSAFE, '').trim()
const cut = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text

/**
 * The model's text as an answer for the language asked, or null when it is not one: not JSON, not
 * the shape, or empty where the language's explanation must be. Over-long text is shortened; a patch
 * that is over-long is dropped rather than cut in the middle of code.
 */
export function parseAnswer(text: string, language: Language): Answer | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const raw = Raw.safeParse(json)
  if (!raw.success) return null
  const explanation = tidy(language === 'ar' ? raw.data.explanation_ar : raw.data.explanation_en)
  if (explanation === '') return null
  const patch = tidy(raw.data.patch)
  return {
    explanation: cut(explanation, AI_MAX_EXPLANATION),
    steps: raw.data.steps
      .map(tidy)
      .filter((step) => step !== '')
      .slice(0, AI_MAX_STEPS)
      .map((step) => cut(step, AI_MAX_STEP)),
    patch: patch.length > AI_MAX_PATCH ? '' : patch,
    confidence: raw.data.confidence,
  }
}
