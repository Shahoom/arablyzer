import { describe, expect, it, vi } from 'vitest'
import {
  deleteAccount,
  readAccount,
  setLanguage,
  signInWithCredential,
  signOut,
  signOutEverywhere,
  startGoogle,
} from '../src/islands/auth-api'

const ACCOUNT = {
  id: 'u1',
  email: 'ali@example.com',
  name: 'Ali',
  language: null,
  createdAt: '2026-10-01T00:00:00.000Z',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A `fetch` that answers once, and keeps what it was asked. */
function answering(response: Response | Error) {
  const send = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  return { send: send as unknown as typeof fetch, calls: send.mock.calls }
}

describe('what each call sends', () => {
  it.each([
    [
      'signInWithCredential',
      (send: typeof fetch) => signInWithCredential('a.b.c', send),
      'POST',
      '/api/session/one-tap',
      { credential: 'a.b.c' },
    ],
    [
      'startGoogle',
      (send: typeof fetch) => startGoogle('en', send),
      'POST',
      '/api/session/google',
      { lang: 'en' },
    ],
    [
      'setLanguage',
      (send: typeof fetch) => setLanguage('ar', send),
      'PATCH',
      '/api/account',
      { language: 'ar' },
    ],
    [
      'deleteAccount',
      (send: typeof fetch) => deleteAccount(send),
      'DELETE',
      '/api/account',
      { confirm: true },
    ],
    ['signOut', (send: typeof fetch) => signOut(send), 'DELETE', '/api/session', undefined],
    [
      'signOutEverywhere',
      (send: typeof fetch) => signOutEverywhere(send),
      'DELETE',
      '/api/sessions',
      undefined,
    ],
    ['readAccount', (send: typeof fetch) => readAccount(send), 'GET', '/api/account', undefined],
  ] as const)(
    '%s: method, path, body, cookie and no referrer',
    async (_name, run, method, path, body) => {
      const { send, calls } = answering(json(ACCOUNT))
      await run(send)
      const [url, init] = calls[0] ?? []
      expect(url).toBe(path)
      expect(init?.method).toBe(method)
      expect(init?.credentials).toBe('same-origin')
      expect(init?.referrerPolicy).toBe('no-referrer')
      if (body === undefined) {
        expect(init?.body).toBeUndefined()
      } else {
        expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual(body)
        expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json')
      }
    },
  )

  it('never puts the credential in the address', async () => {
    const { send, calls } = answering(json(ACCOUNT))
    await signInWithCredential('header.payload.signature', send)
    expect(String(calls[0]?.[0])).not.toContain('header')
  })
})

describe('what each call makes of the answer', () => {
  it('reads an account, a refusal, and a network that failed', async () => {
    expect(await signInWithCredential('a.b.c', answering(json(ACCOUNT)).send)).toEqual({
      ok: true,
      value: ACCOUNT,
    })
    expect(
      await signInWithCredential('a.b.c', answering(json({ error: 'invalid-token' }, 400)).send),
    ).toEqual({ ok: false, problem: 'invalid-token' })
    expect(await signInWithCredential('a.b.c', answering(new TypeError('offline')).send)).toEqual({
      ok: false,
      problem: 'network',
    })
    expect(await signInWithCredential('a.b.c', answering(json({ nope: true })).send)).toEqual({
      ok: false,
      problem: 'unavailable',
    })
  })

  it('reads a 401 of the account as nobody signed in, and keeps other failures', async () => {
    expect(await readAccount(answering(json({ error: 'unauthorized' }, 401)).send)).toEqual({
      ok: true,
      value: null,
    })
    expect(await readAccount(answering(json({ error: 'unavailable' }, 503)).send)).toEqual({
      ok: false,
      problem: 'unavailable',
    })
    expect(await readAccount(answering(json(ACCOUNT)).send)).toEqual({ ok: true, value: ACCOUNT })
  })

  it("goes to Google's own address and no other", async () => {
    const google = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x'
    expect(await startGoogle('ar', answering(json({ url: google })).send)).toEqual({
      ok: true,
      value: google,
    })
    for (const url of [
      'https://evil.example/',
      'javascript:alert(1)',
      '//accounts.google.com/',
      5,
    ]) {
      expect(await startGoogle('ar', answering(json({ url })).send)).toEqual({
        ok: false,
        problem: 'unavailable',
      })
    }
  })

  it('keeps the wait of a rate limit and the request for a fresh sign-in', async () => {
    expect(
      await startGoogle(
        'en',
        answering(json({ error: 'rate-limited', retryAfterSeconds: 90 }, 429)).send,
      ),
    ).toEqual({ ok: false, problem: 'rate-limited', retryAfterSeconds: 90 })
    expect(
      await deleteAccount(answering(json({ error: 'fresh-login-required' }, 403)).send),
    ).toEqual({ ok: false, problem: 'fresh-login-required' })
    expect(await signOut(answering(new Response(null, { status: 204 })).send)).toEqual({
      ok: true,
      value: null,
    })
  })
})
