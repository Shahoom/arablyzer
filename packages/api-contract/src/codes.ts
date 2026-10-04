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

/**
 * A report's deletion token: 32 random bytes in base64url, given once, with the scan's ID, when
 * the scan is created (M5, issue #33). Whoever holds it deletes the scan and its report
 * (`DELETE /api/reports/:id` with `Authorization: Bearer <token>`); the API keeps only its hash.
 */
export const DELETE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

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
  /**
   * What deletes the scan and its report, DELETE_TOKEN_PATTERN: given here and nowhere else, and
   * kept by the API only as a hash, so a page that loses it cannot get it again.
   */
  readonly deleteToken: string
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

/**
 * Google Search Console, connected from a finished report (account-free, nothing stored): the
 * paths of its routes, the one-time result's id, and the result the report page shows.
 */
export const GSC_STATUS_PATH = '/api/gsc/status'
export const GSC_START_PATH = '/api/gsc/start'
export const GSC_CALLBACK_PATH = '/api/gsc/callback'
/** A one-time result's id: 32 random bytes. The report page's `?gsc=` holds it, or a keyword. */
export const GSC_RESULT_PATTERN = /^[A-Za-z0-9_-]{43}$/
/** What `?gsc=` says, in place of a result's id, when the connection did not give one. */
export const GSC_FAILURES = ['denied', 'error'] as const
export type GscFailure = (typeof GSC_FAILURES)[number]
export const gscStartPath = (report: string, lang: 'ar' | 'en'): string =>
  `${GSC_START_PATH}?report=${encodeURIComponent(report)}&lang=${lang}`
export const gscResultPath = (id: string): string => `/api/gsc/results/${id}`

export interface GscStatus {
  readonly enabled: boolean
}

/** Search Analytics' numbers: CTR as a fraction (0 to 1), position as the average. */
export interface GscMetrics {
  readonly clicks: number
  readonly impressions: number
  readonly ctr: number
  readonly position: number
}

/** A row of a breakdown: the query, the page's address, or the country (an ISO 3166-1 alpha-3 code). */
export interface GscRow extends GscMetrics {
  readonly key: string
}

/** What URL Inspection says of the report's URL; each field is null when Google did not give it. */
export interface GscInspection {
  readonly verdict: string | null
  readonly coverageState: string | null
  readonly indexingState: string | null
  readonly pageFetchState: string | null
  readonly robotsTxtState: string | null
  /** ISO 8601. */
  readonly lastCrawlTime: string | null
  readonly googleCanonical: string | null
  readonly userCanonical: string | null
  /** Mobile usability, where Google still returns it: its verdict and the issues' types. */
  readonly mobileUsability: {
    readonly verdict: string | null
    readonly issues: readonly string[]
  } | null
}

export interface GscResult {
  /** The Search Console property the report's site matched; null when the user owns none. */
  readonly property: { readonly siteUrl: string; readonly kind: 'domain' | 'prefix' } | null
  /** The 28 days the numbers cover, as YYYY-MM-DD. */
  readonly period: { readonly start: string; readonly end: string }
  readonly totals: GscMetrics | null
  readonly queries: readonly GscRow[]
  readonly pages: readonly GscRow[]
  readonly countries: readonly GscRow[]
  readonly inspection: GscInspection | null
  /** Something Google would not give: the rest is shown, and the page says so. */
  readonly partial: boolean
}

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
      /**
       * The host the page was reached at, after its redirects: what the worker counts against
       * the site's limit of scans. Absent where no page was reached.
       */
      readonly host?: string
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
