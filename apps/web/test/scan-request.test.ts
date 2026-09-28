import { describe, expect, it } from 'vitest'
import { startScan } from '../src/islands/api'
import { askedUrl, precheck, readScanStart } from '../src/islands/scan-request'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('precheck', () => {
  it('accepts http and https pages, and adds https:// to a bare domain', () => {
    expect(precheck(' https://example.com/page ')).toEqual({
      ok: true,
      url: 'https://example.com/page',
    })
    expect(precheck('example.com')).toEqual({ ok: true, url: 'https://example.com/' })
    expect(precheck('http://example.com')).toEqual({ ok: true, url: 'http://example.com/' })
  })

  it('refuses what the API would refuse before any DNS', () => {
    const code = (input: string) => {
      const checked = precheck(input)
      return checked.ok ? null : checked.error.code
    }
    expect(code('   ')).toBe('empty')
    expect(code('ftp://example.com/')).toBe('unsupported-scheme')
    expect(code('javascript:alert(1)')).toBe('unsupported-scheme')
    expect(code('https://user:pass@example.com/')).toBe('credentials-in-url')
    expect(code(`https://example.com/${'a'.repeat(2048)}`)).toBe('url-too-long')
    expect(code('https://exa mple.com')).toBe('invalid-url')
  })
})

describe('readScanStart', () => {
  it('takes the scan ID from a 202', async () => {
    expect(await readScanStart(json(202, { id: 'AbCdEfGhIjKlMnOpQrSt_-' }))).toEqual({
      ok: true,
      id: 'AbCdEfGhIjKlMnOpQrSt_-',
    })
  })

  it('never follows an ID that is not one', async () => {
    expect(await readScanStart(json(202, { id: '../../admin' }))).toEqual({
      ok: false,
      error: { code: 'unavailable' },
    })
  })

  it('reads a refusal and when to try again', async () => {
    expect(
      await readScanStart(json(429, { error: 'rate-limited', retryAfterSeconds: 120 })),
    ).toEqual({
      ok: false,
      error: { code: 'rate-limited', retryAfterSeconds: 120 },
    })
    expect(await readScanStart(json(422, { error: 'blocked-address' }))).toEqual({
      ok: false,
      error: { code: 'blocked-address' },
    })
  })

  it('treats anything else as the service being unavailable', async () => {
    expect(await readScanStart(new Response('<h1>502</h1>', { status: 502 }))).toEqual({
      ok: false,
      error: { code: 'unavailable' },
    })
    expect(await readScanStart(json(400, { error: 'teapot' }))).toEqual({
      ok: false,
      error: { code: 'unavailable' },
    })
  })
})

describe('startScan', () => {
  it('posts the URL and the token as JSON, without cookies', async () => {
    let seen: { url: string; init: RequestInit | undefined } | undefined
    const send = (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: url instanceof Request ? url.url : url.toString(), init }
      return Promise.resolve(json(202, { id: 'AbCdEfGhIjKlMnOpQrSt_-' }))
    }
    const started = await startScan({ url: 'https://example.com/', turnstileToken: 't' }, send)
    expect(started).toEqual({ ok: true, id: 'AbCdEfGhIjKlMnOpQrSt_-' })
    expect(seen?.url).toBe('/api/scans')
    expect(seen?.init?.method).toBe('POST')
    expect(seen?.init?.credentials).toBe('omit')
    const body = seen?.init?.body
    expect(typeof body).toBe('string')
    expect(JSON.parse(body as string)).toEqual({
      url: 'https://example.com/',
      turnstileToken: 't',
    })
  })

  it('says the network failed when the request never reached the API', async () => {
    const send = () => Promise.reject(new TypeError('Failed to fetch'))
    expect(await startScan({ url: 'https://example.com/', turnstileToken: '' }, send)).toEqual({
      ok: false,
      error: { code: 'network' },
    })
  })
})

describe('askedUrl', () => {
  it('reads the address a report\'s "Scan again" link carries', () => {
    const link = `?url=${encodeURIComponent('https://example.com/a?b=1&c=2')}`
    expect(askedUrl(link)).toBe('https://example.com/a?b=1&c=2')
  })

  it('ignores a missing, empty or overlong address', () => {
    expect(askedUrl('')).toBeNull()
    expect(askedUrl('?other=1')).toBeNull()
    expect(askedUrl('?url=%20')).toBeNull()
    expect(askedUrl(`?url=https://example.com/${'a'.repeat(2048)}`)).toBeNull()
  })
})
