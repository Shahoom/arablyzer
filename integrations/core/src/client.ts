import type { V1ErrorCode, V1Scan, V1ScanStarted } from '@arablyzer/api-contract'
import type { Report } from '@arablyzer/report-schema'

// The public API (/api/v1) as the two integrations use it. It checks only what the integrations
// read, by hand: the contract's schemas are Zod, and a Chrome extension and an Action bundle
// should not carry a schema library for four routes. Types come from the contract, so a change
// there breaks the build here.

/** Anything shaped like `fetch`: the global one, or a stub in a test. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export interface ClientOptions {
  /** Where Arablyzer is: the site's origin. */
  readonly baseUrl: string
  /** An API key, `arb_…`. */
  readonly apiKey: string
  readonly fetcher: Fetcher
  /** Sent with every request (the Action names itself in `User-Agent`). */
  readonly headers?: Readonly<Record<string, string>>
  /** One request's limit, in milliseconds. Default 30 seconds. */
  readonly timeoutMs?: number
}

/** What the API says, plus two things only a client can see: no answer, and an answer it cannot read. */
export type ClientErrorCode = V1ErrorCode | 'network' | 'bad_response' | 'timeout' | 'scan_failed'

export class ApiError extends Error {
  readonly code: ClientErrorCode
  readonly status: number
  /** When the API asked to be tried again (429): `Retry-After`, or `details.retryAfterSeconds`. */
  readonly retryAfterSeconds: number | undefined
  /** Which limit a `plan_limit` names (`details.limit`). */
  readonly limit: string | undefined
  constructor(
    code: ClientErrorCode,
    message: string,
    status: number,
    extra: { readonly retryAfterSeconds?: number; readonly limit?: string } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.retryAfterSeconds = extra.retryAfterSeconds
    this.limit = extra.limit
  }
}

export type Scan = V1Scan
export type ScanStarted = V1ScanStarted

/** The states after which a scan changes no more. */
export const TERMINAL_STATES: readonly Scan['state'][] = ['complete', 'partial', 'failed']

export interface ApiClient {
  startScan(url: string): Promise<ScanStarted>
  getScan(id: string): Promise<Scan>
  /** The report of a finished scan (409 `report_not_ready` while it runs). */
  getReport(id: string): Promise<Report>
  /** Asks for the account's newest scan: a cheap read that says whether the key works. */
  checkKey(): Promise<void>
}

const STATES: readonly string[] = ['queued', 'running', 'complete', 'partial', 'failed']
const CODES: readonly string[] = [
  'invalid_request',
  'invalid_url',
  'blocked_target',
  'unauthorized',
  'plan_limit',
  'not_found',
  'report_not_ready',
  'rate_limited',
  'accounts_off',
  'unavailable',
] satisfies readonly V1ErrorCode[]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function asScan(value: unknown): ScanStarted {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.url !== 'string' ||
    typeof value.state !== 'string' ||
    !STATES.includes(value.state) ||
    !isRecord(value.links) ||
    typeof value.links.page !== 'string' ||
    (value.score !== null && typeof value.score !== 'number')
  ) {
    throw new ApiError(
      'bad_response',
      'The API answered in a shape this client does not know.',
      502,
    )
  }
  return value as unknown as ScanStarted
}

function parseJson(text: string): unknown {
  try {
    return text === '' ? null : (JSON.parse(text) as unknown)
  } catch {
    return null
  }
}

function seconds(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.ceil(n) : undefined
}

export function createApiClient(options: ClientOptions): ApiClient {
  const base = options.baseUrl.replace(/\/+$/, '')

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    let response: Response
    try {
      response = await options.fetcher(`${base}${path}`, {
        method,
        headers: {
          ...options.headers,
          authorization: `Bearer ${options.apiKey}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      })
    } catch {
      throw new ApiError('network', 'Arablyzer could not be reached.', 0)
    }
    const parsed = parseJson(await response.text())
    if (response.ok) return parsed
    const error = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : undefined
    const details = error !== undefined && isRecord(error.details) ? error.details : {}
    const code =
      typeof error?.code === 'string' && CODES.includes(error.code)
        ? (error.code as V1ErrorCode)
        : 'unavailable'
    const retryAfterSeconds =
      seconds(details.retryAfterSeconds) ?? seconds(response.headers.get('retry-after'))
    throw new ApiError(
      code,
      typeof error?.message === 'string' ? error.message : `The API answered ${response.status}.`,
      response.status,
      {
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        ...(typeof details.limit === 'string' ? { limit: details.limit } : {}),
      },
    )
  }

  const data = (answer: unknown): unknown => (isRecord(answer) ? answer.data : undefined)

  return {
    async startScan(url) {
      return asScan(data(await call('POST', '/api/v1/scans', { url })))
    },
    async getScan(id) {
      return asScan(data(await call('GET', `/api/v1/scans/${encodeURIComponent(id)}`)))
    },
    async getReport(id) {
      const report = data(await call('GET', `/api/v1/scans/${encodeURIComponent(id)}/report`))
      if (!isRecord(report) || !Array.isArray(report.findings) || !isRecord(report.score)) {
        throw new ApiError('bad_response', 'The API answered without a report.', 502)
      }
      return report as unknown as Report
    },
    async checkKey() {
      await call('GET', '/api/v1/scans?limit=1')
    },
  }
}

/** A path from the API (`/r/<id>`), or an address already whole, as an address on the site. */
export function absolute(baseUrl: string, link: string): string {
  try {
    return new URL(link, `${baseUrl.replace(/\/+$/, '')}/`).href
  } catch {
    return link
  }
}
