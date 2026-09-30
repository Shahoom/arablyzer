import type { Response } from 'playwright-core'
import { describe, expect, it, vi } from 'vitest'
import { readBody, type TimedSize } from '../../src/files'

const URL = 'http://site.test/app.js'

/** A response as Playwright hands it, with `received` body bytes counted over the network. */
function response(options: {
  headers?: Readonly<Record<string, string>>
  received?: number
  body: Buffer
}) {
  const body = vi.fn(() => Promise.resolve(options.body))
  const request = {
    url: () => URL,
    redirectedFrom: () => null,
    sizes: () =>
      Promise.resolve({
        requestBodySize: 0,
        requestHeadersSize: 0,
        responseBodySize: options.received ?? 0,
        responseHeadersSize: 0,
      }),
  }
  const handed = {
    url: () => URL,
    request: () => request,
    headerValue: (name: string) => Promise.resolve(options.headers?.[name] ?? null),
    body,
  }
  return { handed: handed as unknown as Response, body }
}

const NO_TIMING = new Map<string, TimedSize>()
const LOADED_ONCE = { responses: new Map([[URL, 1]]) }
const read = (handed: Response, max: number, timing = NO_TIMING) =>
  readBody(handed, timing, LOADED_ONCE, max, performance.now() + 5_000)

describe('readBody', () => {
  it('never reads a body longer than its Content-Length says (M1.3a review)', async () => {
    // Chunked framing overrides Content-Length: all three engines took 100,004 bytes so.
    const { handed, body } = response({
      headers: { 'content-length': '10', 'transfer-encoding': 'chunked' },
      received: 100_064,
      body: Buffer.alloc(100_004),
    })
    expect(await read(handed, 1_000)).toBeNull()
    expect(body).not.toHaveBeenCalled()
  })

  it('reads a body within the bytes that came, and says they are the bytes sent', async () => {
    const { handed } = response({
      headers: { 'content-length': '500' },
      received: 500,
      body: Buffer.alloc(500, 0x61),
    })
    const got = await read(handed, 1_000)
    expect(got?.bytes.byteLength).toBe(500)
    expect(got?.asSent).toBe(true)
  })

  it('says when the engine handed text re-encoded, longer than it was sent', async () => {
    // «مرحبا» in windows-1256 is 5 bytes; Chromium and WebKit hand it as 10 bytes of UTF-8.
    const { handed } = response({ received: 29, body: Buffer.alloc(34) })
    expect((await read(handed, 1_000))?.asSent).toBe(false)
  })

  it('reads a compressed body only by its decoded size in Resource Timing', async () => {
    const compressed = { 'content-encoding': 'gzip', 'content-length': '10' }
    const unknown = response({ headers: compressed, received: 10, body: Buffer.alloc(1_000) })
    expect(await read(unknown.handed, 5_000)).toBeNull()
    expect(unknown.body).not.toHaveBeenCalled()

    const timed = response({ headers: compressed, received: 10, body: Buffer.alloc(1_000) })
    const timing = new Map([[URL, { size: 1_000, entries: 1 }]])
    expect((await read(timed.handed, 5_000, timing))?.bytes.byteLength).toBe(1_000)
    expect((await read(timed.handed, 500, timing))?.bytes).toBeUndefined()
  })
})
