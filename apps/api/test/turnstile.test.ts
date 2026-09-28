import type { FetchResult, SafeFetchOptions } from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import { cloudflareTurnstile, SITEVERIFY_URL } from '../src/turnstile'

function answering(status: number, body: string) {
  const calls: { url: string; options: SafeFetchOptions }[] = []
  const fetcher = (url: string, options: SafeFetchOptions) => {
    calls.push({ url, options })
    return Promise.resolve({
      response: { status, body: new TextEncoder().encode(body) },
      error: null,
    } as unknown as FetchResult)
  }
  return { fetcher, calls }
}

const base = { secret: 'the-secret', userAgent: 'ArablyzerBot/1.0' }

describe('cloudflareTurnstile', () => {
  it('asks Cloudflare through the egress package, with the token and never the address', async () => {
    const { fetcher, calls } = answering(200, '{"success":true}')
    const check = cloudflareTurnstile({ ...base, fetcher })
    expect(await check('token')).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(SITEVERIFY_URL)
    expect(calls[0]?.options.json).toEqual({ secret: 'the-secret', response: 'token' })
  })

  it("refuses a token solved on another site than Arablyzer's", async () => {
    const ours = answering(200, '{"success":true,"hostname":"arablyzer.example"}')
    const theirs = answering(200, '{"success":true,"hostname":"elsewhere.example"}')
    const unnamed = answering(200, '{"success":true}')
    const hostname = 'arablyzer.example'
    expect(await cloudflareTurnstile({ ...base, hostname, fetcher: ours.fetcher })('t')).toBe(true)
    expect(await cloudflareTurnstile({ ...base, hostname, fetcher: theirs.fetcher })('t')).toBe(
      false,
    )
    expect(await cloudflareTurnstile({ ...base, hostname, fetcher: unnamed.fetcher })('t')).toBe(
      false,
    )
  })

  it('refuses whatever is not a plain success', async () => {
    for (const [status, body] of [
      [200, '{"success":false,"error-codes":["timeout-or-duplicate"]}'],
      [200, '{"success":"true"}'],
      [200, 'not json'],
      [500, '{"success":true}'],
    ] as const) {
      const { fetcher } = answering(status, body)
      expect(await cloudflareTurnstile({ ...base, fetcher })('token'), body).toBe(false)
    }
    const failed = cloudflareTurnstile({
      ...base,
      fetcher: () =>
        Promise.resolve({ response: null, error: { code: 'timeout' } } as unknown as FetchResult),
    })
    expect(await failed('token')).toBe(false)
  })

  it('does not ask about an empty or overlong token', async () => {
    const { fetcher, calls } = answering(200, '{"success":true}')
    const check = cloudflareTurnstile({ ...base, fetcher })
    expect(await check('')).toBe(false)
    expect(await check('x'.repeat(2049))).toBe(false)
    expect(calls).toHaveLength(0)
  })
})
