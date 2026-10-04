import { createHash } from 'node:crypto'
import { GSC_RESULT_PATTERN, type GscResult } from '@arablyzer/api-contract'
import { DEFAULT_POLICY, type safeFetch, type SafeFetchOptions } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS } from '@arablyzer/plans'
import type { Report } from '@arablyzer/report-schema'
import {
  MemoryHandoff,
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { apiDeps } from '../src/config'
import { googleApi } from '../src/gsc/google'
import { newPkce, signFlow, verifyFlow } from '../src/gsc/oauth'
import { pickProperty, periodOf, shapeInspection, shapeRows, shapeTotals } from '../src/gsc/shape'

const NOW = new Date('2026-09-28T12:00:00Z')
const KEY = Buffer.alloc(32, 7)
const SITE = 'https://arablyzer.example'
const REPORT_ID = 'AbCdEfGhIjKlMnOpQrSt_-'
const PAGE = 'https://shop.example.com/ar/products'
const TOKEN = 'ya29.test-access-token-never-stored'

const entry = (siteUrl: string, permissionLevel = 'siteOwner') => ({ siteUrl, permissionLevel })

describe('PKCE and the flow cookie', () => {
  it('makes a 43-character verifier whose challenge is its SHA-256, as S256 says', () => {
    const { verifier, challenge } = newPkce()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
    expect(newPkce().verifier).not.toBe(verifier)
  })

  it('reads back what it signed, until it expires, and nothing that was changed', () => {
    const flow = { n: 'nonce', r: REPORT_ID, e: NOW.getTime() + 600_000 }
    const cookie = signFlow(KEY, flow)
    expect(verifyFlow(KEY, cookie, NOW.getTime())).toEqual(flow)
    expect(verifyFlow(KEY, cookie, flow.e)).toBeNull()
    expect(verifyFlow(Buffer.alloc(32, 8), cookie, NOW.getTime())).toBeNull()
    const [body = '', signature = ''] = cookie.split('.')
    const forged = Buffer.from(JSON.stringify({ ...flow, r: 'someone-elses-report-0' })).toString(
      'base64url',
    )
    expect(verifyFlow(KEY, `${forged}.${signature}`, NOW.getTime())).toBeNull()
    expect(verifyFlow(KEY, `${body}.${signature}.x`, NOW.getTime())).toBeNull()
    expect(verifyFlow(KEY, undefined, NOW.getTime())).toBeNull()
    expect(verifyFlow(KEY, 'garbage', NOW.getTime())).toBeNull()
  })
})

describe('pickProperty', () => {
  it('takes a domain property first, even when a URL-prefix one is closer', () => {
    const sites = {
      siteEntry: [entry('https://shop.example.com/ar/'), entry('sc-domain:example.com')],
    }
    expect(pickProperty(sites, PAGE)).toEqual({ siteUrl: 'sc-domain:example.com', kind: 'domain' })
  })

  it('takes the most specific domain, and never one that only ends the same way', () => {
    const sites = {
      siteEntry: [entry('sc-domain:example.com'), entry('sc-domain:shop.example.com')],
    }
    expect(pickProperty(sites, PAGE)?.siteUrl).toBe('sc-domain:shop.example.com')
    expect(pickProperty({ siteEntry: [entry('sc-domain:ample.com')] }, PAGE)).toBeNull()
  })

  it('takes the longest URL prefix on the page’s scheme and host', () => {
    const sites = {
      siteEntry: [
        entry('https://shop.example.com/'),
        entry('https://shop.example.com/ar/'),
        entry('http://shop.example.com/ar/products/'),
        entry('https://www.shop.example.com/ar/products/'),
        entry('https://shop.example.com/en/'),
      ],
    }
    expect(pickProperty(sites, PAGE)).toEqual({
      siteUrl: 'https://shop.example.com/ar/',
      kind: 'prefix',
    })
  })

  it('skips a property the user cannot read, and is null when none matches', () => {
    const unverified = { siteEntry: [entry('sc-domain:example.com', 'siteUnverifiedUser')] }
    expect(pickProperty(unverified, PAGE)).toBeNull()
    expect(pickProperty({ siteEntry: [entry('https://other.example/')] }, PAGE)).toBeNull()
    expect(pickProperty({}, PAGE)).toBeNull()
    expect(pickProperty('x', PAGE)).toBeNull()
    expect(pickProperty({ siteEntry: [entry('sc-domain:example.com')] }, 'not a url')).toBeNull()
  })
})

describe('shaping Google’s answers', () => {
  it('ends the 28 days two days ago', () => {
    expect(periodOf(NOW)).toEqual({ start: '2026-08-30', end: '2026-09-26' })
  })

  it('keeps Arabic queries as they are, and drops rows that are not numbers', () => {
    const body = {
      rows: [
        { keys: ['متجر إلكتروني'], clicks: 12, impressions: 340, ctr: 0.035, position: 4.2 },
        { keys: ['bad'], clicks: 'many', impressions: 1, ctr: 0, position: 1 },
        { keys: [''], clicks: 1, impressions: 1, ctr: 1, position: 1 },
        { clicks: 1, impressions: 1, ctr: 1, position: 1 },
      ],
    }
    expect(shapeRows(body, 10)).toEqual([
      { key: 'متجر إلكتروني', clicks: 12, impressions: 340, ctr: 0.035, position: 4.2 },
    ])
    expect(shapeRows({ rows: Array(30).fill(body.rows[0]) }, 5)).toHaveLength(5)
    expect(shapeRows(null, 5)).toEqual([])
  })

  it('reads the totals row, and none when Google had no data', () => {
    expect(shapeTotals({ rows: [{ clicks: 5, impressions: 50, ctr: 0.1, position: 3 }] })).toEqual({
      clicks: 5,
      impressions: 50,
      ctr: 0.1,
      position: 3,
    })
    expect(shapeTotals({})).toBeNull()
    expect(shapeTotals({ rows: [{ clicks: -1, impressions: 1, ctr: 0, position: 1 }] })).toBeNull()
  })

  it('reads the inspection, with what Google left out as null', () => {
    const body = {
      inspectionResult: {
        indexStatusResult: {
          verdict: 'PASS',
          coverageState: 'Submitted and indexed',
          lastCrawlTime: '2026-09-20T08:00:00Z',
          googleCanonical: PAGE,
          userCanonical: PAGE,
        },
        mobileUsabilityResult: {
          verdict: 'FAIL',
          issues: [{ issueType: 'TAP_TARGETS_TOO_CLOSE' }],
        },
      },
    }
    expect(shapeInspection(body)).toEqual({
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      indexingState: null,
      pageFetchState: null,
      robotsTxtState: null,
      lastCrawlTime: '2026-09-20T08:00:00Z',
      googleCanonical: PAGE,
      userCanonical: PAGE,
      mobileUsability: { verdict: 'FAIL', issues: ['TAP_TARGETS_TOO_CLOSE'] },
    })
    expect(
      shapeInspection({ inspectionResult: { indexStatusResult: { lastCrawlTime: 'x' } } }),
    ).toMatchObject({ lastCrawlTime: null, mobileUsability: null })
    expect(shapeInspection({})).toBeNull()
  })
})

// The routes, with Google's endpoints answered by a fake fetch that notes what it was asked.
interface Call {
  readonly url: string
  readonly options: SafeFetchOptions
}

function setup(
  options: {
    sites?: unknown
    siteStatus?: number
    tokenStatus?: number
    analyticsStatus?: number
    off?: boolean
  } = {},
) {
  const calls: Call[] = []
  const answer = (status: number, body: unknown) => ({
    response: {
      url: '',
      status,
      headers: [],
      body: new TextEncoder().encode(JSON.stringify(body)),
      truncated: false,
      remoteAddress: null,
      certificate: null,
    },
  })
  const fetcher = ((url: string, fetchOptions: SafeFetchOptions) => {
    calls.push({ url, options: fetchOptions })
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return Promise.resolve(
        answer(options.tokenStatus ?? 200, { access_token: TOKEN, token_type: 'Bearer' }),
      )
    }
    if (url.startsWith('https://oauth2.googleapis.com/revoke'))
      return Promise.resolve(answer(200, {}))
    if (url === 'https://www.googleapis.com/webmasters/v3/sites') {
      return Promise.resolve(
        answer(
          options.siteStatus ?? 200,
          options.sites ?? { siteEntry: [entry('sc-domain:example.com')] },
        ),
      )
    }
    if (url.includes('/searchAnalytics/query')) {
      const body = fetchOptions.json as { dimensions?: string[] }
      const row = { clicks: 9, impressions: 90, ctr: 0.1, position: 2.5 }
      const rows =
        body.dimensions === undefined
          ? [row]
          : [{ keys: [body.dimensions[0] === 'query' ? 'متجر' : 'x'], ...row }]
      return Promise.resolve(answer(options.analyticsStatus ?? 200, { rows }))
    }
    if (url.startsWith('https://searchconsole.googleapis.com/v1/urlInspection')) {
      return Promise.resolve(
        answer(200, { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } }),
      )
    }
    return Promise.resolve(answer(404, {}))
  }) as unknown as typeof safeFetch

  const store = new MemoryScanStore()
  const handoff = new MemoryHandoff(() => NOW.getTime())
  const logged: string[] = []
  const env = {
    ARABLYZER_SITE: SITE,
    ARABLYZER_LIMIT_SECRET: 'x'.repeat(40),
    ...(options.off === true
      ? {}
      : {
          ARABLYZER_GSC_CLIENT_ID: 'client-id.apps.example',
          ARABLYZER_GSC_CLIENT_SECRET: 'client-secret-xyz',
        }),
  }
  const deps = {
    ...apiDeps(
      env,
      {
        store,
        queue: new MemoryScanQueue(),
        events: new MemoryScanEvents(20),
        limiter: new MemoryRateLimiter(),
        inFlight: new MemoryInFlight(),
        handoff,
      },
      (text) => logged.push(text),
      { fetcher },
    ),
    limits: DEVELOPMENT_LIMITS,
    policy: DEFAULT_POLICY,
    address: () => '203.0.113.9',
    now: () => NOW,
    log: (text: string) => logged.push(text),
  }
  const app = createApp(deps)

  const seed = async () => {
    await store.create({ id: REPORT_ID, url: PAGE, createdAt: NOW, deleteTokenHash: 'h' })
    await store.start(REPORT_ID, NOW)
    const report = { scan: { status: 'complete' }, target: { url: PAGE, finalUrl: PAGE } }
    await store.finish(REPORT_ID, report as unknown as Report, NOW)
  }
  /** Runs `start`, and gives what Google would be sent, and the cookie to bring back. */
  const start = async () => {
    const response = await app.request(`/api/gsc/start?report=${REPORT_ID}&lang=ar`)
    const location = new URL(response.headers.get('location') ?? 'about:blank')
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    return { response, location, cookie }
  }
  const callback = (query: string, cookie: string) =>
    app.request(`/api/gsc/callback?${query}`, { headers: { cookie } })
  return { app, calls, seed, start, callback, logged, handoff }
}

