import {
  MAX_URL_LENGTH as EGRESS_MAX_URL_LENGTH,
  checkUrl,
  DEFAULT_POLICY,
} from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import {
  CreateScanRequest,
  CreateScanResponse,
  isScanErrorCode,
  MAX_URL_LENGTH,
  SCAN_ID_PATTERN,
  ScanErrorResponse,
  URL_ERROR_CODES,
} from '../src/index'

describe('the scan contract', () => {
  it('limits URLs as the egress package does', () => {
    expect(MAX_URL_LENGTH).toBe(EGRESS_MAX_URL_LENGTH)
  })

  it('names only URL errors the egress package gives before connecting', () => {
    const refusals = [
      'not a url',
      'ftp://example.com/',
      `https://example.com/${'a'.repeat(MAX_URL_LENGTH)}`,
      'https://user:secret@example.com/',
      'https://example.com:8443/',
      'http://localhost/',
    ].map((input) => {
      const check = checkUrl(input, DEFAULT_POLICY)
      return check.ok ? null : check.error.code
    })
    expect(refusals).toEqual([
      'invalid-url',
      'unsupported-scheme',
      'url-too-long',
      'credentials-in-url',
      'port-not-allowed',
      'blocked-host',
    ])
    for (const code of refusals) expect(URL_ERROR_CODES).toContain(code)
  })

  it('takes a URL and a Turnstile token, and nothing else', () => {
    const body = { url: 'https://example.com/', turnstileToken: 'token' }
    expect(CreateScanRequest.parse(body)).toEqual(body)
    expect(CreateScanRequest.safeParse({ ...body, admin: true }).success).toBe(false)
    expect(CreateScanRequest.safeParse({ url: '', turnstileToken: 'token' }).success).toBe(false)
    expect(
      CreateScanRequest.safeParse({ url: 'https://example.com/', turnstileToken: 'x'.repeat(2049) })
        .success,
    ).toBe(false)
  })

  it('answers with an unguessable ID', () => {
    expect(SCAN_ID_PATTERN.test('AbCdEfGhIjKlMnOpQrSt_-')).toBe(true)
    expect(SCAN_ID_PATTERN.test('1')).toBe(false)
    expect(SCAN_ID_PATTERN.test('../../etc/passwd000000')).toBe(false)
    expect(CreateScanResponse.safeParse({ id: 'AbCdEfGhIjKlMnOpQrSt_-' }).success).toBe(true)
  })

  it('refuses with a known code', () => {
    expect(ScanErrorResponse.parse({ error: 'rate-limited', retryAfterSeconds: 60 })).toEqual({
      error: 'rate-limited',
      retryAfterSeconds: 60,
    })
    expect(ScanErrorResponse.safeParse({ error: 'teapot' }).success).toBe(false)
    expect(isScanErrorCode('blocked-address')).toBe(true)
    expect(isScanErrorCode('teapot')).toBe(false)
    expect(isScanErrorCode(1)).toBe(false)
  })
})
