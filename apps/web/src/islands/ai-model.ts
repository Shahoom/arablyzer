import {
  AI_CONFIDENCE,
  AI_ERROR_CODES,
  type AiErrorCode,
  type AiFix,
  type AiStatus,
} from '@arablyzer/api-contract/codes'
import type { AiProblem } from '@arablyzer/i18n/ai'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/** Whether an answer is the assistant's status, as the page reads it. */
export function isAiStatus(value: unknown): value is AiStatus {
  return (
    isObject(value) &&
    typeof value.available === 'boolean' &&
    isCount(value.perDay) &&
    isCount(value.used)
  )
}

/** Whether an answer is a suggested fix; its text is shown as text, so only its shape is checked. */
export function isAiFix(value: unknown): value is AiFix {
  return (
    isObject(value) &&
    typeof value.ruleId === 'string' &&
    (value.language === 'ar' || value.language === 'en') &&
    typeof value.explanation === 'string' &&
    Array.isArray(value.steps) &&
    (value.steps as unknown[]).every((step) => typeof step === 'string') &&
    typeof value.patch === 'string' &&
    typeof value.confidence === 'string' &&
    (AI_CONFIDENCE as readonly string[]).includes(value.confidence) &&
    typeof value.cached === 'boolean'
  )
}

const isCode = (value: unknown): value is AiErrorCode =>
  typeof value === 'string' && (AI_ERROR_CODES as readonly string[]).includes(value)

/** An error answer of the API: its code, or what the status says if it is not one of ours (a proxy's page). */
export function aiProblemOf(status: number, body: unknown): AiProblem {
  const code = isObject(body) ? body.error : undefined
  if (isCode(code)) return code
  if (status === 401) return 'unauthorized'
  if (status === 429) return 'rate-limited'
  return 'unavailable'
}
