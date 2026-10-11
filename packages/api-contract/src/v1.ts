import { z } from 'zod'
import {
  API_KEY_ID_PATTERN,
  DELETE_TOKEN_PATTERN,
  MAX_API_KEY_NAME,
  MAX_TOOL_SLUG_LENGTH,
  MAX_URL_LENGTH,
  SCAN_ID_PATTERN,
  TOOL_SLUG_PATTERN,
  type ApiKeySummary,
} from './codes'

// The public API (M5.1): everything under /api/v1, authenticated by an API key. Schemas here are
// the one description of it: the routes check against them, the tests parse real answers with
// them, and openapi.ts builds the OpenAPI document from them.

export const API_V1_PATH = '/api/v1'
export const OPENAPI_PATH = `${API_V1_PATH}/openapi.json`

/** The engines a scan may be limited to; the scanner runs those of them it has. */
export const V1_ENGINES = ['chromium', 'firefox', 'webkit'] as const
export type V1Engine = (typeof V1_ENGINES)[number]

export const V1_ERROR_CODES = [
  /** The body, the query or a parameter is not what the route takes. */
  'invalid_request',
  /** The address is not one a scan takes (scheme, length, credentials, port, not a URL). */
  'invalid_url',
  /** The address is a place scans never reach (private, internal, unresolvable). */
  'blocked_target',
  /** No key, a malformed one, an unknown or revoked one. */
  'unauthorized',
  /** The account's plan allows no more of what was asked; `details.limit` says which. */
  'plan_limit',
  'not_found',
  /** The report of a scan that has none yet (queued or running) or never will (failed). */
  'report_not_ready',
  /** A limit was reached; `Retry-After` and `details.retryAfterSeconds` say when to try again. */
  'rate_limited',
  /** Accounts are off in this deployment, so there are no keys and no API. */
  'accounts_off',
  'unavailable',
] as const
export type V1ErrorCode = (typeof V1_ERROR_CODES)[number]

export const V1_ERROR_STATUS: Readonly<
  Record<V1ErrorCode, 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503>
> = {
  invalid_request: 400,
  invalid_url: 400,
  blocked_target: 422,
  unauthorized: 401,
  plan_limit: 403,
  not_found: 404,
  report_not_ready: 409,
  rate_limited: 429,
  accounts_off: 503,
  unavailable: 503,
}

export const V1_PAGE_DEFAULT = 20
export const V1_PAGE_MAX = 100

const iso = () => z.iso.datetime()
const scanId = () => z.string().regex(SCAN_ID_PATTERN)
const toolSlug = () => z.string().max(MAX_TOOL_SLUG_LENGTH).regex(TOOL_SLUG_PATTERN)
const localized = () => z.strictObject({ ar: z.string(), en: z.string() })

const address = () =>
  z
    .string()
    .min(1)
    .max(MAX_URL_LENGTH * 2)
    .meta({ description: 'The page to check: an http or https address, up to 2,048 characters.' })

export const StartScanRequest = z
  .strictObject({
    url: address(),
    engines: z.array(z.enum(V1_ENGINES)).min(1).max(V1_ENGINES.length).optional().meta({
      description:
        'Render in these browser engines only (those the service runs). Left out, the scan renders in all of them. A scan on a chosen subset is a one-off: it is not kept in the account history and never reused.',
    }),
  })
  .meta({ id: 'StartScanRequest' })
export type StartScanRequest = z.infer<typeof StartScanRequest>

export const RunToolRequest = z.strictObject({ url: address() }).meta({ id: 'RunToolRequest' })
export type RunToolRequest = z.infer<typeof RunToolRequest>

export const CreateApiKeyRequest = z.strictObject({
  name: z.string().trim().min(1).max(MAX_API_KEY_NAME),
})
export const ApiKeySchema = z.strictObject({
  id: z.string().regex(API_KEY_ID_PATTERN),
  name: z.string(),
  prefix: z.string(),
  createdAt: iso(),
  lastUsedAt: iso().nullable(),
}) satisfies z.ZodType<ApiKeySummary>

