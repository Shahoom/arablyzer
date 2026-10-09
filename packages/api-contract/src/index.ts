import { z } from 'zod'
import {
  AUTH_ERROR_CODES,
  DELETE_TOKEN_PATTERN,
  DROP_THRESHOLD_MAX,
  DROP_THRESHOLD_MIN,
  MAX_TOOL_SLUG_LENGTH,
  MAX_WEBHOOK_URL_LENGTH,
  MAX_URL_LENGTH,
  PLAN_LIMITS,
  SCAN_ERROR_CODES,
  SCAN_ID_PATTERN,
  SITE_ID_PATTERN,
  TOOL_SLUG_PATTERN,
  WEBHOOK_KINDS,
  type AccountScan as AccountScanShape,
  type AccountScansResponse as AccountScansResponseShape,
  type AccountSummary as AccountSummaryShape,
  type AlertSettings as AlertSettingsShape,
  type AlertsResponse as AlertsResponseShape,
  type AuthErrorResponse as AuthErrorResponseShape,
  type CreateScanRequest as CreateScanRequestShape,
  type CreateScanResponse as CreateScanResponseShape,
  type MonitorPoint as MonitorPointShape,
  type MonitorResponse as MonitorResponseShape,
  type MonitorSummary as MonitorSummaryShape,
  type ScanErrorResponse as ScanErrorResponseShape,
  type ScanEvent as ScanEventShape,
  type ScanSummary as ScanSummaryShape,
  type SiteSummary as SiteSummaryShape,
  type SitesResponse as SitesResponseShape,
  type WebhookTestResponse as WebhookTestResponseShape,
} from './codes'

export * from './codes'

// Each schema below shares its name with the plain type it checks, so either can be imported.
export type CreateScanRequest = CreateScanRequestShape
export type CreateScanResponse = CreateScanResponseShape
export type ScanErrorResponse = ScanErrorResponseShape
export type ScanEvent = ScanEventShape
export type ScanSummary = ScanSummaryShape

/** Turnstile's tokens are at most 2,048 characters (Cloudflare's server-side validation docs). */
const TURNSTILE_TOKEN_MAX = 2048

function toolSlug() {
  return z.string().max(MAX_TOOL_SLUG_LENGTH).regex(TOOL_SLUG_PATTERN)
}

/**
 * The URL is checked by the egress package after this, which gives the precise reason; here it
 * only has to be a string of a size worth checking.
 */
export const CreateScanRequest = z.strictObject({
  url: z
    .string()
    .min(1)
    .max(MAX_URL_LENGTH * 2),
  turnstileToken: z.string().max(TURNSTILE_TOKEN_MAX),
  tool: toolSlug().optional(),
}) satisfies z.ZodType<CreateScanRequestShape>

export const CreateScanResponse = z.strictObject({
  id: z.string().regex(SCAN_ID_PATTERN),
  deleteToken: z.string().regex(DELETE_TOKEN_PATTERN),
}) satisfies z.ZodType<CreateScanResponseShape>

export const ScanErrorResponse = z.strictObject({
  error: z.enum(SCAN_ERROR_CODES),
  retryAfterSeconds: z.number().int().positive().optional(),
}) satisfies z.ZodType<ScanErrorResponseShape>

const engine = z.enum(['chromium', 'firefox', 'webkit'])
const status = z.number().int().min(100).max(599).nullable()

/** The events a scan's stream carries; the API checks each before it stores it. */
export const ScanEvent = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('queued'), ahead: z.number().int().min(0) }),
  z.strictObject({ type: z.literal('started'), engines: z.array(engine).max(3) }),
  z.strictObject({
    type: z.literal('page'),
    status,
    contentType: z.string().max(256).nullable(),
    error: z.string().max(64).nullable(),
    // A DNS name is at most 253 characters (RFC 1035).
    host: z.string().min(1).max(253).optional(),
  }),
  z.strictObject({
    type: z.literal('robots'),
    outcome: z.enum(['fetched', 'unavailable', 'unreachable', 'failed']),
    status,
  }),
  z.strictObject({
    type: z.literal('crux'),
    outcome: z.enum(['found', 'not-found', 'failed', 'skipped']),
  }),
  z.strictObject({ type: z.literal('render-start'), engine }),
  z.strictObject({
    type: z.literal('render'),
    engine,
    version: z.string().max(64).nullable(),
    status: z.enum(['rendered', 'failed', 'timeout', 'unavailable', 'refused']),
    requests: z.strictObject({
      total: z.number().int().min(0),
      refused: z.number().int().min(0),
    }),
  }),
  z.strictObject({ type: z.literal('lab-start') }),
  z.strictObject({
    type: z.literal('lab'),
    status: z.enum(['measured', 'failed', 'timeout', 'unavailable', 'skipped']),
  }),
  z.strictObject({ type: z.literal('rules'), rules: z.number().int().min(0) }),
  z.strictObject({ type: z.literal('done'), state: z.enum(['complete', 'partial', 'failed']) }),
  z.strictObject({ type: z.literal('error') }),
]) satisfies z.ZodType<ScanEventShape>

export const ScanSummary = z.strictObject({
  id: z.string().regex(SCAN_ID_PATTERN),
  url: z.string(),
  state: z.enum(['queued', 'running', 'complete', 'partial', 'failed']),
  createdAt: z.iso.datetime(),
  tool: toolSlug().optional(),
}) satisfies z.ZodType<ScanSummaryShape>

const language = z.enum(['ar', 'en'])

/** A Google ID token is a JWT of a few hundred characters; 4,096 is generous and bounded. */
const CREDENTIAL_MAX = 4096

