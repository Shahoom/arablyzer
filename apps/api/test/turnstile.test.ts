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
  it('asks Cloudflare through the egress package, with the token and the address', async () => {
    const { fetcher, calls } = answering(200, '{"success":true}')
    const check = cloudflareTurnstile({ ...base, fetcher })
    expect(await check('token', '203.0.113.9')).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(SITEVERIFY_URL)
    expect(calls[0]?.options.json).toEqual({
      secret: 'the-secret',
      response: 'token',
      remoteip: '203.0.113.9',
    })
  })

  it('refuses whatever is not a plain success', async () => {
    for (const [status, body] of [
      [200, '{"success":false,"error-codes":["timeout-or-duplicate"]}'],
      [200, '{"success":"true"}'],
      [200, 'not json'],
      [500, '{"success":true}'],
    ] as const) {
      const { fetcher } = answering(status, body)
      expect(await cloudflareTurnstile({ ...base, fetcher })('token', null), body).toBe(false)
    }
    const failed = cloudflareTurnstile({
      ...base,
      fetcher: () =>
        Promise.resolve({ response: null, error: { code: 'timeout' } } as unknown as FetchResult),
    })
    expect(await failed('token', null)).toBe(false)
  })

  it('does not ask about an empty or overlong token', async () => {
    const { fetcher, calls } = answering(200, '{"success":true}')
    const check = cloudflareTurnstile({ ...base, fetcher })
    expect(await check('', null)).toBe(false)
    expect(await check('x'.repeat(2049), null)).toBe(false)
    expect(calls).toHaveLength(0)
  })
})
