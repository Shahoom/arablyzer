import { z } from 'zod'
import {
  AUTH_ERROR_CODES,
  DELETE_TOKEN_PATTERN,
  MAX_TOOL_SLUG_LENGTH,
  MAX_URL_LENGTH,
  SCAN_ERROR_CODES,
  SCAN_ID_PATTERN,
  TOOL_SLUG_PATTERN,
  type AccountSummary as AccountSummaryShape,
  type AuthErrorResponse as AuthErrorResponseShape,
  type CreateScanRequest as CreateScanRequestShape,
  type CreateScanResponse as CreateScanResponseShape,
  type ScanErrorResponse as ScanErrorResponseShape,
  type ScanEvent as ScanEventShape,
  type ScanSummary as ScanSummaryShape,
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
}) satisfies z.ZodType<AuthErrorResponseShape>
export type AccountSummary = AccountSummaryShape
export type AuthErrorResponse = AuthErrorResponseShape
