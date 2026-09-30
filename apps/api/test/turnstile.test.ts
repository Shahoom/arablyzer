import { createPolicy, type FetchResult, type SafeFetchOptions } from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import {
  cloudflareTurnstile,
  isTurnstileTestSecret,
  isTurnstileToken,
  SITEVERIFY_URL,
} from '../src/turnstile'

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

// Issue #30: a token is good for the site key it was made with, whichever of the site's widgets
// asked for it. Cloudflare returns the widget's `action` with its answer, with its integrity
// protected, and asks a server to check it.
describe('cloudflareTurnstile, bound to an action', () => {
  const answered = (body: unknown, options: { action?: string; allowTestKeys?: boolean } = {}) => {
    const { fetcher } = answering(200, JSON.stringify(body))
    return cloudflareTurnstile({ ...base, hostname: 'arablyzer.example', fetcher, ...options })
  }
  const ours = { success: true, hostname: 'arablyzer.example' }

  it('takes an answer that names the action, and refuses one that names another, or none', async () => {
    const check = (body: unknown) => answered(body, { action: 'scan' })('token')
    expect(await check({ ...ours, action: 'scan' })).toBe(true)
    expect(await check({ ...ours, action: 'login' })).toBe(false)
    expect(await check({ ...ours, action: 'Scan' })).toBe(false)
    expect(await check({ ...ours, action: '' })).toBe(false)
    expect(await check({ ...ours, action: null })).toBe(false)
    expect(await check({ ...ours, action: ['scan'] })).toBe(false)
    expect(await check(ours)).toBe(false)
  })

  it('still asks for the site’s host name, and for success', async () => {
    const check = (body: unknown) => answered(body, { action: 'scan' })('token')
    expect(await check({ success: true, hostname: 'elsewhere.example', action: 'scan' })).toBe(
      false,
    )
    expect(await check({ success: false, hostname: 'arablyzer.example', action: 'scan' })).toBe(
      false,
    )
    expect(await check({ success: 'true', hostname: 'arablyzer.example', action: 'scan' })).toBe(
      false,
    )
  })

  it('binds nothing where it is given no action, as before', async () => {
    expect(await answered(ours)('token')).toBe(true)
  })

  it('never sends the action to Cloudflare: it is the answer’s to name', async () => {
    const { fetcher, calls } = answering(200, JSON.stringify({ ...ours, action: 'scan' }))
    await cloudflareTurnstile({ ...base, action: 'scan', fetcher })('token')
    expect(calls[0]?.options.json).toEqual({ secret: 'the-secret', response: 'token' })
  })
})

// Cloudflare's test keys answer success for any token, with `metadata.result_with_testing_key`
// (measured 2026-09-30, from the documented dummy secret), and name no action.
describe('cloudflareTurnstile, and Cloudflare’s test keys', () => {
  const testing = {
    success: true,
    hostname: 'example.com',
    'error-codes': [],
    metadata: { result_with_testing_key: true },
  }

  it('refuses an answer from a test key, which checks nothing, unless test keys are allowed', async () => {
    const { fetcher } = answering(200, JSON.stringify(testing))
    const options = { ...base, hostname: 'example.com', action: 'scan', fetcher }
    expect(await cloudflareTurnstile(options)('XXXX.DUMMY.TOKEN.XXXX')).toBe(false)
    expect(await cloudflareTurnstile({ ...options, allowTestKeys: false })('t')).toBe(false)
  })

  it('takes it where they are allowed, with no action to bind, but still for the site’s host', async () => {
    const { fetcher } = answering(200, JSON.stringify(testing))
    const options = { ...base, action: 'scan', allowTestKeys: true, fetcher }
    expect(await cloudflareTurnstile({ ...options, hostname: 'example.com' })('t')).toBe(true)
    expect(await cloudflareTurnstile({ ...options, hostname: 'arablyzer.example' })('t')).toBe(
      false,
    )
  })

  it('refuses a failed answer from a test key, allowed or not', async () => {
    const { fetcher } = answering(
      200,
      JSON.stringify({ ...testing, success: false, 'error-codes': ['invalid-input-response'] }),
    )
    expect(await cloudflareTurnstile({ ...base, allowTestKeys: true, fetcher })('t')).toBe(false)
  })

  it('takes a real key’s answer, which never says it is a test’s', async () => {
    const { fetcher } = answering(
      200,
      JSON.stringify({ success: true, hostname: 'arablyzer.example', action: 'scan' }),
    )
    expect(
      await cloudflareTurnstile({
        ...base,
        hostname: 'arablyzer.example',
        action: 'scan',
        allowTestKeys: false,
        fetcher,
      })('t'),
    ).toBe(true)
  })
})

describe('isTurnstileTestSecret', () => {
  it('knows Cloudflare’s test secrets, whichever of them, and no real one', () => {
    for (const secret of [
      '1x0000000000000000000000000000000AA',
      '2x0000000000000000000000000000000AA',
      '3x0000000000000000000000000000000AA',
      '4x0000000000000000000000000000000AA',
    ]) {
      expect(isTurnstileTestSecret(secret), secret).toBe(true)
    }
    for (const secret of [
      '',
      '1x',
      '1x00',
      '0x4AAAAAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      'a1x0000000000000000000000000000000AA',
      ' 1x0000000000000000000000000000000AA',
    ]) {
      expect(isTurnstileTestSecret(secret), secret).toBe(false)
    }
  })
})
