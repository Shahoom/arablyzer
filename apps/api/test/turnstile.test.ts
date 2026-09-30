import { createPolicy, type FetchResult, type SafeFetchOptions } from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import { cloudflareTurnstile, isTurnstileToken, SITEVERIFY_URL } from '../src/turnstile'

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

const policy = createPolicy({ upstream: 'http://egress:4750' })
const base = { secret: 'the-secret', userAgent: 'ArablyzerBot/1.0', policy }

describe('cloudflareTurnstile', () => {
  it('asks Cloudflare through the egress package, with the token and never the address', async () => {
    const { fetcher, calls } = answering(200, '{"success":true}')
    const check = cloudflareTurnstile({ ...base, fetcher })
    expect(await check('token')).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(SITEVERIFY_URL)
    expect(calls[0]?.options.json).toEqual({ secret: 'the-secret', response: 'token' })
    // The server's policy, whose egress proxy the request leaves through.
    expect(calls[0]?.options.policy).toBe(policy)
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

describe('isTurnstileToken', () => {
  it('takes what Turnstile issues: visible ASCII, from one character to 2,048', () => {
    expect(isTurnstileToken('XXXX.DUMMY.TOKEN.XXXX')).toBe(true)
    expect(isTurnstileToken(`0.${'aB3-_'.repeat(300)}`)).toBe(true)
    expect(isTurnstileToken('x'.repeat(2048))).toBe(true)
  })

  // The security review (issue #30): every shape Turnstile cannot issue cost a call to Cloudflare.
  it('refuses what it cannot issue: nothing, too long, spaces, control characters, other scripts', () => {
    for (const token of [
      '',
      'x'.repeat(2049),
      ' ',
      'two words',
      ' padded',
      'trailing ',
      'line\nbreak',
      'tab\there',
      'nul\u0000byte',
      'delete\u007f',
      'tökén',
      'رمز',
      '\u200bzero-width',
    ]) {
      expect(isTurnstileToken(token), JSON.stringify(token)).toBe(false)
    }
  })

  it('is the check cloudflareTurnstile makes before it calls Cloudflare', async () => {
    const { fetcher, calls } = answering(200, '{"success":true}')
    const check = cloudflareTurnstile({ ...base, fetcher })
    for (const token of ['', 'two words', 'line\nbreak', 'tökén', 'x'.repeat(2049)]) {
      expect(await check(token), JSON.stringify(token)).toBe(false)
    }
    expect(calls).toHaveLength(0)
    expect(await check('XXXX.DUMMY.TOKEN.XXXX')).toBe(true)
    expect(calls).toHaveLength(1)
  })
})
