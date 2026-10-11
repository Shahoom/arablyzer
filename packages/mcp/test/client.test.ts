import { describe, expect, it } from 'vitest'
import { ApiError, createApiClient, type Fetcher } from '../src/index'
import { ID, scan } from './fixtures'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function client(answer: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const seen: { url: string; init: RequestInit }[] = []
  const fetcher: Fetcher = async (url, init = {}) => {
    seen.push({ url, init })
    return answer(url, init)
  }
  const key = `arb_${'k'.repeat(43)}`
  return {
    seen,
    api: createApiClient({
      baseUrl: 'https://arablyzer.example/',
      apiKey: key,
      fetcher,
      headers: { 'x-extra': '1' },
    }),
    key,
  }
}

describe('the API client', () => {
  it('sends the key as a bearer and the body as JSON, to the API’s own paths', async () => {
    const { api, seen, key } = client(() =>
      json({ data: { ...scan('queued'), reused: false, deleteToken: 'd'.repeat(43) } }, 202),
    )
    const started = await api.startScan('https://example.com/', ['chromium'])
    expect(started).toMatchObject({ id: ID, reused: false })
    expect(seen[0]?.url).toBe('https://arablyzer.example/api/v1/scans')
    expect(seen[0]?.init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/', engines: ['chromium'] }),
    })
    expect(seen[0]?.init.headers).toMatchObject({
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'x-extra': '1',
    })
  })

  it('reads a scan, a report, tools, rules and one rule', async () => {
    const answers: Record<string, unknown> = {
      [`/api/v1/scans/${ID}`]: { data: scan('complete') },
      [`/api/v1/scans/${ID}/report`]: { data: { score: { overall: 1 } } },
      '/api/v1/tools?limit=5&cursor=abc': { data: [], meta: { nextCursor: 'next' } },
      '/api/v1/rules': { data: [], meta: { nextCursor: null } },
    }
    const { api } = client((url) => json(answers[new URL(url).pathname + new URL(url).search]))
    expect((await api.getScan(ID)).state).toBe('complete')
    expect(await api.getReport(ID)).toEqual({ score: { overall: 1 } })
    expect(await api.listTools(5, 'abc')).toEqual({ data: [], nextCursor: 'next' })
    expect(await api.listRules()).toEqual({ data: [], nextCursor: null })
  })

  it('turns the API’s refusals into ApiError with its code, and anything else into unavailable', async () => {
    const refused = client(() =>
      json({ error: { code: 'plan_limit', message: 'No.', details: { limit: 'api' } } }, 403),
    )
    await expect(refused.api.getScan(ID)).rejects.toMatchObject({
      code: 'plan_limit',
      status: 403,
      details: { limit: 'api' },
    })
    const html = client(() => new Response('<html>', { status: 502 }))
    await expect(html.api.getScan(ID)).rejects.toMatchObject({ code: 'unavailable', status: 502 })
    const down = client(() => Promise.reject(new Error('ECONNREFUSED 10.0.0.1:443')))
    const error = await down.api.getScan(ID).catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).not.toMatch(/10\.0\.0\.1/)
  })

  it('refuses an answer in a shape it does not know', async () => {
    const { api } = client(() => json({ data: { id: 1 } }))
    await expect(api.getScan(ID)).rejects.toMatchObject({ code: 'unavailable', status: 502 })
  })
})
