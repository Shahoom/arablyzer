import { remotePdf, ScannerUnavailable } from '@arablyzer/scanner-client'
import type { PdfDocument } from '@arablyzer/pdf/model'
import { describe, expect, it, vi } from 'vitest'
import { createScannerApp } from '../src/app'

// M4.7: the scanner draws a PDF on POST /pdf, for the PDF job alone, as it takes a scan: one at a
// time, the process ending after it, a document checked before anything is drawn.

const TOKEN = 'a-token-long-enough-to-be-the-workers-own'
const DOCUMENT: PdfDocument = {
  v: 1,
  lang: 'en',
  kind: 'scan',
  title: 'Report',
  brand: null,
  mark: 'Arablyzer',
  cover: {
    kicker: 'Page audit report',
    heading: 'example.com',
    sub: 'https://example.com/',
    score: 90,
    scoreLabel: 'Overall score',
    scoreNote: 'x',
    facts: [],
  },
  sections: [],
  footer: { line: 'Arablyzer', of: 'of' },
}
const FILE = new Uint8Array([37, 80, 68, 70, 45, 49])

function pair(
  options: { pdf?: (d: PdfDocument) => Promise<Uint8Array>; onBrowserUsed?: () => void } = {},
) {
  const app = createScannerApp({
    token: TOKEN,
    scanner: () => Promise.reject(new Error('no scan here')),
    pdf: options.pdf ?? (() => Promise.resolve(FILE)),
    ...(options.onBrowserUsed === undefined ? {} : { onBrowserUsed: options.onBrowserUsed }),
  })
  const fetcher = (input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(app.request(input as string, init))
  return { app, client: remotePdf('http://scanner:8788', TOKEN, fetcher) }
}
const post = (app: ReturnType<typeof pair>['app'], body: unknown, token = TOKEN) =>
  app.request('/pdf', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /pdf', () => {
  it('draws the document and answers with the file', async () => {
    const { client } = pair()
    expect(Array.from(await client(DOCUMENT))).toEqual(Array.from(FILE))
  })

  it('answers the worker’s token alone, and checks the document before it draws', async () => {
    const pdf = vi.fn(() => Promise.resolve(FILE))
    const { app } = pair({ pdf })
    expect((await post(app, DOCUMENT, 'wrong-token-wrong-token-wrong-token-1')).status).toBe(401)
    expect((await app.request('/pdf', { method: 'POST', body: '{}' })).status).toBe(401)
    expect((await post(app, { ...DOCUMENT, v: 2 })).status).toBe(400)
    expect((await post(app, { ...DOCUMENT, extra: '<script>' })).status).toBe(400)
    expect((await post(app, { ...DOCUMENT, title: 'x'.repeat(400) })).status).toBe(400)
    expect(pdf).not.toHaveBeenCalled()
  })

  it('is not there where no PDF renderer was given', async () => {
    const app = createScannerApp({ token: TOKEN, scanner: () => Promise.reject(new Error('no')) })
    expect((await post(app, DOCUMENT)).status).toBe(404)
  })

  it('takes one at a time, says busy to a second as a scanner that is not there, and ends its process after', async () => {
    let release: (file: Uint8Array) => void = () => undefined
    const onBrowserUsed = vi.fn()
    const { app, client } = pair({
      pdf: () => new Promise<Uint8Array>((resolve) => (release = resolve)),
      onBrowserUsed,
    })
    const first = client(DOCUMENT)
    await vi.waitFor(() => {
      expect(release).not.toBe(undefined)
    })
    await expect(client(DOCUMENT)).rejects.toBeInstanceOf(ScannerUnavailable)
    release(FILE)
    expect(Array.from(await first)).toEqual(Array.from(FILE))
    expect(onBrowserUsed).toHaveBeenCalledTimes(1)
    // The process is on its way out: it takes nothing more, and says so.
    expect((await post(app, DOCUMENT)).status).toBe(503)
    expect((await app.request('/health')).status).toBe(503)
  })

  it('tells a file that is too large from a failure, and the client checks what it is given', async () => {
    const big = pair({ pdf: () => Promise.reject(new Error('too-large')) })
    await expect(big.client(DOCUMENT)).rejects.toThrow('too-large')
    const broken = pair({ pdf: () => Promise.reject(new Error('boom')) })
    await expect(broken.client(DOCUMENT)).rejects.toThrow(/answered 500/)
    const notPdf = pair({ pdf: () => Promise.resolve(new Uint8Array([60, 104, 116, 109, 108])) })
    await expect(notPdf.client(DOCUMENT)).rejects.toThrow(/not a PDF/)
  })
})
