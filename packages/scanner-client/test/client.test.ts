import { describe, expect, it } from 'vitest'
import { remoteScanner, type Fetcher } from '../src/index'

const TOKEN = 'a-token-long-enough-to-be-the-workers-own'

/** A fetcher that answers with these chunks, and records what it was asked. */
function answering(chunks: readonly (string | Uint8Array)[], status = 200) {
  const asked: { url: string; init: RequestInit }[] = []
  const fetcher: Fetcher = (url, init) => {
    asked.push({ url, init })
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
        }
        controller.close()
      },
    })
    return Promise.resolve(new Response(body, { status }))
  }
  return { fetcher, asked }
}

describe('remoteScanner', () => {
  it('asks for the page with the token, and nothing about who asked', async () => {
    const { fetcher, asked } = answering([
      `${JSON.stringify({ type: 'error', message: 'stop' })}\n`,
    ])
    await expect(
      remoteScanner('http://scanner:8788', TOKEN, fetcher)('https://example.com/', () => undefined),
    ).rejects.toThrow('stop')
    expect(asked).toHaveLength(1)
    expect(asked[0]?.url).toBe('http://scanner:8788/scan')
    expect(asked[0]?.init.method).toBe('POST')
    expect(asked[0]?.init.headers).toEqual({
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    })
    expect(asked[0]?.init.body).toBe(JSON.stringify({ url: 'https://example.com/' }))
  })

  it('reads a line cut across chunks, a letter cut across bytes, and a last line with no newline', async () => {
    const line = JSON.stringify({ type: 'error', message: 'تعذّر تشغيل المتصفح' })
    const bytes = new TextEncoder().encode(line)
    // Cut inside a two-byte Arabic letter.
    const cut = line.indexOf('ت') + 10
    const { fetcher } = answering([
      `${JSON.stringify({ type: 'event', event: { type: 'started', engines: [] } })}\n`,
      bytes.subarray(0, cut),
      bytes.subarray(cut),
    ])
    const seen: unknown[] = []
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        fetcher,
      )('https://example.com/', (event) => seen.push(event)),
    ).rejects.toThrow('The scanner could not run the scan: تعذّر تشغيل المتصفح')
    expect(seen).toEqual([{ type: 'started', engines: [] }])
  })

  it('refuses a line past its length, and an answer that is not 200', async () => {
    const long = answering(['x'.repeat(9 * 1024 * 1024)])
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        long.fetcher,
      )('https://example.com/', () => undefined),
    ).rejects.toThrow(/too long/)
    const busy = answering(['{"error":"busy"}'], 503)
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        busy.fetcher,
      )('https://example.com/', () => undefined),
    ).rejects.toThrow('The scanner answered 503')
  })

  it('gives up on a scanner that takes longer than its time', async () => {
    const hanging: Fetcher = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'))
        })
      })
    await expect(
      remoteScanner(
        'http://scanner:8788',
        TOKEN,
        hanging,
        20,
      )('https://example.com/', () => undefined),
    ).rejects.toThrow('aborted')
  })
})
