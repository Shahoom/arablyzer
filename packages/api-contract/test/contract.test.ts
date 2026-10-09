import {
  MAX_URL_LENGTH as EGRESS_MAX_URL_LENGTH,
  checkUrl,
  DEFAULT_POLICY,
} from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import {
  AccountPatch,
  AccountSummary,
  AUTH_ERROR_CODES,
  AuthErrorResponse,
  CreateScanRequest,
  CreateScanResponse,
  DELETE_TOKEN_PATTERN,
  DeleteAccountRequest,
  GoogleStartRequest,
  isScanErrorCode,
  MAX_URL_LENGTH,
  OneTapRequest,
  reportPath,
  SCAN_ID_PATTERN,
  ScanErrorResponse,
  TURNSTILE_ACTION,
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
    const token = 'A'.repeat(43)
    expect(
      CreateScanResponse.safeParse({ id: 'AbCdEfGhIjKlMnOpQrSt_-', deleteToken: token }),
    ).toMatchObject({
      success: true,
    })
  })

  // M5, issue #33: the scan's creation is the one time its deletion token is given.
  it('gives the deletion token with the ID, 32 random bytes in base64url, and nothing else', () => {
    const id = 'AbCdEfGhIjKlMnOpQrSt_-'
    const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
    expect(token).toHaveLength(43)
    expect(DELETE_TOKEN_PATTERN.test(token)).toBe(true)
    expect(CreateScanResponse.parse({ id, deleteToken: token })).toEqual({ id, deleteToken: token })
    expect(CreateScanResponse.safeParse({ id }).success).toBe(false)
    expect(CreateScanResponse.safeParse({ id, deleteToken: token, extra: 1 }).success).toBe(false)
    for (const bad of [
      '',
      'x',
      token.slice(1),
      `${token}A`,
      `${token.slice(1)}=`,
      `${token.slice(1)}/`,
    ]) {
      expect(DELETE_TOKEN_PATTERN.test(bad), bad).toBe(false)
      expect(CreateScanResponse.safeParse({ id, deleteToken: bad }).success, bad).toBe(false)
    }
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

describe('the Turnstile action', () => {
  it('is one Cloudflare takes: up to 32 letters, digits, underscores and hyphens', () => {
    expect(TURNSTILE_ACTION).toMatch(/^[A-Za-z0-9_-]{1,32}$/)
  })
})

describe('scan events', () => {
  it('takes every step of a scan, and refuses what is not one', () => {
    const steps: ScanEvent[] = [
      { type: 'queued', ahead: 2 },
      { type: 'started', engines: ['chromium', 'firefox', 'webkit'] },
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
    // The page's host, after its redirects, is a name and nothing else: what the worker counts.
    const reached = { type: 'page', status: 200, contentType: 'text/html', error: null }
    expect(ScanEvent.parse({ ...reached, host: 'www.shop.example' })).toEqual({
      ...reached,
      host: 'www.shop.example',
    })
    expect(ScanEvent.safeParse({ ...reached, host: 'a'.repeat(254) }).success).toBe(false)
    expect(ScanEvent.safeParse({ ...reached, host: '' }).success).toBe(false)
    expect(ScanEvent.safeParse({ ...reached, host: 3 }).success).toBe(false)
    expect(ScanEvent.safeParse({ ...reached, host: null }).success).toBe(false)
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

describe('the accounts contract', () => {
  it('is strict about what the routes take', () => {
    expect(GoogleStartRequest.safeParse({ lang: 'en' }).success).toBe(true)
    expect(GoogleStartRequest.safeParse({ lang: 'fr' }).success).toBe(false)
    expect(
      GoogleStartRequest.safeParse({ lang: 'ar', callbackURL: 'https://evil.example' }).success,
    ).toBe(false)
    expect(AccountPatch.safeParse({ language: 'ar' }).success).toBe(true)
    expect(AccountPatch.safeParse({ language: 'ar', name: 'x' }).success).toBe(false)
    expect(DeleteAccountRequest.safeParse({ confirm: true }).success).toBe(true)
    expect(DeleteAccountRequest.safeParse({ confirm: false }).success).toBe(false)
    expect(DeleteAccountRequest.safeParse({}).success).toBe(false)
  })

  it('takes a JWT-shaped credential of bounded size and nothing else', () => {
    expect(OneTapRequest.safeParse({ credential: 'aaa.bbb.ccc' }).success).toBe(true)
    expect(OneTapRequest.safeParse({ credential: 'not a token' }).success).toBe(false)
    expect(OneTapRequest.safeParse({ credential: `${'a'.repeat(4100)}.b.c` }).success).toBe(false)
    expect(OneTapRequest.safeParse({ credential: 'a.b.c', lang: 'ar' }).success).toBe(false)
  })

  it('describes an account and an error', () => {
    const account = {
      id: 'u1',
      email: 'ali@example.com',
      name: 'Ali',
      language: null,
      createdAt: '2026-10-01T00:00:00.000Z',
    }
    expect(AccountSummary.safeParse(account).success).toBe(true)
    expect(AccountSummary.safeParse({ ...account, extra: 1 }).success).toBe(false)
    for (const error of AUTH_ERROR_CODES) {
      expect(AuthErrorResponse.safeParse({ error }).success).toBe(true)
    }
    expect(AuthErrorResponse.safeParse({ error: 'oops' }).success).toBe(false)
  })
})
