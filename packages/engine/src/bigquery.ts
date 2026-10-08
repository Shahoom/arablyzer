import { createSign } from 'node:crypto'
import { json, text, type Ask } from './outside-http'

/**
 * A BigQuery client over its REST API (docs/design/plans/arabic-native.md §14): a service
 * account's JSON key signs a JWT, which Google's OAuth endpoint exchanges for a token, and queries
 * go to `jobs.query`. Every call goes through the scan's egress rules (`Ask`). No library: the
 * calls are three.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/bigquery'
const QUERY_TIMEOUT_MS = 45_000

export interface BigQueryCredentials {
  readonly clientEmail: string
  readonly privateKey: string
}

/** The service account's JSON key as ARABLYZER_BIGQUERY_CREDENTIALS gives it: JSON, or base64 of it. */
export function parseCredentials(value: string): BigQueryCredentials | null {
  const raw = value.trim()
  const attempts = [raw, Buffer.from(raw, 'base64').toString('utf8')]
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt) as { client_email?: unknown; private_key?: unknown }
      if (typeof parsed.client_email === 'string' && typeof parsed.private_key === 'string') {
        return { clientEmail: parsed.client_email, privateKey: parsed.private_key }
      }
    } catch {
      // Try the next reading.
    }
  }
  return null
}

const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url')

/** The signed assertion Google's OAuth endpoint trades for a token (RFC 7523). */
export function signAssertion(credentials: BigQueryCredentials, nowSeconds: number): string {
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  return `${header}.${claims}.${signer.sign(credentials.privateKey, 'base64url')}`
}

export interface QueryParameter {
  readonly name: string
  readonly value: string
}

export interface QueryOptions {
  /** `maximumBytesBilled`: BigQuery fails the query, at no charge, if it would bill more. */
  readonly maximumBytesBilled: number
  readonly dryRun?: boolean
}

export interface QueryResult {
  /** Each row by column name, values as BigQuery's JSON gives them (strings). */
  readonly rows: readonly Record<string, string | null>[]
  readonly bytesProcessed: number
  readonly bytesBilled: number
  readonly cacheHit: boolean
}

/** What the crux-countries collector needs of BigQuery; tests give a stand-in. */
export interface BigQueryClient {
  query(
    sql: string,
    parameters: readonly QueryParameter[],
    options: QueryOptions,
  ): Promise<QueryResult | null>
}

interface TokenEntry {
  readonly token: string
  readonly until: number
}
const tokens = new Map<string, TokenEntry>()

/** Forgets the tokens kept (for tests). */
export function clearTokens(): void {
  tokens.clear()
}

export interface HttpClientOptions {
  readonly ask: Ask
  readonly credentials: BigQueryCredentials
  readonly project: string
  readonly signal?: AbortSignal
  readonly now?: () => number
}

async function tokenFor(options: HttpClientOptions): Promise<string | null> {
  const now = (options.now ?? Date.now)()
  const cached = tokens.get(options.credentials.clientEmail)
  if (cached !== undefined && cached.until > now) return cached.token
  const response = await options.ask({
    url: TOKEN_URL,
    form: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signAssertion(options.credentials, Math.floor(now / 1000)),
    },
    accept: 'application/json',
    timeoutMs: 15_000,
    maxBytes: 64 * 1024,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })
  const body = json(response) as { access_token?: unknown; expires_in?: unknown } | null
  if (response?.status !== 200 || typeof body?.access_token !== 'string') return null
  const seconds = typeof body.expires_in === 'number' ? body.expires_in : 3600
  tokens.set(options.credentials.clientEmail, {
    token: body.access_token,
    until: now + Math.max(0, seconds - 120) * 1000,
  })
  return body.access_token
}

interface QueryResponse {
  readonly jobComplete?: boolean
  readonly schema?: { readonly fields?: readonly { readonly name: string }[] }
  readonly rows?: readonly { readonly f: readonly { readonly v: string | null }[] }[]
  readonly totalBytesProcessed?: string
  readonly totalBytesBilled?: string
  readonly cacheHit?: boolean
}

/** BigQuery's `jobs.query` over REST, with named parameters and the bytes-billed cap. */
export function httpClient(options: HttpClientOptions): BigQueryClient {
  return {
    async query(sql, parameters, { maximumBytesBilled, dryRun }) {
      const token = await tokenFor(options)
      if (token === null) return null
      const response = await options.ask({
        url: `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(options.project)}/queries`,
        headers: { authorization: `Bearer ${token}` },
        json: {
          query: sql,
          useLegacySql: false,
          useQueryCache: true,
          dryRun: dryRun === true,
          maximumBytesBilled: String(maximumBytesBilled),
          timeoutMs: QUERY_TIMEOUT_MS,
          parameterMode: 'NAMED',
          queryParameters: parameters.map((parameter) => ({
            name: parameter.name,
            parameterType: { type: 'STRING' },
            parameterValue: { value: parameter.value },
          })),
        },
        accept: 'application/json',
        timeoutMs: QUERY_TIMEOUT_MS + 10_000,
        maxBytes: 1024 * 1024,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
      if (response?.status !== 200) return null
      let body: QueryResponse
      try {
        body = JSON.parse(text(response)) as QueryResponse
      } catch {
        return null
      }
      if (dryRun !== true && body.jobComplete !== true) return null
      const names = body.schema?.fields?.map((field) => field.name) ?? []
      return {
        rows: (body.rows ?? []).map((row) =>
          Object.fromEntries(names.map((name, index) => [name, row.f[index]?.v ?? null])),
        ),
        bytesProcessed: Number(body.totalBytesProcessed ?? 0),
        bytesBilled: Number(body.totalBytesBilled ?? 0),
        cacheHit: body.cacheHit === true,
      }
    },
  }
}
