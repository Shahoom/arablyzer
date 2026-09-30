import {
  isScanErrorCode,
  MAX_URL_LENGTH,
  SCAN_ID_PATTERN,
  type ScanErrorCode,
} from '@arablyzer/api-contract/codes'
import type { FormProblem } from '@arablyzer/i18n/scan-form'

export interface FormError {
  readonly code: ScanErrorCode | FormProblem
  readonly retryAfterSeconds?: number
}

export type Precheck =
  { readonly ok: true; readonly url: string } | { readonly ok: false; readonly error: FormError }

/**
 * The address a link asks the form to start with: `?url=`, from a report's "Scan again". Only
 * shown in the field; the scan starts when the visitor sends the form, checked as any other.
 */
export function askedUrl(search: string): string | null {
  const asked = new URLSearchParams(search).get('url')
  return asked === null || asked.trim() === '' || asked.length > MAX_URL_LENGTH ? null : asked
}

/**
 * What the browser can check before sending: the egress package's first checks, without DNS.
 * A link pasted without its scheme gets https://, as a browser's address bar would. The API
 * checks everything again (M2.1 plan §2).
 */
export function precheck(input: string): Precheck {
  const raw = input.trim()
  if (raw === '') return fail('empty')
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  if (withScheme.length > MAX_URL_LENGTH) return fail('url-too-long')
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return fail('invalid-url')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail('unsupported-scheme')
  if (url.hostname === '') return fail('invalid-url')
  if (url.username !== '' || url.password !== '') return fail('credentials-in-url')
  if (url.href.length > MAX_URL_LENGTH) return fail('url-too-long')
  return { ok: true, url: url.href }
}

function fail(code: FormError['code']): Precheck {
  return { ok: false, error: { code } }
}

export type ScanStart =
  { readonly ok: true; readonly id: string } | { readonly ok: false; readonly error: FormError }

/**
 * Reads the API's answer to `POST /api/scans`: 202 with the scan's ID, or a refusal with its
 * code. Anything else, such as a proxy's error page, means the service is unavailable.
 */
export async function readScanStart(response: Response): Promise<ScanStart> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, error: { code: 'unavailable' } }
  }
  if (typeof body !== 'object' || body === null)
    return { ok: false, error: { code: 'unavailable' } }
  const record = body as Record<string, unknown>
  if (response.status === 202 && typeof record.id === 'string' && SCAN_ID_PATTERN.test(record.id)) {
    return { ok: true, id: record.id }
  }
  if (!response.ok && isScanErrorCode(record.error)) {
    const retry = record.retryAfterSeconds
    return {
      ok: false,
      error:
        typeof retry === 'number' && Number.isInteger(retry) && retry > 0
          ? { code: record.error, retryAfterSeconds: retry }
          : { code: record.error },
    }
  }
  return { ok: false, error: { code: 'unavailable' } }
}
