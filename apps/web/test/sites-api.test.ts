import { describe, expect, it, vi } from 'vitest'
import { addSite, listScans, listSites, removeSite, scanSite } from '../src/islands/sites-api'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function answering(response: Response | Error) {
  const send = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  return { send: send as unknown as typeof fetch, calls: send.mock.calls }
}

describe('what each call sends', () => {
  it.each([
    ['listSites', (send: typeof fetch) => listSites(send), 'GET', '/api/sites', undefined],
    ['listScans', (send: typeof fetch) => listScans(send), 'GET', '/api/account/scans', undefined],
    [
      'addSite',
      (send: typeof fetch) => addSite('https://example.com/', send),
      'POST',
      '/api/sites',
      { url: 'https://example.com/' },
    ],
    [
      'removeSite',
      (send: typeof fetch) => removeSite('abc', send),
      'DELETE',
      '/api/sites/abc',
      undefined,
    ],
    [
      'scanSite',
      (send: typeof fetch) => scanSite('abc', send),
      'POST',
      '/api/sites/abc/scans',
      undefined,
    ],
  ])('%s', async (_name, call, method, path, body) => {
    const { send, calls } = answering(json({}, 500))
    await call(send)
    const [url, init] = calls[0] ?? []
    expect(url).toBe(path)
    expect(init?.method).toBe(method)
    expect(init?.credentials).toBe('same-origin')
    expect(init?.referrerPolicy).toBe('no-referrer')
    expect(init?.body === undefined ? undefined : JSON.parse(init.body as string)).toEqual(body)
  })
})

describe('what each call comes to', () => {
  it('reads the lists, and refuses an answer that is not one', async () => {
    expect(await listSites(answering(json({ sites: [], limit: 3 })).send)).toEqual({
      ok: true,
      value: { sites: [], limit: 3 },
    })
    expect(await listSites(answering(json({ nope: 1 })).send)).toEqual({
      ok: false,
      problem: 'unavailable',
    })
    expect(await listScans(answering(json({ scans: [], historyDays: 30 })).send)).toMatchObject({
      ok: true,
    })
  })

  it('names the refusals: the plan’s limit, a URL’s fault, a wait, no session, no network', async () => {
    expect(
      await addSite('x', answering(json({ error: 'plan-limit', limit: 'savedSites' }, 403)).send),
    ).toEqual({ ok: false, problem: 'plan-limit' })
    expect(await addSite('x', answering(json({ error: 'invalid-url' }, 400)).send)).toEqual({
      ok: false,
      problem: 'invalid-url',
    })
    expect(
      await scanSite(
        'a',
        answering(json({ error: 'rate-limited', retryAfterSeconds: 60 }, 429)).send,
      ),
    ).toEqual({ ok: false, problem: 'rate-limited', retryAfterSeconds: 60 })
    expect(await listSites(answering(json({ error: 'unauthorized' }, 401)).send)).toEqual({
      ok: false,
      problem: 'unauthorized',
    })
    expect(await listSites(answering(new Error('offline')).send)).toEqual({
      ok: false,
      problem: 'network',
    })
  })

  it('removes with a 204, and starts a scan with its id', async () => {
    expect(await removeSite('a', answering(new Response(null, { status: 204 })).send)).toEqual({
      ok: true,
      value: null,
    })
    expect(await removeSite('a', answering(json({ error: 'not-found' }, 404)).send)).toEqual({
      ok: false,
      problem: 'not-found',
    })
    expect(
      await scanSite(
        'a',
        answering(json({ id: 'SSSSSSSSSSSSSSSSSSSSSS', deleteToken: 't' }, 202)).send,
      ),
    ).toEqual({ ok: true, value: { id: 'SSSSSSSSSSSSSSSSSSSSSS', deleteToken: 't' } })
  })
})
