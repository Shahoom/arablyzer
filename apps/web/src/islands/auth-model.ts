import {
  ACCOUNT_PAGE_PATH,
  AUTH_ERROR_CODES,
  LOGIN_PAGE_PATH,
  type AccountSummary,
  type AuthErrorCode,
  type Language,
} from '@arablyzer/api-contract/codes'
import type { AccountProblem } from '@arablyzer/i18n/account'

/** What a request to the account routes can come to besides success. */
export type AuthProblem = AuthErrorCode | 'network'

const prefix = (lang: Language): string => (lang === 'en' ? '/en' : '')

/** The account page of a language: the only place a sign-in ends, never an address a request names. */
export function accountHref(lang: Language): string {
  return `${prefix(lang)}${ACCOUNT_PAGE_PATH}`
}

export function loginHref(lang: Language): string {
  return `${prefix(lang)}${LOGIN_PAGE_PATH}`
}

const isCode = (value: unknown): value is AuthErrorCode =>
  typeof value === 'string' && (AUTH_ERROR_CODES as readonly string[]).includes(value)

/** An error answer of the API: its code, and when to come back if it said. */
export function problemOf(
  status: number,
  body: unknown,
): { problem: AuthProblem; retryAfterSeconds?: number } {
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const code = fields.error
  const wait = fields.retryAfterSeconds
  if (isCode(code)) {
    return typeof wait === 'number' && Number.isFinite(wait) && wait > 0
      ? { problem: code, retryAfterSeconds: wait }
      : { problem: code }
  }
  // An answer that is not ours (a proxy's page, an HTML error): the service is not there.
  if (status === 401) return { problem: 'unauthorized' }
  if (status === 429) return { problem: 'rate-limited' }
  return { problem: 'unavailable' }
}

/** Whether an answer is an account, as the page reads it. */
export function isAccountSummary(value: unknown): value is AccountSummary {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.email === 'string' &&
    typeof v.name === 'string' &&
    (v.language === null || v.language === 'ar' || v.language === 'en') &&
    typeof v.createdAt === 'string'
  )
}

/**
 * Why a sign-in on Google's page ended without an account, from the `?error=` the API's callback
 * sent the browser back with. The library's own codes are mapped; anything else is a plain failure.
 */
export function problemFromQuery(search: string): AccountProblem | null {
  const error = new URLSearchParams(search).get('error')
  if (error === null || error === '') return null
  if (error === 'email_not_verified' || error === 'email_not_found' || error === 'email_missing') {
    return 'unverified'
  }
  if (error === 'access_denied') return 'cancelled'
  if (error === 'rate-limited') return 'rate-limited'
  if (error === 'unavailable') return 'unavailable'
  return 'failed'
}
