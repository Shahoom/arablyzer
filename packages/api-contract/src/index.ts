import { z } from 'zod'
import {
  MAX_TOOL_SLUG_LENGTH,
  MAX_URL_LENGTH,
  SCAN_ERROR_CODES,
  SCAN_ID_PATTERN,
  TOOL_SLUG_PATTERN,
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

/**
 * The URL is checked by the egress package after this, which gives the precise reason; here it
 * only has to be a string of a size worth checking.
 */
function toolSlug() {
  return z.string().max(MAX_TOOL_SLUG_LENGTH).regex(TOOL_SLUG_PATTERN)
}

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