export const GoogleStartRequest = z.strictObject({ lang: language })
export const OneTapRequest = z.strictObject({
  credential: z
    .string()
    .min(1)
    .max(CREDENTIAL_MAX)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
})
export const AccountPatch = z.strictObject({ language })
/** The page has asked the person to confirm: erasure is not undone. */
export const DeleteAccountRequest = z.strictObject({ confirm: z.literal(true) })
export const AccountSummary = z.strictObject({
  id: z.string().min(1),
  email: z.string().min(1),
  name: z.string(),
  language: language.nullable(),
  createdAt: z.iso.datetime(),
}) satisfies z.ZodType<AccountSummaryShape>
export const AuthErrorResponse = z.strictObject({
  error: z.enum(AUTH_ERROR_CODES),
  retryAfterSeconds: z.number().int().min(1).optional(),
  limit: z.enum(PLAN_LIMITS).optional(),
  plan: z.string().min(1).optional(),
}) satisfies z.ZodType<AuthErrorResponseShape>
export type AccountSummary = AccountSummaryShape
export type AuthErrorResponse = AuthErrorResponseShape

/** A site to save: checked as a scan's address is, by the egress package, after this. */
export const AddSiteRequest = z.strictObject({
  url: z
    .string()
    .min(1)
    .max(MAX_URL_LENGTH * 2),
})
export const AccountScan = z.strictObject({
  id: z.string().regex(SCAN_ID_PATTERN),
  url: z.string(),
  state: z.enum(['queued', 'running', 'complete', 'partial', 'failed']),
  score: z.number().int().min(0).max(100).nullable(),
  createdAt: z.iso.datetime(),
  siteId: z.string().regex(SITE_ID_PATTERN).nullable(),
}) satisfies z.ZodType<AccountScanShape>
export const MonitorPoint = z.strictObject({
  scanId: z.string().regex(SCAN_ID_PATTERN),
  state: z.enum(['queued', 'running', 'complete', 'partial', 'failed']),
  score: z.number().int().min(0).max(100).nullable(),
  at: z.iso.datetime(),
}) satisfies z.ZodType<MonitorPointShape>
export const MonitorSummary = z.strictObject({
  everyDays: z.number().int().min(1),
  paused: z.boolean(),
  nextRunAt: z.iso.datetime(),
  failures: z.number().int().min(0),
  trend: z.array(MonitorPoint),
}) satisfies z.ZodType<MonitorSummaryShape>
export const SiteSummary = z.strictObject({
  id: z.string().regex(SITE_ID_PATTERN),
  url: z.string(),
  createdAt: z.iso.datetime(),
  lastScan: AccountScan.nullable(),
  monitor: MonitorSummary.nullable(),
}) satisfies z.ZodType<SiteSummaryShape>
export const SitesResponse = z.strictObject({
  sites: z.array(SiteSummary),
  limit: z.number().int().min(1),
  monitoring: z.strictObject({
    limit: z.number().int().min(1),
    everyDays: z.number().int().min(1),
  }),
}) satisfies z.ZodType<SitesResponseShape>

export const MonitorResponse = z.strictObject({
  monitor: MonitorSummary.nullable(),
}) satisfies z.ZodType<MonitorResponseShape>
export type MonitorResponse = MonitorResponseShape

/** Turn a saved site's monitoring on or off. */
export const MonitorRequest = z.strictObject({ enabled: z.boolean() })

const dropThreshold = z.number().int().min(DROP_THRESHOLD_MIN).max(DROP_THRESHOLD_MAX)
/** A webhook's address as typed: checked as an address, then by the egress rules, after this. */
const webhookUrl = z.string().min(1).max(MAX_WEBHOOK_URL_LENGTH)
/** Every field is optional: what is not sent is not changed. A null address removes the webhook. */
export const AlertsRequest = z.strictObject({
  webhookUrl: webhookUrl.nullable().optional(),
  rotateSecret: z.boolean().optional(),
  dropThreshold: dropThreshold.optional(),
  onCritical: z.boolean().optional(),
  onDown: z.boolean().optional(),
  weeklySummary: z.boolean().optional(),
  email: z.boolean().optional(),
})
export type AlertsRequest = z.infer<typeof AlertsRequest>
export const AlertSettings = z.strictObject({
  webhook: z
    .strictObject({
      host: z.string().min(1),
      kind: z.enum(WEBHOOK_KINDS),
      failures: z.number().int().min(0),
      disabled: z.boolean(),
    })
    .nullable(),
  dropThreshold,
  onCritical: z.boolean(),
  onDown: z.boolean(),
  weeklySummary: z.boolean(),
  email: z.strictObject({ available: z.boolean(), enabled: z.boolean() }),
}) satisfies z.ZodType<AlertSettingsShape>
export const AlertsResponse = AlertSettings.extend({
  secret: z.string().min(1).optional(),
}) satisfies z.ZodType<AlertsResponseShape>
export const WebhookTestResponse = z.strictObject({
  ok: z.boolean(),
  status: z.number().int().nullable(),
}) satisfies z.ZodType<WebhookTestResponseShape>
export const AccountScansResponse = z.strictObject({
  scans: z.array(AccountScan),
  historyDays: z.number().int().min(1),
}) satisfies z.ZodType<AccountScansResponseShape>
export type AccountScan = AccountScanShape
export type AccountScansResponse = AccountScansResponseShape
export type SiteSummary = SiteSummaryShape
export type SitesResponse = SitesResponseShape
export type MonitorPoint = MonitorPointShape
export type MonitorSummary = MonitorSummaryShape
export type AlertSettings = AlertSettingsShape
export type AlertsResponse = AlertsResponseShape
export type WebhookTestResponse = WebhookTestResponseShape
