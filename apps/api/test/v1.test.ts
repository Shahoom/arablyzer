import {
  API_KEY_PATTERN,
  ApiKeySchema,
  buildOpenApi,
  DELETE_TOKEN_PATTERN,
  many,
  one,
  V1Error,
  V1Rule,
  V1RuleDetail,
  V1Scan,
  V1ScanStarted,
  V1Tool,
} from '@arablyzer/api-contract'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, planCatalogFrom } from '@arablyzer/plans'
import { reportJsonSchema } from '@arablyzer/report-schema'
import {
  MemoryAccountData,
  MemoryApiKeyData,
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { TOOL_DEFINITIONS } from '@arablyzer/tools/registry'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountsDeps } from '../src/accounts'
import { createApp } from '../src/app'
import { createAuth } from '../src/auth'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle } from './support/google'
import { reportOf } from './support/reports'

const SITE = new URL('https://arablyzer.example')
const PLAN = {
  ARABLYZER_PLAN_ACCOUNT_SCANS: '4',
  ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '60',
  ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '20',
  ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '2',
  ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '30',
}
const ANONYMOUS = { ...DEVELOPMENT_LIMITS, perConnection: { scans: 1, seconds: 60 }, inFlight: 1 }

function setup(options: { accounts?: boolean; plan?: Record<string, string> } = {}) {
  const tables: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] }
  const scans = new MemoryScanStore()
  const data = new MemoryAccountData(scans)
  const keys = new MemoryApiKeyData()
  const auth = createAuth({
    site: SITE,
    secret: 'a'.repeat(40),
    database: memoryAdapter(tables),
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    production: false,
    beforeDelete: async (userId) => {
      await data.eraseUser(userId)
      await keys.eraseUser(userId)
    },
    log: () => undefined,
  })
  const accounts: AccountsDeps = {
    auth,
    limits: { signIn: { scans: 1000, seconds: 60 } },
    secureCookies: false,
    data,
    plans: planCatalogFrom({ ...PLAN, ...options.plan }, ANONYMOUS),
    apiKeys: keys,
  }
  const queue = new MemoryScanQueue()
  let count = 0
  const app = createApp({
    limits: ANONYMOUS,
    policy: DEFAULT_POLICY,
    resolver: () => Promise.resolve([{ address: '93.184.215.14', family: 4 }]),
    turnstile: () => Promise.resolve(true),
    limiter: new MemoryRateLimiter(),
    store: scans,
    queue,
    events: new MemoryScanEvents(20),
    inFlight: new MemoryInFlight(),
    address: () => '203.0.113.9',
    connectionKey: (a) => `key-of-${a}`,
    newId: () => `scan${String(++count).padStart(18, '0')}`,
    origin: SITE.origin,
    ...(options.accounts === false ? {} : { accounts }),
  })
  const site = (method: string, path: string, body?: unknown, cookie?: string) =>
    app.request(path, {
      method,
      headers: {
        origin: SITE.origin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie === undefined ? {} : { cookie }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const signIn = async (sub: string) => {
    stubGoogle(idToken({ sub, email: `${sub}@example.com` }))
    const response = await site('POST', '/api/session/one-tap', {
      credential: idToken({ sub, email: `${sub}@example.com` }),
    })
    expect(response.status).toBe(200)
    return response.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
  }
  /** A person with one key: the cookie they signed in with, and the secret. */
  const withKey = async (sub = 'ali', name = 'CI') => {
    const cookie = await signIn(sub)
    const made = await site('POST', '/api/account/keys', { name }, cookie)
    expect(made.status).toBe(201)
    const { secret, key } = (await made.json()) as { secret: string; key: { id: string } }
    return { cookie, secret, id: key.id }
  }
  const call = (method: string, path: string, secret?: string, body?: unknown, headers = {}) =>
    app.request(path, {
      method,
      headers: {
        ...(secret === undefined ? {} : { authorization: `Bearer ${secret}` }),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  return { app, site, signIn, withKey, call, scans, queue, keys, data }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const jsonOf = async (response: Response) => (await response.json()) as Record<string, unknown>

describe('API keys on the account', () => {
  it('makes a key, shows its secret once, keeps only a prefix, and holds to the plan', async () => {
    const { site, signIn } = setup()
    const cookie = await signIn('ali')
    const made = await site('POST', '/api/account/keys', { name: ' CI ' }, cookie)
    expect(made.status).toBe(201)
    const body = await jsonOf(made)
    expect(body.secret).toMatch(API_KEY_PATTERN)
    expect(ApiKeySchema.parse(body.key)).toMatchObject({
      name: 'CI',
      prefix: (body.secret as string).slice(0, 8),
      lastUsedAt: null,
    })
    const listed = await jsonOf(await site('GET', '/api/account/keys', undefined, cookie))
    expect(listed).toMatchObject({ limit: 2, enabled: true })
    expect(JSON.stringify(listed)).not.toContain(body.secret)
    expect(listed.keys).toHaveLength(1)
    expect((await site('POST', '/api/account/keys', { name: 'two' }, cookie)).status).toBe(201)
    const over = await site('POST', '/api/account/keys', { name: 'three' }, cookie)
    expect(over.status).toBe(403)
    expect(await over.json()).toEqual({ error: 'plan-limit', limit: 'apiKeys', plan: 'account' })
  })

  it('wants a session, a name, and the site’s own origin', async () => {
    const { site, signIn, app } = setup()
    const cookie = await signIn('ali')
    expect((await site('GET', '/api/account/keys')).status).toBe(401)
    expect((await site('POST', '/api/account/keys', { name: 'x' })).status).toBe(401)
    for (const bad of [{}, { name: '' }, { name: 'x'.repeat(41) }, { name: 'x', extra: 1 }]) {
      expect((await site('POST', '/api/account/keys', bad, cookie)).status).toBe(400)
    }
    const foreign = await app.request('/api/account/keys', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(foreign.status).toBe(400)
  })

  it('revokes a key for its owner alone, and a revoked key opens nothing', async () => {
    const { site, withKey, call, signIn } = setup()
    const mine = await withKey('ali')
    const theirs = await signIn('omar')
    expect((await call('GET', '/api/v1/tools?limit=1', mine.secret)).status).toBe(200)
    expect((await site('DELETE', `/api/account/keys/${mine.id}`, undefined, theirs)).status).toBe(
      404,
    )
    expect((await call('GET', '/api/v1/tools?limit=1', mine.secret)).status).toBe(200)
    expect(
      (await site('DELETE', `/api/account/keys/${mine.id}`, undefined, mine.cookie)).status,
    ).toBe(204)
    expect(
      (await site('DELETE', `/api/account/keys/${mine.id}`, undefined, mine.cookie)).status,
    ).toBe(404)
    expect(
      (await site('DELETE', '/api/account/keys/not-an-id', undefined, mine.cookie)).status,
    ).toBe(404)
    expect((await call('GET', '/api/v1/tools?limit=1', mine.secret)).status).toBe(401)
  })

  it('is closed by a plan with no API: no key can be made, and the ones made earlier open nothing', async () => {
    const open = setup()
    const first = await open.withKey('ali')
    const closed = setup({ plan: { ARABLYZER_PLAN_ACCOUNT_API_SCANS: '0' } })
    const cookie = await closed.signIn('ali')
    const refused = await closed.site('POST', '/api/account/keys', { name: 'x' }, cookie)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({ error: 'plan-limit', limit: 'api', plan: 'account' })
    expect(
      await jsonOf(await closed.site('GET', '/api/account/keys', undefined, cookie)),
    ).toMatchObject({ enabled: false })
    expect(first.secret).toMatch(API_KEY_PATTERN)
    // A key from another deployment's store is unknown here: 401, not 403.
    expect((await closed.call('GET', '/api/v1/tools', first.secret)).status).toBe(401)
  })

  it('is erased with the account', async () => {
    const { site, withKey, call, keys } = setup()
    const { cookie, secret } = await withKey('ali')
    expect((await call('GET', '/api/v1/tools?limit=1', secret)).status).toBe(200)
    const me = (await jsonOf(await site('GET', '/api/account', undefined, cookie))).id as string
    expect(await keys.list(me)).toHaveLength(1)
    expect((await site('DELETE', '/api/account', { confirm: true }, cookie)).status).toBe(204)
    expect((await call('GET', '/api/v1/tools?limit=1', secret)).status).toBe(401)
    expect(await keys.list(me)).toEqual([])
  })

  it('is not there with accounts off', async () => {
    const { site } = setup({ accounts: false })
    expect((await site('GET', '/api/account/keys')).status).toBe(404)
  })
})

describe('authentication', () => {
  it('wants a key, in the bearer form, and answers every failure alike', async () => {
    const { call, withKey, app } = setup()
    const { secret, cookie } = await withKey('ali')
    const answers = [
      await call('GET', '/api/v1/tools'),
      await call('GET', '/api/v1/tools', 'arb_short'),
      await call('GET', '/api/v1/tools', `arb_${'a'.repeat(43)}`),
      await call('GET', '/api/v1/tools', `${secret}x`),
      await app.request('/api/v1/tools', { headers: { authorization: `Basic ${secret}` } }),
      // A session alone is not a key.
      await app.request('/api/v1/tools', { headers: { cookie } }),
    ]
    for (const answer of answers) {
      expect(answer.status).toBe(401)
      expect(answer.headers.get('www-authenticate')).toBe('Bearer')
      expect(V1Error.parse(await answer.json()).error.code).toBe('unauthorized')
    }
    expect((await call('GET', '/api/v1/tools?limit=1', secret)).status).toBe(200)
  })

  it('notes a key’s use, and stops a visitor who keeps trying keys nobody holds', async () => {
    const { call, withKey, site } = setup()
    const { secret, cookie } = await withKey('ali')
    await call('GET', '/api/v1/tools?limit=1', secret)
    const listed = await jsonOf(await site('GET', '/api/account/keys', undefined, cookie))
    expect((listed.keys as { lastUsedAt: string | null }[])[0]?.lastUsedAt).not.toBeNull()
    // 60 failures are the visitor’s hour (DEVELOPMENT_LIMITS.attempts).
    let last = 0
    for (let i = 0; i < 70; i++)
      last = (await call('GET', '/api/v1/tools', `arb_${'b'.repeat(43)}`)).status
    expect(last).toBe(429)
    // The same visitor is stopped even with a good key: the failures are counted by address.
    expect((await call('GET', '/api/v1/tools', secret)).status).toBe(429)
  })

  it('answers 503 accounts_off with accounts off, and still serves the document', async () => {
    const { call } = setup({ accounts: false })
    const off = await call('GET', '/api/v1/tools', `arb_${'a'.repeat(43)}`)
    expect(off.status).toBe(503)
    expect(V1Error.parse(await off.json()).error.code).toBe('accounts_off')
    expect(
      (await call('POST', '/api/v1/scans', undefined, { url: 'https://example.com' })).status,
    ).toBe(503)
    expect((await call('GET', '/api/v1/openapi.json')).status).toBe(200)
  })

  it('budgets a key’s requests per minute, with headers that say so', async () => {
    const { call, withKey } = setup({ plan: { ARABLYZER_PLAN_ACCOUNT_API_REQUESTS: '3' } })
    const { secret } = await withKey('ali')
    const first = await call('GET', '/api/v1/tools?limit=1', secret)
    expect(first.headers.get('ratelimit-limit')).toBe('3')
    expect(first.headers.get('ratelimit-remaining')).toBe('2')
    expect(Number(first.headers.get('ratelimit-reset'))).toBeGreaterThan(0)
    await call('GET', '/api/v1/tools?limit=1', secret)
    await call('GET', '/api/v1/tools?limit=1', secret)
    const over = await call('GET', '/api/v1/tools?limit=1', secret)
    expect(over.status).toBe(429)
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(V1Error.parse(await over.json()).error).toMatchObject({ code: 'rate_limited' })
  })
})

describe('starting a scan', () => {
  it('queues it, tells the account’s quota, and gives the deletion token once', async () => {
    const { call, withKey, queue, scans } = setup()
    const { secret } = await withKey('ali')
    const response = await call('POST', '/api/v1/scans', secret, { url: 'https://example.com/a' })
    expect(response.status).toBe(202)
    expect(response.headers.get('x-scans-limit')).toBe('4')
    expect(response.headers.get('x-scans-remaining')).toBe('3')
    const { data } = one(V1ScanStarted).parse(await response.json())
    expect(data).toMatchObject({
      url: 'https://example.com/a',
      state: 'queued',
      reused: false,
      tool: null,
    })
    expect(data.deleteToken).toMatch(DELETE_TOKEN_PATTERN)
    expect(data.links).toEqual({
      status: `/api/v1/scans/${data.id}`,
      report: `/api/v1/scans/${data.id}/report`,
      page: `${SITE.origin}/r/${data.id}`,
    })
    expect((await scans.get(data.id))?.state).toBe('queued')
    expect(await queue.waiting()).toBe(1)
    // The token deletes the report through the route that has always done so.
    const gone = await call('DELETE', `/api/reports/${data.id}`, data.deleteToken)
    expect(gone.status).toBe(204)
  })

  it('returns the account’s own scan of the same page made a moment ago, for nothing', async () => {
    const { call, withKey, queue } = setup()
    const { secret } = await withKey('ali')
    const first = one(V1ScanStarted).parse(
      await (await call('POST', '/api/v1/scans', secret, { url: 'https://example.com/a' })).json(),
    ).data
    const again = await call('POST', '/api/v1/scans', secret, { url: 'https://EXAMPLE.com/a' })
    expect(again.status).toBe(200)
    expect(one(V1ScanStarted).parse(await again.json()).data).toMatchObject({
      id: first.id,
      reused: true,
    })
    expect(again.headers.get('x-scans-remaining')).toBeNull()
    expect(await queue.waiting()).toBe(1)
    // Another page is another scan, and the quota went down once for each scan made.
    const other = await call('POST', '/api/v1/scans', secret, { url: 'https://example.com/b' })
    expect(other.status).toBe(202)
    expect(other.headers.get('x-scans-remaining')).toBe('2')
  })

  it('does not reuse another account’s scan, nor a failed one', async () => {
    const { call, withKey, scans } = setup()
    const ali = await withKey('ali')
    const omar = await withKey('omar')
    const mine = one(V1ScanStarted).parse(
      await (
        await call('POST', '/api/v1/scans', ali.secret, { url: 'https://example.com/a' })
      ).json(),
    ).data
    const theirs = one(V1ScanStarted).parse(
      await (
        await call('POST', '/api/v1/scans', omar.secret, { url: 'https://example.com/a' })
      ).json(),
    ).data
    expect(theirs.id).not.toBe(mine.id)
    await scans.fail(mine.id, new Date())
    const retried = one(V1ScanStarted).parse(
      await (
        await call('POST', '/api/v1/scans', ali.secret, { url: 'https://example.com/a' })
      ).json(),
    ).data
    expect(retried).toMatchObject({ reused: false })
    expect(retried.id).not.toBe(mine.id)
  })

  it('shares the website’s bucket: one allowance, and the API’s share is a cap inside it', async () => {
    const shared = setup()
    const { secret, cookie } = await shared.withKey('ali')
    // The website takes one of the four; the API has the other three and no more.
    expect(
      (
        await shared.site(
          'POST',
          '/api/scans',
          { url: 'https://example.com/site', turnstileToken: 't' },
          cookie,
        )
      ).status,
    ).toBe(202)
    for (const n of [1, 2, 3]) {
      expect(
        (
          await shared.call('POST', '/api/v1/scans', secret, {
            url: `https://example.com/${String(n)}`,
          })
        ).status,
      ).toBe(202)
    }
    const empty = await shared.call('POST', '/api/v1/scans', secret, {
      url: 'https://example.com/4',
    })
    expect(empty.status).toBe(429)
    expect(V1Error.parse(await empty.json()).error.code).toBe('rate_limited')
    expect(Number(empty.headers.get('retry-after'))).toBeGreaterThan(0)

    const capped = setup({ plan: { ARABLYZER_PLAN_ACCOUNT_API_SCANS: '1' } })
    const key = await capped.withKey('ali')
    const one_ = await capped.call('POST', '/api/v1/scans', key.secret, {
      url: 'https://example.com/1',
    })
    expect(one_.status).toBe(202)
    expect(one_.headers.get('x-scans-limit')).toBe('1')
    expect(
      (await capped.call('POST', '/api/v1/scans', key.secret, { url: 'https://example.com/2' }))
        .status,
    ).toBe(429)
    // The cap holds the API, not the website: the account's other three are still its own.
    expect(
      (
        await capped.site(
          'POST',
          '/api/scans',
          { url: 'https://example.com/w', turnstileToken: 't' },
          key.cookie,
        )
      ).status,
    ).toBe(202)
  })

  it('renders in the engines asked for, as a one-off that history and reuse never see', async () => {
    const { call, withKey, queue, site } = setup()
    const { secret, cookie } = await withKey('ali')
    const subset = await call('POST', '/api/v1/scans', secret, {
      url: 'https://example.com/a',
      engines: ['webkit', 'chromium', 'webkit'],
    })
    expect(subset.status).toBe(202)
    const job = await queue.take(AbortSignal.timeout(500))
    expect(job).toMatchObject({ engines: ['chromium', 'webkit'] })
    const history = await jsonOf(await site('GET', '/api/account/scans', undefined, cookie))
    expect(history.scans).toHaveLength(0)
    // The same page with every engine is not answered by the subset scan.
    const all = await call('POST', '/api/v1/scans', secret, {
      url: 'https://example.com/a',
      engines: ['chromium', 'firefox', 'webkit'],
    })
    expect(all.status).toBe(202)
    expect((await queue.take(AbortSignal.timeout(500)))?.engines).toBeUndefined()
    expect(
      (await jsonOf(await site('GET', '/api/account/scans', undefined, cookie))).scans,
    ).toHaveLength(1)
  })

  it('refuses what a scan refuses, in the API’s words', async () => {
    const { call, withKey } = setup()
    const { secret } = await withKey('ali')
    const refused = async (body: unknown, headers = {}) => {
      const response = await call('POST', '/api/v1/scans', secret, body, headers)
      return { status: response.status, error: V1Error.parse(await response.json()).error }
    }
    expect(await refused({ url: 'not a url' })).toMatchObject({
      status: 400,
      error: { code: 'invalid_url', details: { reason: 'invalid-url' } },
    })
    expect(await refused({ url: 'ftp://example.com/' })).toMatchObject({
      status: 400,
      error: { code: 'invalid_url' },
    })
    expect(await refused({ url: 'http://localhost/' })).toMatchObject({
      status: 422,
      error: { code: 'blocked_target', details: { reason: 'blocked-host' } },
    })
    for (const bad of [
      {},
      { url: '' },
      { url: 'https://example.com', engines: [] },
      { url: 'https://example.com', tool: 'rtl-check' },
    ]) {
      expect(await refused(bad)).toMatchObject({ status: 400, error: { code: 'invalid_request' } })
    }
    expect(
      (
        await call(
          'POST',
          '/api/v1/scans',
          secret,
          { url: 'https://example.com' },
          { 'content-type': 'text/plain' },
        )
      ).status,
    ).toBe(400)
    const raw = await call('POST', '/api/v1/scans', secret)
    expect(raw.status).toBe(400)
    const huge = await call('POST', '/api/v1/scans', secret, {
      url: `https://example.com/${'a'.repeat(9000)}`,
    })
    expect(huge.status).toBe(400)
  })
})

describe('reading scans', () => {
  it('tells a scan’s state and its report once it has one', async () => {
    const { call, withKey, scans } = setup()
    const { secret } = await withKey('ali')
    const started = one(V1ScanStarted).parse(
      await (await call('POST', '/api/v1/scans', secret, { url: 'https://example.com/a' })).json(),
    ).data
    const waiting = await call('GET', `/api/v1/scans/${started.id}/report`, secret)
    expect(waiting.status).toBe(409)
    expect(V1Error.parse(await waiting.json()).error).toMatchObject({
      code: 'report_not_ready',
      details: { state: 'queued' },
    })
    await scans.start(started.id, new Date())
    await scans.finish(started.id, reportOf(81), new Date())
    const status = one(V1Scan).parse(
      await (await call('GET', `/api/v1/scans/${started.id}`, secret)).json(),
    ).data
    expect(status).toMatchObject({ state: 'complete', score: 81 })
    const report = await jsonOf(await call('GET', `/api/v1/scans/${started.id}/report`, secret))
    expect((report.data as { score: { overall: number } }).score.overall).toBe(81)
  })

  it('says a failed scan has no report, and an unknown scan is not found', async () => {
    const { call, withKey, scans } = setup()
    const { secret } = await withKey('ali')
    const started = one(V1ScanStarted).parse(
      await (await call('POST', '/api/v1/scans', secret, { url: 'https://example.com/a' })).json(),
    ).data
    await scans.fail(started.id, new Date())
    const failed = await call('GET', `/api/v1/scans/${started.id}/report`, secret)
    expect(failed.status).toBe(409)
    expect(V1Error.parse(await failed.json()).error.message).toMatch(/failed/)
    for (const path of [
      '/api/v1/scans/AbCdEfGhIjKlMnOpQrSt_-',
      '/api/v1/scans/short',
      '/api/v1/nothing',
    ]) {
      const missing = await call('GET', path, secret)
      expect(missing.status).toBe(404)
      expect(V1Error.parse(await missing.json()).error.code).toBe('not_found')
    }
  })

  it('lists the account’s scans, newest first, a page at a time', async () => {
    const { call, withKey } = setup({ plan: { ARABLYZER_PLAN_ACCOUNT_SCANS: '10' } })
    const { secret } = await withKey('ali')
    const ids: string[] = []
    for (const n of [1, 2, 3]) {
      const made = await call('POST', '/api/v1/scans', secret, {
        url: `https://example.com/${String(n)}`,
      })
      ids.push(one(V1ScanStarted).parse(await made.json()).data.id)
      await new Promise((resolve) => setTimeout(resolve, 3))
    }
    const first = many(V1Scan).parse(
      await (await call('GET', '/api/v1/scans?limit=2', secret)).json(),
    )
    expect(first.data.map((scan) => scan.id)).toEqual([ids[2], ids[1]])
    expect(first.meta.nextCursor).not.toBeNull()
    const second = many(V1Scan).parse(
      await (
        await call('GET', `/api/v1/scans?limit=2&cursor=${first.meta.nextCursor ?? ''}`, secret)
      ).json(),
    )
    expect(second.data.map((scan) => scan.id)).toEqual([ids[0]])
    expect(second.meta.nextCursor).toBeNull()
    expect((await call('GET', '/api/v1/scans?cursor=!!!', secret)).status).toBe(400)
    expect((await call('GET', '/api/v1/scans?limit=0', secret)).status).toBe(400)
    expect((await call('GET', '/api/v1/scans?limit=101', secret)).status).toBe(400)
    expect((await call('GET', '/api/v1/scans?x=1', secret)).status).toBe(400)
  })
})

describe('tools and rules', () => {
  it('lists every tool across pages, and runs one on a page', async () => {
    const { call, withKey, queue } = setup()
    const { secret } = await withKey('ali')
    const slugs: string[] = []
    let cursor: string | null = ''
    while (cursor !== null) {
      const page = many(V1Tool).parse(
        await (
          await call(
            'GET',
            `/api/v1/tools?limit=25${cursor === '' ? '' : `&cursor=${cursor}`}`,
            secret,
          )
        ).json(),
      )
      slugs.push(...page.data.map((tool) => tool.slug))
      cursor = page.meta.nextCursor
    }
    expect(slugs).toEqual(TOOL_DEFINITIONS.map((tool) => tool.slug))
    const run = await call('POST', '/api/v1/tools/robots-check/runs', secret, {
      url: 'https://example.com/',
    })
    expect(run.status).toBe(202)
    expect(one(V1ScanStarted).parse(await run.json()).data).toMatchObject({
      tool: 'robots-check',
      reused: false,
    })
    expect(await queue.take(AbortSignal.timeout(500))).toMatchObject({ tool: 'robots-check' })
  })

  it('refuses a tool that is not there, and one that runs in the browser', async () => {
    const { call, withKey } = setup()
    const { secret } = await withKey('ali')
    expect(
      (await call('POST', '/api/v1/tools/nope/runs', secret, { url: 'https://example.com/' }))
        .status,
    ).toBe(404)
    expect(
      (await call('POST', '/api/v1/tools/Not_A_Slug/runs', secret, { url: 'https://example.com/' }))
        .status,
    ).toBe(404)
    const paste = TOOL_DEFINITIONS.find((tool) => tool.kind === 'paste')
    expect(paste).toBeDefined()
    const refused = await call('POST', `/api/v1/tools/${paste?.slug ?? ''}/runs`, secret, {
      url: 'https://example.com/',
    })
    expect(refused.status).toBe(400)
    expect(
      (
        await call('POST', '/api/v1/tools/robots-check/runs', secret, {
          url: 'https://example.com/',
          engines: ['chromium'],
        })
      ).status,
    ).toBe(400)
  })

  it('lists the rules and explains one in both languages', async () => {
    const { call, withKey } = setup()
    const { secret } = await withKey('ali')
    const page = many(V1Rule).parse(
      await (await call('GET', '/api/v1/rules?limit=100', secret)).json(),
    )
    expect(page.data.length).toBeGreaterThan(50)
    const id = page.data[0]?.id ?? ''
    const detail = one(V1RuleDetail).parse(
      await (await call('GET', `/api/v1/rules/${id}`, secret)).json(),
    ).data
    expect(detail.copy.ar.why.length).toBeGreaterThan(10)
    expect(detail.copy.en.fix.length).toBeGreaterThan(10)
    expect((await call('GET', '/api/v1/rules/no-such-rule', secret)).status).toBe(404)
  })
})

describe('the OpenAPI document', () => {
  it('is served as JSON, with the site as its server', async () => {
    const { call } = setup()
    const response = await call('GET', '/api/v1/openapi.json')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    const doc = await jsonOf(response)
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.servers).toEqual([{ url: SITE.origin }])
    expect(doc).toEqual(
      JSON.parse(
        JSON.stringify(buildOpenApi({ reportSchema: reportJsonSchema(), server: SITE.origin })),
      ),
    )
  })

  it('documents every route the API has under /api/v1, and only those', () => {
    const { app } = setup()
    const doc = buildOpenApi({ reportSchema: reportJsonSchema() }) as {
      paths: Record<string, Record<string, unknown>>
    }
    const routes = new Set(
      app.routes
        .filter((route) => route.path.startsWith('/api/v1/') && route.method !== 'ALL')
        .map(
          (route) => `${route.method.toLowerCase()} ${route.path.replace(/:([A-Za-z]+)/g, '{$1}')}`,
        ),
    )
    const documented = new Set(
      Object.entries(doc.paths).flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => `${method} ${path}`),
      ),
    )
    // The path parameter names differ in places ({id} / {slug} / {ruleId}); the shape is what must agree.
    const shape = (entry: string) => entry.replace(/\{[A-Za-z]+\}/g, '{}')
    expect([...routes].map(shape).sort()).toEqual([...documented].map(shape).sort())
  })
})
