import { describe, expect, it } from 'vitest'
import { absolute, ApiError, createApiClient, type Fetcher } from '../src/client'

const ID = 'AbCdEfGhIjKlMnOpQrSt_-'
const KEY = `arb_${'k'.repeat(43)}`
const scan = (state: string, extra: object = {}) => ({
  id: ID,
  url: 'https://example.com/',
  state,
  tool: null,
  createdAt: '2026-10-11T12:00:00.000Z',
  score: null,
  links: { status: `/api/v1/scans/${ID}`, report: `/api/v1/scans/${ID}/report`, page: `/r/${ID}` },
  ...extra,
})
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

function clientWith(answer: (input: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetcher: Fetcher = (input, init) => {
    calls.push({ url: input, init })
    return Promise.resolve(answer(input, init))
  }
  return {
    calls,
    client: createApiClient({
      baseUrl: 'https://arablyzer.example/',
      apiKey: KEY,
      fetcher,
      headers: { 'user-agent': 'test/1' },
    }),
  }
}

describe('the API client', () => {
  it('starts a scan with the key as a bearer and the address as JSON', async () => {
    const { client, calls } = clientWith(() =>
      json(202, { data: scan('queued', { reused: false, deleteToken: 'x' }) }),
    )
    const started = await client.startScan('https://example.com/')
    expect(started.id).toBe(ID)
    const [call] = calls
    expect(call?.url).toBe('https://arablyzer.example/api/v1/scans')
    expect(call?.init?.method).toBe('POST')
    expect(call?.init?.body).toBe('{"url":"https://example.com/"}')
    const headers = call?.init?.headers as Record<string, string>
    expect(headers.authorization).toBe(`Bearer ${KEY}`)
    expect(headers['user-agent']).toBe('test/1')
    expect(headers['content-type']).toBe('application/json')
  })

  it('reads a scan and its report by id, encoding the id', async () => {
    const { client, calls } = clientWith((url) =>
      url.endsWith('/report')
        ? json(200, { data: { findings: [], score: { overall: 90 } } })
        : json(200, { data: scan('complete', { score: 90 }) }),
    )
    expect((await client.getScan(ID)).score).toBe(90)
    expect((await client.getReport(ID)).score.overall).toBe(90)
    expect(calls.map((call) => call.url)).toEqual([
      `https://arablyzer.example/api/v1/scans/${ID}`,
      `https://arablyzer.example/api/v1/scans/${ID}/report`,
    ])
  })

  it('turns the API’s refusal into an error with its code, limit and Retry-After', async () => {
    const { client } = clientWith(() =>
      json(
        429,
        {
          error: { code: 'rate_limited', message: 'Slow down', details: { retryAfterSeconds: 12 } },
        },
        { 'retry-after': '60' },
      ),
    )
    const error = await client.startScan('https://example.com/').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'rate_limited', status: 429, retryAfterSeconds: 12 })

    const limited = clientWith(() =>
      json(403, {
        error: { code: 'plan_limit', message: 'No API', details: { limit: 'apiScans' } },
      }),
    )
    expect(
      await limited.client.startScan('https://example.com/').catch((e: unknown) => e),
    ).toMatchObject({
      code: 'plan_limit',
      limit: 'apiScans',
    })
  })

  it('takes Retry-After from the header when the body has none', async () => {
    const { client } = clientWith(() =>
      json(429, { error: { code: 'rate_limited', message: 'm' } }, { 'retry-after': '7' }),
    )
    expect(await client.getScan(ID).catch((e: unknown) => e)).toMatchObject({
      retryAfterSeconds: 7,
    })
  })

  it('calls an answer it cannot read “unavailable”, and says a wrong shape is a bad response', async () => {
    const down = clientWith(() => new Response('<html>502</html>', { status: 502 }))
    expect(await down.client.getScan(ID).catch((e: unknown) => e)).toMatchObject({
      code: 'unavailable',
      status: 502,
    })
    const odd = clientWith(() => json(200, { data: { id: 5 } }))
    expect(await odd.client.getScan(ID).catch((e: unknown) => e)).toMatchObject({
      code: 'bad_response',
    })
    const noReport = clientWith(() => json(200, { data: null }))
    expect(await noReport.client.getReport(ID).catch((e: unknown) => e)).toMatchObject({
      code: 'bad_response',
    })
  })

  it('reports a dropped connection as “network”, and never puts the key in a message', async () => {
    const { client } = clientWith(() => {
      throw new TypeError(`fetch failed for ${KEY}`)
    })
    const error = await client.getScan(ID).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'network', status: 0 })
    expect((error as Error).message).not.toContain(KEY)
  })

  it('checks a key with the cheapest read', async () => {
    const { client, calls } = clientWith(() => json(200, { data: [], meta: { nextCursor: null } }))
    await client.checkKey()
    expect(calls[0]?.url).toBe('https://arablyzer.example/api/v1/scans?limit=1')
    const bad = clientWith(() => json(401, { error: { code: 'unauthorized', message: 'no' } }))
    expect(await bad.client.checkKey().catch((e: unknown) => e)).toMatchObject({
      code: 'unauthorized',
    })
  })

  it('resolves the API’s paths against the site', () => {
    expect(absolute('https://arablyzer.example/', '/r/abc')).toBe('https://arablyzer.example/r/abc')
    expect(absolute('https://arablyzer.example', 'https://other.example/r/abc')).toBe(
      'https://other.example/r/abc',
    )
  })
})
