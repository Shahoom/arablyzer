// What the site and the API agree on, without Zod: the scan form imports this file alone, so
// the page ships no schema library (M2.1 plan §2).

/** BUILD-PLAN §11; the egress package checks the same limit (tested). */
export const MAX_URL_LENGTH = 2048

/** Where a scan is created. */
export const SCANS_PATH = '/api/scans'

/**
 * The `action` the site's Turnstile widget sets, and the API asks Cloudflare's answer to name: a
 * token made for another widget of the same site key is not a scan's. Cloudflare takes up to 32
 * letters, digits, underscores and hyphens.
 */
export const TURNSTILE_ACTION = 'scan'

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
  /** Not a request the form sends: not JSON, too large, or other fields. */
  'bad-request',
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
  /** A tool's slug (packages/tools): the scan runs that tool's rules alone (M2.2). */
  readonly tool?: string
}

/** A tool's slug, as the site sends it: ASCII kebab-case (BUILD-PLAN §5.1). */
export const TOOL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** The longest slug the API reads. */
export const MAX_TOOL_SLUG_LENGTH = 64

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

/** Where a scan's events stream from, and where its report is read. */
export const scanEventsPath = (id: string): string => `/api/scans/${id}/events`
export const scanPath = (id: string): string => `/api/scans/${id}`
export const reportPath = (id: string): string => `/api/reports/${id}`

export type EngineName = 'chromium' | 'firefox' | 'webkit'

/** Where a scan is: waiting, running, or finished the way its report says. */
export type ScanState = 'queued' | 'running' | 'complete' | 'partial' | 'failed'

/** `GET /api/scans/:id`: the scan the page follows. */
export interface ScanSummary {
  readonly id: string
  readonly url: string
  readonly state: ScanState
  /** ISO 8601. */
  readonly createdAt: string
  /** The tool the scan ran, when a tool page asked for it: its rules alone, and no score. */
  readonly tool?: string
}

/**
 * One step of a scan, streamed to its page (`GET /api/scans/:id/events`, SSE): the engine's
 * progress (M2.1b), between queued and started, and done or error. A reconnecting page resumes
 * after the last event it saw (`Last-Event-ID`).
 */
export type ScanEvent =
  /** Scans ahead of this one in the queue. */
  | { readonly type: 'queued'; readonly ahead: number }
  /** The engines this scan renders in, in order: the page shows only those. */
  | { readonly type: 'started'; readonly engines: readonly EngineName[] }
  | {
      readonly type: 'page'
      readonly status: number | null
      readonly contentType: string | null
      readonly error: string | null
    }
  | {
      /**
       * A site's robots.txt, read before the scan asks it for a page (M2.4 plan §2): the page's
       * site first, then each other site a redirect leads to. Where it asks ArablyzerBot not to
       * check the page, the scan ends there.
       */
      readonly type: 'robots'
      readonly outcome: 'fetched' | 'unavailable' | 'unreachable' | 'failed'
      readonly status: number | null
    }
  | { readonly type: 'crux'; readonly outcome: 'found' | 'not-found' | 'failed' | 'skipped' }
  | { readonly type: 'render-start'; readonly engine: EngineName }
  | {
      readonly type: 'render'
      readonly engine: EngineName
      readonly version: string | null
      readonly status: 'rendered' | 'failed' | 'timeout' | 'unavailable' | 'refused'
      readonly requests: { readonly total: number; readonly refused: number }
    }
  | { readonly type: 'lab-start' }
  | {
      readonly type: 'lab'
      readonly status: 'measured' | 'failed' | 'timeout' | 'unavailable' | 'skipped'
    }
  | { readonly type: 'rules'; readonly rules: number }
  /** The report is ready: `GET /api/reports/:id`. */
  | { readonly type: 'done'; readonly state: 'complete' | 'partial' | 'failed' }
  /** The scan could not run at all; no report. */
  | { readonly type: 'error' }

export const TERMINAL_EVENTS: readonly ScanEvent['type'][] = ['done', 'error']