export const V1ScanState = z.enum(['queued', 'running', 'complete', 'partial', 'failed'])

export const V1Scan = z
  .strictObject({
    id: scanId(),
    url: z.string(),
    state: V1ScanState,
    tool: toolSlug().nullable(),
    createdAt: iso(),
    score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .nullable()
      .meta({ description: 'The overall score of a finished whole-page scan; null otherwise.' }),
    links: z.strictObject({
      status: z.string().meta({ description: 'This scan, in the API.' }),
      report: z.string().meta({ description: 'Its report, in the API.' }),
      page: z.string().meta({ description: 'Its report page, for a person.' }),
    }),
  })
  .meta({ id: 'Scan' })
export type V1Scan = z.infer<typeof V1Scan>

export const V1ScanStarted = V1Scan.extend({
  reused: z.boolean().meta({
    description:
      'True when the same page was scanned by this account in the last ten minutes and that scan is returned instead of a new one (no quota is used).',
  }),
  deleteToken: z.string().regex(DELETE_TOKEN_PATTERN).optional().meta({
    description:
      'Only with a new scan, and only here: `DELETE /api/reports/{id}` with this token as the bearer deletes the scan and its report.',
  }),
}).meta({ id: 'ScanStarted' })
export type V1ScanStarted = z.infer<typeof V1ScanStarted>

export const V1Tool = z
  .strictObject({
    slug: toolSlug(),
    kind: z.enum(['scan', 'paste', 'generator']),
    category: z.string(),
    title: localized(),
    summary: localized(),
    rules: z.array(z.string()),
    runnable: z.boolean().meta({
      description:
        'Whether `POST /tools/{slug}/runs` takes it: tools that scan a page. Paste tools and generators run in the visitor’s browser.',
    }),
    updated: z.string(),
  })
  .meta({ id: 'Tool' })
export type V1Tool = z.infer<typeof V1Tool>

export const V1Rule = z
  .strictObject({
    id: z.string(),
    category: z.string(),
    severity: z.enum(['critical', 'serious', 'moderate', 'minor', 'info']),
    wcag: z.array(z.string()).nullable(),
    manualCheck: z.boolean(),
    title: localized(),
  })
  .meta({ id: 'Rule' })
export type V1Rule = z.infer<typeof V1Rule>

const ruleText = () =>
  z.strictObject({
    title: z.string(),
    why: z.string(),
    fix: z.string(),
    detect: z.string(),
    references: z.string(),
    reviewed: z.boolean().nullable().meta({
      description: 'Whether the owner has read this copy (Arabic is reviewed by a person).',
    }),
  })

export const V1RuleDetail = V1Rule.extend({
  copy: z.strictObject({ ar: ruleText(), en: ruleText() }),
}).meta({ id: 'RuleDetail' })
export type V1RuleDetail = z.infer<typeof V1RuleDetail>

/** Query of the list routes. */
export const V1ListQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(V1_PAGE_MAX).optional(),
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,16}$/)
    .optional(),
})
export type V1ListQuery = z.infer<typeof V1ListQuery>

export const V1ListMeta = z
  .strictObject({ nextCursor: z.string().nullable() })
  .meta({ id: 'ListMeta' })

export const V1Error = z
  .strictObject({
    error: z.strictObject({
      code: z.enum(V1_ERROR_CODES),
      message: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .meta({ id: 'Error' })
export type V1Error = z.infer<typeof V1Error>

export const one = <T extends z.ZodType>(schema: T) => z.strictObject({ data: schema })
export const many = <T extends z.ZodType>(schema: T) =>
  z.strictObject({ data: z.array(schema), meta: V1ListMeta })

/** A page's cursor is its offset, in base64url: opaque to a client, cheap for the API. */
export function encodeCursor(offset: number): string {
  return btoa(String(offset)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/** The offset a cursor stands for; null for anything the API did not give. */
export function decodeCursor(cursor: string): number | null {
  try {
    const decoded = atob(cursor.replaceAll('-', '+').replaceAll('_', '/'))
    return /^\d{1,9}$/.test(decoded) ? Number(decoded) : null
  } catch {
    return null
  }
}