describe('Search Console routes', () => {
  it('is off without the OAuth client: it says so, and starts nothing', async () => {
    const { app, seed } = setup({ off: true })
    await seed()
    expect(await (await app.request('/api/gsc/status')).json()).toEqual({ enabled: false })
    expect((await app.request(`/api/gsc/start?report=${REPORT_ID}`)).status).toBe(404)
    expect((await app.request('/api/gsc/callback?code=x&state=y')).status).toBe(404)
  })

  it('starts the flow with PKCE, a state and an online, read-only request, and a signed cookie', async () => {
    const { app, seed, start } = setup()
    await seed()
    expect(await (await app.request('/api/gsc/status')).json()).toEqual({ enabled: true })
    const { response, location, cookie } = await start()
    expect(response.status).toBe(302)
    expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const q = location.searchParams
    expect(Object.fromEntries(q)).toMatchObject({
      client_id: 'client-id.apps.example',
      redirect_uri: `${SITE}/api/gsc/callback`,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      code_challenge_method: 'S256',
      access_type: 'online',
      prompt: 'select_account',
    })
    expect(q.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(q.get('client_secret')).toBeNull()
    expect(q.get('code_verifier')).toBeNull()
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).toMatch(/Secure/i)
    expect(setCookie).toMatch(/Path=\/api\/gsc/)
    expect(cookie).toMatch(/^arablyzer_gsc=/)
  })

  it('refuses a malformed or unknown report', async () => {
    const { app, seed } = setup()
    await seed()
    expect((await app.request('/api/gsc/start?report=../../x')).status).toBe(400)
    expect((await app.request('/api/gsc/start')).status).toBe(400)
    expect((await app.request('/api/gsc/start?report=ZZZZZZZZZZZZZZZZZZZZZZ')).status).toBe(404)
  })

  it('exchanges the code with the verifier, reads Search Console once, and hands the result over once', async () => {
    const { app, calls, seed, start, callback, logged } = setup()
    await seed()
    const { location, cookie } = await start()
    const state = location.searchParams.get('state') ?? ''
    const response = await callback(`code=4%2Fauth-code&state=${state}`, cookie)
    expect(response.status).toBe(302)
    const back = new URL(response.headers.get('location') ?? '')
    // Only the site's own origin, and the report's page, in Arabic.
    expect(back.origin).toBe(SITE)
    expect(back.pathname).toBe(`/r/${REPORT_ID}`)
    const rid = back.searchParams.get('gsc') ?? ''
    expect(rid).toMatch(GSC_RESULT_PATTERN)
    expect(response.headers.get('set-cookie')).toMatch(/arablyzer_gsc=;|Max-Age=0/i)

    // The code was traded with the verifier whose challenge Google was given, the exact redirect
    // URI and the secret, in the body.
    const exchange = calls.find((call) => call.url.endsWith('/token'))
    const form = exchange?.options.form ?? {}
    expect(form).toMatchObject({
      grant_type: 'authorization_code',
      code: '4/auth-code',
      client_id: 'client-id.apps.example',
      client_secret: 'client-secret-xyz',
      redirect_uri: `${SITE}/api/gsc/callback`,
    })
    expect(
      createHash('sha256')
        .update(form.code_verifier ?? '')
        .digest('base64url'),
    ).toBe(location.searchParams.get('code_challenge'))
    // The token is in headers alone, never a URL, and revoked once used.
    const withToken = calls.filter((call) => call.options.headers?.authorization !== undefined)
    expect(withToken.length).toBeGreaterThanOrEqual(6)
    for (const call of calls) expect(call.url).not.toContain(TOKEN)
    expect(calls.at(-1)?.url).toBe('https://oauth2.googleapis.com/revoke')
    expect(calls.at(-1)?.options.form).toEqual({ token: TOKEN })
    // The property the user owns is the one asked, for the 28 days.
    const analytics = calls.filter((call) => call.url.includes('/searchAnalytics/query'))
    expect(analytics.map((call) => call.url)).toEqual(
      Array(4).fill(
        'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query',
      ),
    )
    expect(analytics[0]?.options.json).toMatchObject({
      startDate: '2026-08-30',
      endDate: '2026-09-26',
    })
    expect(calls.find((call) => call.url.includes('urlInspection'))?.options.json).toEqual({
      inspectionUrl: PAGE,
      siteUrl: 'sc-domain:example.com',
    })

    // The page reads it once.
    const read = await app.request(`/api/gsc/results/${rid}`)
    expect(read.status).toBe(200)
    const result = (await read.json()) as GscResult
    expect(result).toMatchObject({
      property: { siteUrl: 'sc-domain:example.com', kind: 'domain' },
      period: { start: '2026-08-30', end: '2026-09-26' },
      totals: { clicks: 9, impressions: 90 },
      partial: false,
    })
    expect(result.queries[0]?.key).toBe('متجر')
    expect(result.inspection?.verdict).toBe('PASS')
    expect((await app.request(`/api/gsc/results/${rid}`)).status).toBe(404)
    // No token in the result, nor in the log.
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(logged.join(' ')).not.toContain(TOKEN)
  })

  it('says there is no property when the user owns none for the site', async () => {
    const { app, seed, start, callback } = setup({
      sites: { siteEntry: [entry('https://other.example/')] },
    })
    await seed()
    const { location, cookie } = await start()
    const response = await callback(`code=c&state=${location.searchParams.get('state')}`, cookie)
    const rid = new URL(response.headers.get('location') ?? '').searchParams.get('gsc') ?? ''
    const result = (await (await app.request(`/api/gsc/results/${rid}`)).json()) as GscResult
    expect(result).toMatchObject({ property: null, totals: null, queries: [], inspection: null })
  })

  it('refuses a state that is not the cookie’s, a missing cookie, and a callback sent twice', async () => {
    const { seed, start, callback, calls } = setup()
    await seed()
    const { location, cookie } = await start()
    const state = location.searchParams.get('state') ?? ''
    expect((await callback(`code=c&state=${'A'.repeat(43)}`, cookie)).status).toBe(400)
    expect((await callback(`code=c&state=${state}`, '')).status).toBe(400)
    expect((await callback(`code=c&state=${state}`, 'arablyzer_gsc=forged.value')).status).toBe(400)
    expect(calls).toEqual([])
    expect((await callback(`code=c&state=${state}`, cookie)).status).toBe(302)
    // The verifier was read once: the same callback again finds none.
    expect((await callback(`code=c&state=${state}`, cookie)).status).toBe(400)
  })

  it('goes back to the report with a word when the user says no, or Google fails', async () => {
    const denied = setup()
    await denied.seed()
    const first = await denied.start()
    const refusal = await denied.callback(
      `error=access_denied&state=${first.location.searchParams.get('state')}`,
      first.cookie,
    )
    expect(new URL(refusal.headers.get('location') ?? '').searchParams.get('gsc')).toBe('denied')

    const broken = setup({ tokenStatus: 400 })
    await broken.seed()
    const second = await broken.start()
    const failure = await broken.callback(
      `code=c&state=${second.location.searchParams.get('state')}`,
      second.cookie,
    )
    expect(new URL(failure.headers.get('location') ?? '').searchParams.get('gsc')).toBe('error')
  })

  it('shows what it can when a part fails, and fails when Search Console gives none', async () => {
    const down = setup({ analyticsStatus: 500 })
    await down.seed()
    const { location, cookie } = await down.start()
    const response = await down.callback(
      `code=c&state=${location.searchParams.get('state')}`,
      cookie,
    )
    const rid = new URL(response.headers.get('location') ?? '').searchParams.get('gsc') ?? ''
    const result = (await (await down.app.request(`/api/gsc/results/${rid}`)).json()) as GscResult
    expect(result).toMatchObject({ partial: true, totals: null, queries: [] })
    expect(result.inspection?.verdict).toBe('PASS')

    const noList = setup({ siteStatus: 403 })
    await noList.seed()
    const again = await noList.start()
    const failed = await noList.callback(
      `code=c&state=${again.location.searchParams.get('state')}`,
      again.cookie,
    )
    expect(new URL(failed.headers.get('location') ?? '').searchParams.get('gsc')).toBe('error')
  })

  it('has no result for an id that is not one, or one that was never made', async () => {
    const { app } = setup()
    expect((await app.request('/api/gsc/results/short')).status).toBe(404)
    expect((await app.request(`/api/gsc/results/${'A'.repeat(43)}`)).status).toBe(404)
  })
})

describe('googleApi', () => {
  it('is a failure, never a throw, when the fetch itself fails', async () => {
    const api = googleApi({
      policy: DEFAULT_POLICY,
      fetcher: (() => Promise.reject(new Error('boom'))) as unknown as typeof safeFetch,
    })
    expect(await api.sites('t')).toEqual({ status: null, body: null })
    expect(
      await api.exchange({
        code: 'c',
        verifier: 'v',
        clientId: 'i',
        clientSecret: 's',
        redirectUri: 'r',
      }),
    ).toBeNull()
  })
})
