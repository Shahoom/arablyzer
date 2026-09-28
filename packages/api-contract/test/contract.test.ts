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
  reportPath,
  SCAN_ID_PATTERN,
  ScanErrorResponse,
  ScanEvent,
  scanEventsPath,
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

describe('scan events', () => {
  it('takes every step of a scan, and refuses what is not one', () => {
    const steps: ScanEvent[] = [
      { type: 'queued', ahead: 2 },
      { type: 'started' },
      { type: 'page', status: 200, contentType: 'text/html', error: null },
      { type: 'robots', outcome: 'fetched', status: 200 },
      { type: 'crux', outcome: 'skipped' },
      { type: 'render-start', engine: 'webkit' },
      {
        type: 'render',
        engine: 'webkit',
        version: '26.6',
        status: 'rendered',
        requests: { total: 1, refused: 0 },
      },
      { type: 'rules', rules: 47 },
      { type: 'done', state: 'complete' },
    ]
    for (const step of steps) expect(ScanEvent.parse(step)).toEqual(step)
    expect(ScanEvent.safeParse({ type: 'done', state: 'complete', extra: 1 }).success).toBe(false)
    expect(ScanEvent.safeParse({ type: 'render-start', engine: 'netscape' }).success).toBe(false)
    expect(
      ScanEvent.safeParse({ type: 'page', status: 42, contentType: null, error: null }).success,
    ).toBe(false)
  })

  it('names the paths the site reads', () => {
    expect(scanEventsPath('AbCdEfGhIjKlMnOpQrSt_-')).toBe(
      '/api/scans/AbCdEfGhIjKlMnOpQrSt_-/events',
    )
    expect(reportPath('AbCdEfGhIjKlMnOpQrSt_-')).toBe('/api/reports/AbCdEfGhIjKlMnOpQrSt_-')
  })
})
