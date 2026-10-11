import {
  many,
  one,
  V1Error,
  V1Rule,
  V1RuleDetail,
  V1Scan,
  V1ScanStarted,
  V1Tool,
  type V1Engine,
} from '@arablyzer/api-contract'
import type { Report } from '@arablyzer/report-schema'
import type { z } from 'zod'

/** Anything shaped like `fetch`: the global one over the network, or an app's own `fetch` in process. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

export interface ApiClientOptions {
  /** Where the API is: the site's origin. */
  readonly baseUrl: string
  /** An API key, `arb_…`. */
  readonly apiKey: string
  readonly fetcher: Fetcher
  /** Sent with every request, such as the address of the caller behind a proxy. */
  readonly headers?: Readonly<Record<string, string>>
}

/** What the API refused, with its own code (`rate_limited`, `plan_limit`, …). */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details: Readonly<Record<string, unknown>> | undefined
  constructor(
    code: string,
    message: string,
    status: number,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export type Scan = z.infer<typeof V1Scan>
export type ScanStarted = z.infer<typeof V1ScanStarted>
export type Tool = z.infer<typeof V1Tool>
export type Rule = z.infer<typeof V1Rule>
export type RuleDetail = z.infer<typeof V1RuleDetail>
export interface Page<T> {
  readonly data: readonly T[]
  readonly nextCursor: string | null
}

/** The public API (/api/v1) as the MCP server uses it: the only way it reaches a scan. */
export interface ApiClient {
  startScan(url: string, engines?: readonly V1Engine[]): Promise<ScanStarted>
  getScan(id: string): Promise<Scan>
  getReport(id: string): Promise<Report>
  listTools(limit?: number, cursor?: string): Promise<Page<Tool>>
  runTool(slug: string, url: string): Promise<ScanStarted>
  listRules(limit?: number, cursor?: string): Promise<Page<Rule>>
  getRule(id: string): Promise<RuleDetail>
}

export function createApiClient(options: ApiClientOptions): ApiClient {
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
      })
    } catch {
      throw new ApiError('unavailable', 'The Arablyzer API could not be reached.', 503)
    }
    const text = await response.text()
    let parsed: unknown = null
    try {
      parsed = text === '' ? null : JSON.parse(text)
    } catch {
      parsed = null
    }
    if (!response.ok) {
      const failure = V1Error.safeParse(parsed)
      if (failure.success) {
        const { code, message, details } = failure.data.error
        throw new ApiError(code, message, response.status, details)
      }
      throw new ApiError(
        'unavailable',
        `The API answered ${String(response.status)}.`,
        response.status,
      )
    }
    return parsed
  }

  const read = <T extends z.ZodType>(schema: T, value: unknown): z.infer<T> => {
    const parsed = schema.safeParse(value)
    if (!parsed.success)
      throw new ApiError(
        'unavailable',
        'The API answered in a shape this client does not know.',
        502,
      )
    return parsed.data as z.infer<T>
  }
  const query = (limit?: number, cursor?: string) => {
    const parts = [
      ...(limit === undefined ? [] : [`limit=${String(limit)}`]),
      ...(cursor === undefined ? [] : [`cursor=${encodeURIComponent(cursor)}`]),
    ]
    return parts.length === 0 ? '' : `?${parts.join('&')}`
  }
  const pageOf = <T extends z.ZodType>(schema: T, value: unknown): Page<z.infer<T>> => {
    const page = read(many(schema), value) as {
      data: z.infer<T>[]
      meta: { nextCursor: string | null }
    }
    return { data: page.data, nextCursor: page.meta.nextCursor }
  }

  return {
    async startScan(url, engines) {
      const body = { url, ...(engines === undefined ? {} : { engines }) }
      return read(one(V1ScanStarted), await call('POST', '/api/v1/scans', body)).data
    },
    async getScan(id) {
      return read(one(V1Scan), await call('GET', `/api/v1/scans/${encodeURIComponent(id)}`)).data
    },
    async getReport(id) {
      const answer = await call('GET', `/api/v1/scans/${encodeURIComponent(id)}/report`)
      const report = (answer as { data?: unknown } | null)?.data
      if (typeof report !== 'object' || report === null) {
        throw new ApiError('unavailable', 'The API answered without a report.', 502)
      }
      return report as Report
    },
    async listTools(limit, cursor) {
      return pageOf(V1Tool, await call('GET', `/api/v1/tools${query(limit, cursor)}`))
    },
    async runTool(slug, url) {
      return read(
        one(V1ScanStarted),
        await call('POST', `/api/v1/tools/${encodeURIComponent(slug)}/runs`, { url }),
      ).data
    },
    async listRules(limit, cursor) {
      return pageOf(V1Rule, await call('GET', `/api/v1/rules${query(limit, cursor)}`))
    },
    async getRule(id) {
      return read(one(V1RuleDetail), await call('GET', `/api/v1/rules/${encodeURIComponent(id)}`))
        .data
    },
  }
}
