// What the site and the API agree on, without Zod: the scan form imports this file alone, so
// the page ships no schema library (M2.1 plan §2).

/** BUILD-PLAN §11; the egress package checks the same limit (tested). */
export const MAX_URL_LENGTH = 2048

/** Where a scan is created. */
export const SCANS_PATH = '/api/scans'

/**
 * A scan's ID: 16 random bytes in base64url, so it cannot be guessed (Phase 2 design §3).
 */
export const SCAN_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/

/** Why a URL is not scanned: the egress package's own codes for it. */
export const URL_ERROR_CODES = [
  'invalid-url',
  'unsupported-scheme',
  'url-too-long',
  'credentials-in-url',
  'port-not-allowed',
  'blocked-host',
  'blocked-address',
  'dns-failed',
] as const

/** Why the API did not start a scan. */
export const SCAN_ERROR_CODES = [
  ...URL_ERROR_CODES,
  /** Turnstile could not tell that a person sent the form. */
  'turnstile-failed',
  /** The visitor's scans reached the anonymous limit; retryAfterSeconds says when to try again. */
  'rate-limited',
  /** The API or its queue is down or full. */
  'unavailable',
] as const

export type UrlErrorCode = (typeof URL_ERROR_CODES)[number]
export type ScanErrorCode = (typeof SCAN_ERROR_CODES)[number]

export function isScanErrorCode(value: unknown): value is ScanErrorCode {
  return typeof value === 'string' && (SCAN_ERROR_CODES as readonly string[]).includes(value)
}

/** The body of `POST /api/scans`. */
export interface CreateScanRequest {
  readonly url: string
  /** Turnstile's token; the API checks it with Cloudflare. */
  readonly turnstileToken: string
}

/** `202 Accepted`: the scan is queued, and its page is `/r/{id}`. */
export interface CreateScanResponse {
  readonly id: string
}

/** Any refusal, with its HTTP status (400, 403, 422, 429 or 503). */
export interface ScanErrorResponse {
  readonly error: ScanErrorCode
  /** Only with rate-limited. */
  readonly retryAfterSeconds?: number
}
