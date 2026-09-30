import { z } from 'zod'
import {
  MAX_URL_LENGTH,
  SCAN_ERROR_CODES,
  SCAN_ID_PATTERN,
  type CreateScanRequest as CreateScanRequestShape,
  type CreateScanResponse as CreateScanResponseShape,
  type ScanErrorResponse as ScanErrorResponseShape,
} from './codes'

export * from './codes'

/** Turnstile's tokens are at most 2,048 characters (Cloudflare's server-side validation docs). */
const TURNSTILE_TOKEN_MAX = 2048

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
}) satisfies z.ZodType<CreateScanRequestShape>

export const CreateScanResponse = z.strictObject({
  id: z.string().regex(SCAN_ID_PATTERN),
}) satisfies z.ZodType<CreateScanResponseShape>

export const ScanErrorResponse = z.strictObject({
  error: z.enum(SCAN_ERROR_CODES),
  retryAfterSeconds: z.number().int().positive().optional(),
}) satisfies z.ZodType<ScanErrorResponseShape>
