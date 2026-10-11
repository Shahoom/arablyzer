import {
  API_KEY_PATTERN,
  type ApiKeyCreated,
  type ApiKeysResponse,
  type ApiKeySummary,
} from '@arablyzer/api-contract/codes'
import type { KeysProblem } from '@arablyzer/i18n/developers'

// What the account page's API keys panel (M5.1) trusts of the API's answers, and how a refusal is told.

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const isText = (value: unknown): value is string => typeof value === 'string'

export function isApiKeySummary(value: unknown): value is ApiKeySummary {
  return (
    isObject(value) &&
    isText(value.id) &&
    isText(value.name) &&
    isText(value.prefix) &&
    isText(value.createdAt) &&
    (value.lastUsedAt === null || isText(value.lastUsedAt))
  )
}

export function isApiKeysResponse(value: unknown): value is ApiKeysResponse {
  return (
    isObject(value) &&
    Array.isArray(value.keys) &&
    (value.keys as unknown[]).every(isApiKeySummary) &&
    typeof value.limit === 'number' &&
    Number.isInteger(value.limit) &&
    typeof value.enabled === 'boolean'
  )
}

export function isApiKeyCreated(value: unknown): value is ApiKeyCreated {
  return (
    isObject(value) &&
    isApiKeySummary(value.key) &&
    isText(value.secret) &&
    API_KEY_PATTERN.test(value.secret)
  )
}

/** A refusal of the key routes: the plan's limits by name, then the status. */
export function keysProblemOf(status: number, body: unknown): KeysProblem {
  const fields = isObject(body) ? body : {}
  if (fields.error === 'plan-limit') return fields.limit === 'api' ? 'closed' : 'limit'
  if (status === 400) return 'bad-request'
  if (status === 401) return 'unauthorized'
  if (status === 404) return 'not-found'
  if (status === 429) return 'rate-limited'
  return 'unavailable'
}
