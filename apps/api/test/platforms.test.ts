import { createHash, createHmac } from 'node:crypto'
import { DEFAULT_POLICY, type safeFetch, type SafeFetchOptions } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS } from '@arablyzer/plans'
import type { Report } from '@arablyzer/report-schema'
import {
  hostLimitKey,
  MemoryHandoff,
  MemoryInFlight,
  MemoryPlatformData,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { apiDeps } from '../src/config'
import { createPlatformScheduler } from '../src/platforms/audit'
import { platformsFrom } from '../src/platforms/config'
import { open, seal, sealKeyFrom } from '../src/platforms/crypto'
import { expiryOf, openTokens, storeUrlOf } from '../src/platforms/install'
import { PANEL_CSS, SALLA_SCRIPT } from '../src/platforms/panel'
import { ZID_WEBHOOK_HEADER } from '../src/platforms/zid'
import { reportOf } from './support/reports'

const NOW = new Date('2026-11-06T12:00:00Z')
const SITE = 'https://arablyzer.example'
const MERCHANT = '1234509876'
const ZID_STORE = 'd78468cd-4b44-4fee-a00d-76561f35787c'
const SALLA_SECRET = 'salla-webhook-secret-for-tests-0123456789'
const ZID_SECRET = 'z'.repeat(40)
const SALLA_APP = '12311221'
const ZID_APP = '1292'

const ENV = {
  ARABLYZER_SITE: SITE,
  ARABLYZER_LIMIT_SECRET: 'x'.repeat(40),
  ARABLYZER_PLATFORM_SECRET: 'p'.repeat(40),
}
const SALLA_ENV = {
  ARABLYZER_SALLA: 'on',
  ARABLYZER_SALLA_CLIENT_ID: 'salla-client',
  ARABLYZER_SALLA_CLIENT_SECRET: 'salla-client-secret-value',
  ARABLYZER_SALLA_APP_ID: SALLA_APP,
  ARABLYZER_SALLA_WEBHOOK_SECRET: SALLA_SECRET,
}
const ZID_ENV = {
  ARABLYZER_ZID: 'on',
  ARABLYZER_ZID_CLIENT_ID: 'zid-client',
  ARABLYZER_ZID_CLIENT_SECRET: 'zid-client-secret-value',
  ARABLYZER_ZID_APP_ID: ZID_APP,
  ARABLYZER_ZID_WEBHOOK_SECRET: ZID_SECRET,
}

interface Call {
  readonly url: string
  readonly options: SafeFetchOptions
}

/** Salla's and Zid's endpoints, answered by a fake fetch that notes what it was asked. */
function fakePlatforms() {
  const calls: Call[] = []
  const state = { sallaRefreshOk: true, zidRefreshOk: true, sallaRefreshes: 0, zidRefreshes: 0 }
  const lookups: string[] = []
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
  const bearer = (options: SafeFetchOptions) => options.headers?.authorization ?? ''
  const fetcher = ((url: string, options: SafeFetchOptions) => {
    calls.push({ url, options })
    if (url === 'https://accounts.salla.sa/oauth2/token') {
      const form = options.form ?? {}
      if (form.grant_type === 'authorization_code') {
        return Promise.resolve(
          form.code === 'good-code'
            ? answer(200, {
                access_token: 'salla-access-1',
                refresh_token: 'salla-refresh-1',
                expires: 1209599,
                token_type: 'bearer',
              })
            : answer(400, { error: 'invalid_grant' }),
        )
      }
      if (form.grant_type === 'refresh_token' && state.sallaRefreshOk) {
        state.sallaRefreshes += 1
        return Promise.resolve(
          form.refresh_token === 'salla-refresh-1'
            ? answer(200, {
                access_token: 'salla-access-2',
                refresh_token: 'salla-refresh-2',
                expires_in: 1209599,
              })
            : answer(400, { error: 'invalid_grant' }),
        )
      }
      return Promise.resolve(answer(400, { error: 'invalid_grant' }))
    }
    if (url === 'https://api.salla.dev/admin/v2/store/info') {
      return Promise.resolve(
        bearer(options).startsWith('Bearer salla-access-')
          ? answer(200, {
              data: {
                id: Number(MERCHANT),
                name: 'متجر التجربة',
                domain: 'https://shop.example/ar',
              },
            })
          : answer(401, {}),
      )
    }
    if (url === 'https://api.salla.dev/exchange-authority/v1/introspect') {
      const good =
        options.headers?.['s-source'] === SALLA_APP &&
        (options.json as { token?: string } | undefined)?.token === 'em_tok_good'
      return Promise.resolve(
        good
          ? answer(200, {
              status: 200,
              success: true,
              data: { merchant_id: Number(MERCHANT), user_id: 987654, exp: '2026-11-07T00:00:00Z' },
            })
          : answer(401, { status: 401, success: false, error: { message: 'Decryption failed' } }),
      )
    }
    if (url === 'https://oauth.zid.sa/oauth/token') {
      const form = options.form ?? {}
      if (form.grant_type === 'authorization_code') {
        return Promise.resolve(
          form.code === 'zid-code'
            ? answer(200, {
                token_type: 'Bearer',
                expires_in: 94608000,
                authorization: 'zid-auth-1',
                access_token: 'zid-manager-1',
                refresh_token: 'zid-refresh-1',
              })
            : answer(400, { error: 'invalid_grant' }),
        )
      }
      if (form.grant_type === 'refresh_token' && state.zidRefreshOk) {
        state.zidRefreshes += 1
        return Promise.resolve(
          form.refresh_token === 'zid-refresh-1'
            ? answer(200, {
                token_type: 'Bearer',
                expires_in: 94608000,
                authorization: 'zid-auth-2',
                access_token: 'zid-manager-2',
                refresh_token: 'zid-refresh-2',
              })
            : answer(400, { error: 'invalid_grant' }),
        )
      }
      return Promise.resolve(answer(400, { error: 'invalid_grant' }))
    }
    if (url === 'https://api.zid.sa/v1/managers/account/profile') {
      return Promise.resolve(
        bearer(options) === 'Bearer zid-auth-1' &&
          options.headers?.['x-manager-token'] === 'zid-manager-1'
          ? answer(200, {
              status: 'ok',
              user: { store: { id: 507530, uuid: ZID_STORE, title: 'متجر زد', username: 'wyatt' } },
            })
          : answer(401, {}),
      )
    }
    if (url === 'https://api.zid.sa/v1/managers/embedded-apps-token') {
      lookups.push((options.json as { token: string }).token)
      return Promise.resolve(answer(200, {}))
    }
    return Promise.resolve(answer(404, {}))
  }) as unknown as typeof safeFetch
  return { fetcher, calls, lookups, state }
}

function setup(
  options: {
    env?: Record<string, string>
    salla?: boolean
    zid?: boolean
    resolve?: string
    address?: string | null
  } = {},
) {
  const clock = { now: new Date(NOW) }
  const store = new MemoryScanStore()
  const data = new MemoryPlatformData(store)
  const queue = new MemoryScanQueue()
  const limiter = new MemoryRateLimiter()
  const inFlight = new MemoryInFlight()
  const events = new MemoryScanEvents(20)
  const handoff = new MemoryHandoff(() => clock.now.getTime())
  const fake = fakePlatforms()
  const logged: string[] = []
  const env = {
    ...ENV,
    ...(options.salla === false ? {} : SALLA_ENV),
    ...(options.zid === false ? {} : ZID_ENV),
    ...options.env,
  }
  let count = 0
  const base = apiDeps(
    env,
    { store, queue, events, limiter, inFlight, handoff, platformData: data },
    (text) => logged.push(text),
    { fetcher: fake.fetcher, now: () => clock.now },
  )
  const resolver = () =>
    Promise.resolve([{ address: options.resolve ?? '93.184.215.14', family: 4 as const }])
  const deps = {
    ...base,
    limits: DEVELOPMENT_LIMITS,
    policy: DEFAULT_POLICY,
    resolver,
    address: () => (options.address === undefined ? '203.0.113.9' : options.address),
    now: () => clock.now,
    log: (text: string) => logged.push(text),
  }
  const app = createApp(deps)
  const newId = () => `scan${String(++count).padStart(18, '0')}`
  const scheduler = createPlatformScheduler({
    data,
    store,
    queue,
    events,
    limiter,
    inFlight,
    limits: DEVELOPMENT_LIMITS,
    policy: DEFAULT_POLICY,
    resolver,
    apps: {
      ...(deps.platforms?.salla === undefined ? {} : { salla: deps.platforms.salla.app }),
      ...(deps.platforms?.zid === undefined ? {} : { zid: deps.platforms.zid.app }),
    },
    newId,
    now: () => clock.now,
    random: () => 0,
    log: (text) => logged.push(text),
  })
  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms)
  }
  return { app, deps, data, store, queue, limiter, fake, scheduler, logged, clock, advance }
}

type Deps = ReturnType<typeof setup>['deps']
function platformsOf(deps: Deps) {
  if (deps.platforms === undefined) throw new Error('The apps are off in this test')
  return deps.platforms
}
function sallaOf(deps: Deps) {
  const { salla } = platformsOf(deps)
  if (salla === undefined) throw new Error('Salla is off in this test')
  return salla
}

const sallaSign = (body: string, secret = SALLA_SECRET) =>
  createHmac('sha256', secret).update(body).digest('hex')

const sallaAuthorize = (access = 'salla-access-1', expires = 1793880000) =>
  JSON.stringify({
    event: 'app.store.authorize',
    merchant: Number(MERCHANT),
    created_at: '2026-11-06 12:00:00',
    data: {
      access_token: access,
      expires,
      refresh_token: 'salla-refresh-1',
      scope: 'settings.read offline_access',
      token_type: 'bearer',
    },
  })

const sallaEvent = (event: string) =>
  JSON.stringify({ event, merchant: Number(MERCHANT), created_at: '2026-11-06 12:00:00', data: {} })

type App = ReturnType<typeof setup>['app']

const sallaHook = (app: App, body: string, headers: Record<string, string> = {}) =>
  app.request('/api/platforms/salla/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-salla-signature': sallaSign(body),
      ...headers,
    },
    body,
  })

const zidEvent = (event: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    app_id: Number(ZID_APP),
    store_id: 507530,
    store_uuid: ZID_STORE,
    store_url: 'https://wyatt.example.sa/',
    event_name: event,
    ...extra,
  })

const zidHook = (app: App, body: string, headers: Record<string, string> = {}) =>
  app.request('/api/platforms/zid/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', [ZID_WEBHOOK_HEADER]: ZID_SECRET, ...headers },
    body,
  })

const finished = (overall: number | null = 82): Report =>
  ({
    ...reportOf(overall, [], { categories: { rtl: 90, speed: 64 } }),
    summary: { bySeverity: { critical: 1, serious: 2, moderate: 3, minor: 4, info: 5 } },
  }) as unknown as Report

/** The worker's part: takes the scan the audit queued and finishes it. */
async function finish(store: MemoryScanStore, id: string, report: Report | null = finished()) {
  await store.start(id, NOW)
  if (report === null) await store.fail(id, NOW)
  else await store.finish(id, report, NOW)
}

describe('the apps are off by default', () => {
  const PATHS = ['install', 'callback', 'webhook', 'panel']

  it('has no route of either app, and no store of their data in use, with both flags off', async () => {
    const { app, deps, fake } = setup({ salla: false, zid: false })
    expect(deps.platforms).toBeUndefined()
    for (const platform of ['salla', 'zid']) {
      for (const path of PATHS) {
        for (const method of ['GET', 'POST']) {
          const response = await app.request(`/api/platforms/${platform}/${path}`, { method })
          expect(response.status, `${method} ${platform}/${path}`).toBe(404)
        }
      }
    }
    expect(fake.calls).toEqual([])
  })

  it('gives each app only its own routes', async () => {
    const onlySalla = setup({ zid: false })
    expect((await onlySalla.app.request('/api/platforms/salla/install')).status).toBe(302)
    expect((await onlySalla.app.request('/api/platforms/zid/install')).status).toBe(404)
    expect((await onlySalla.app.request('/api/platforms/zid/panel')).status).toBe(404)
    const onlyZid = setup({ salla: false })
    expect((await onlyZid.app.request('/api/platforms/zid/install')).status).toBe(302)
    expect((await onlyZid.app.request('/api/platforms/salla/install')).status).toBe(404)
  })

  it('treats a flag that is not on or off as a mistake, and names it', () => {
    expect(() => setup({ env: { ARABLYZER_SALLA: 'yes' } })).toThrow(/ARABLYZER_SALLA is on or off/)
  })

  it('starts only with everything an app needs, and says which variable is missing, never its value', () => {
    const without = (name: string) => {
      const env: Record<string, string> = Object.fromEntries(
        Object.entries({ ...ENV, ...SALLA_ENV }).filter(([key]) => key !== name),
      )
      return apiDeps(env, {
        store: new MemoryScanStore(),
        queue: new MemoryScanQueue(),
        events: new MemoryScanEvents(20),
        limiter: new MemoryRateLimiter(),
        inFlight: new MemoryInFlight(),
        handoff: new MemoryHandoff(),
        platformData: new MemoryPlatformData(new MemoryScanStore()),
      })
    }
    for (const name of [
      'ARABLYZER_SALLA_CLIENT_ID',
      'ARABLYZER_SALLA_CLIENT_SECRET',
      'ARABLYZER_SALLA_APP_ID',
      'ARABLYZER_SALLA_WEBHOOK_SECRET',
    ]) {
      expect(() => without(name)).toThrow(name)
    }
    expect(() => without('ARABLYZER_SITE')).toThrow(/needs ARABLYZER_SITE/)
    try {
      without('ARABLYZER_SALLA_APP_ID')
    } catch (error) {
      expect(String(error)).not.toContain('salla-client-secret-value')
    }
  })

  it('wants the platform secret in production and a Zid webhook secret that is long enough', () => {
    const common = {
      production: true,
      siteUrl: new URL(SITE),
      data: new MemoryPlatformData(new MemoryScanStore()),
      handoff: new MemoryHandoff(),
      limiterKey: 'k'.repeat(40),
      policy: DEFAULT_POLICY,
      resolver: () => Promise.resolve([]),
      fetcher: undefined,
      newId: () => 'id',
      log: () => undefined,
    }
    expect(() =>
      platformsFrom({ ...ENV, ...SALLA_ENV, ARABLYZER_PLATFORM_SECRET: '' }, common),
    ).toThrow('ARABLYZER_PLATFORM_SECRET')
    expect(() =>
      platformsFrom({ ...ENV, ...ZID_ENV, ARABLYZER_ZID_WEBHOOK_SECRET: 'short' }, common),
    ).toThrow('ARABLYZER_ZID_WEBHOOK_SECRET')
    expect(platformsFrom({ ...ENV, ...ZID_ENV }, common)?.zid).toBeDefined()
  })
})

describe.each([
  {
    platform: 'salla',
    authorize: 'https://accounts.salla.sa/oauth2/auth',
    token: 'https://accounts.salla.sa/oauth2/token',
    code: 'good-code',
    clientId: 'salla-client',
  },
  {
    platform: 'zid',
    authorize: 'https://oauth.zid.sa/oauth/authorize',
    token: 'https://oauth.zid.sa/oauth/token',
    code: 'zid-code',
    clientId: 'zid-client',
  },
])(
  'the $platform authorization flow and its state',
  ({ platform, authorize, token, code, clientId }) => {
    const exchanges = (calls: Call[]) => calls.filter((call) => call.url === token)

    const start = async (context: ReturnType<typeof setup>) => {
      const response = await context.app.request(`/api/platforms/${platform}/install`)
      const location = new URL(response.headers.get('location') ?? 'about:blank')
      const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
      return { response, location, cookie }
    }
    const callback = (context: ReturnType<typeof setup>, query: string, cookie: string) =>
      context.app.request(`/api/platforms/${platform}/callback?${query}`, { headers: { cookie } })

    it('sends the merchant to the platform with a state, and keeps its twin in a signed, path-bound cookie', async () => {
      const context = setup()
      const { response, location } = await start(context)
      expect(response.status).toBe(302)
      expect(`${location.origin}${location.pathname}`).toBe(authorize)
      expect(location.searchParams.get('client_id')).toBe(clientId)
      expect(location.searchParams.get('response_type')).toBe('code')
      expect(location.searchParams.get('redirect_uri')).toBe(
        `${SITE}/api/platforms/${platform}/callback`,
      )
      expect(location.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/)
      // Zid has no PKCE: nothing of it is sent.
      expect(location.searchParams.has('code_challenge')).toBe(false)
      const setCookie = response.headers.get('set-cookie') ?? ''
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Lax')
      expect(setCookie).toContain(`Path=/api/platforms/${platform}`)
      expect(setCookie).toContain('Secure')
      expect(location.href).not.toContain('client-secret')
    })

    it('refuses a callback with no cookie, a wrong state, another app’s cookie or an old one, and spends no code', async () => {
      const context = setup()
      const first = await start(context)
      const state = first.location.searchParams.get('state') ?? ''

      expect((await callback(context, `code=${code}&state=${state}`, '')).status).toBe(400)
      expect((await callback(context, `code=${code}&state=forged`, first.cookie)).status).toBe(400)
      expect((await callback(context, `code=${code}`, first.cookie)).status).toBe(400)

      const other = platform === 'salla' ? 'zid' : 'salla'
      const foreign = await context.app.request(`/api/platforms/${other}/install`)
      const foreignCookie = (foreign.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
      const foreignState = new URL(
        foreign.headers.get('location') ?? 'about:blank',
      ).searchParams.get('state')
      // The other app's cookie carries the other app's name: it opens nothing here.
      expect(
        (
          await callback(
            context,
            `code=${code}&state=${foreignState ?? ''}`,
            foreignCookie.replace(`arablyzer_${other}`, `arablyzer_${platform}`),
          )
        ).status,
      ).toBe(400)

      context.advance(11 * 60 * 1000)
      expect((await callback(context, `code=${code}&state=${state}`, first.cookie)).status).toBe(
        400,
      )
      expect(exchanges(context.fake.calls)).toEqual([])
      expect(
        await context.data.get(
          platform === 'salla' ? 'salla' : 'zid',
          platform === 'salla' ? MERCHANT : ZID_STORE,
        ),
      ).toBeNull()
    })

    it('refuses a denial and a code that is not a code', async () => {
      const context = setup()
      const { cookie, location } = await start(context)
      const state = location.searchParams.get('state') ?? ''
      expect((await callback(context, `error=access_denied&state=${state}`, cookie)).status).toBe(
        400,
      )
      // The state was spent by that attempt: a second try with it fails too.
      expect((await callback(context, `code=${code}&state=${state}`, cookie)).status).toBe(400)
      const again = await start(context)
      const next = again.location.searchParams.get('state') ?? ''
      expect((await callback(context, `code=%00%00&state=${next}`, again.cookie)).status).toBe(400)
      expect(exchanges(context.fake.calls)).toEqual([])
    })

    it('takes the tokens once, seals them, and refuses the same callback a second time', async () => {
      const context = setup()
      const { cookie, location } = await start(context)
      const state = location.searchParams.get('state') ?? ''
      const done = await callback(context, `code=${code}&state=${state}`, cookie)
      expect(done.status).toBe(platform === 'salla' ? 200 : 302)
      if (platform === 'zid') {
        expect(done.headers.get('location')).toBe(
          `https://dashboard.zid.sa/ar-sa/stores/1/apps/${ZID_APP}/embedded`,
        )
      }
      const form = exchanges(context.fake.calls)[0]?.options.form
      expect(form?.code).toBe(code)
      expect(form?.client_id).toBe(clientId)
      expect(form?.redirect_uri).toBe(`${SITE}/api/platforms/${platform}/callback`)

      const install = await context.data.get(
        platform === 'salla' ? 'salla' : 'zid',
        platform === 'salla' ? MERCHANT : ZID_STORE,
      )
      expect(install).not.toBeNull()
      // Sealed: nothing of a token is readable in what the store holds.
      const kept = JSON.stringify(install)
      for (const secret of [
        'salla-access-1',
        'salla-refresh-1',
        'zid-auth-1',
        'zid-manager-1',
        'zid-refresh-1',
      ]) {
        expect(kept).not.toContain(secret)
      }
      const tokens =
        install === null ? null : openTokens(platformsOf(context.deps).context, install)
      expect(tokens?.access).toBe(platform === 'salla' ? 'salla-access-1' : 'zid-auth-1')
      expect(tokens?.refresh).toBe(platform === 'salla' ? 'salla-refresh-1' : 'zid-refresh-1')
      expect(tokens?.manager ?? null).toBe(platform === 'salla' ? null : 'zid-manager-1')
      expect(install?.status).toBe('active')
      expect(install?.refreshDueAt).not.toBeNull()
      if (platform === 'salla') {
        expect(install?.storeUrl).toBe('https://shop.example/ar')
        expect(install?.auditDueAt).not.toBeNull()
      }

      // Replayed: the same cookie and state again are refused, and no second exchange is made.
      expect((await callback(context, `code=${code}&state=${state}`, cookie)).status).toBe(400)
      expect(exchanges(context.fake.calls)).toHaveLength(1)
      // The merchant sees no code and no token in any page or address of the flow.
      expect(done.headers.get('location') ?? '').not.toContain(code)
    })

    it('does not install when the platform refuses the code', async () => {
      const context = setup()
      const { cookie, location } = await start(context)
      const state = location.searchParams.get('state') ?? ''
      const refused = await callback(context, `code=bad-code&state=${state}`, cookie)
      expect(refused.status).toBe(400)
      expect(await refused.text()).toContain('تعذّر إكمال الربط')
      expect(
        await context.data.get(
          platform === 'salla' ? 'salla' : 'zid',
          platform === 'salla' ? MERCHANT : ZID_STORE,
        ),
      ).toBeNull()
    })
  },
)

describe('the Salla webhook and its signature', () => {
  it('takes a signed app.store.authorize, keeps the sealed tokens and asks for the store’s audit', async () => {
    const { app, data, deps } = setup()
    const body = sallaAuthorize()
    const response = await sallaHook(app, body)
    expect(response.status).toBe(200)
    const install = await data.get('salla', MERCHANT)
    expect(install?.storeUrl).toBe('https://shop.example/ar')
    expect(install?.storeName).toBe('متجر التجربة')
    expect(install?.auditDueAt).not.toBeNull()
    expect(JSON.stringify(install)).not.toContain('salla-access-1')
    expect(install === null ? null : openTokens(platformsOf(deps).context, install)?.access).toBe(
      'salla-access-1',
    )
  })

  it('refuses a wrong signature, a missing one, one for another body and one made with another secret', async () => {
    const { app, data, fake } = setup()
    const body = sallaAuthorize()
    for (const headers of [
      { 'x-salla-signature': 'f'.repeat(64) },
      { 'x-salla-signature': '' },
      { 'x-salla-signature': sallaSign(`${body} `) },
      { 'x-salla-signature': sallaSign(body, 'another-secret-entirely-0123456789') },
      { 'x-salla-signature': sallaSign(body).slice(0, 63) },
    ]) {
      const response = await sallaHook(app, body, headers)
      expect(response.status).toBe(401)
    }
    const unsigned = await app.request('/api/platforms/salla/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    expect(unsigned.status).toBe(401)
    expect(await data.get('salla', MERCHANT)).toBeNull()
    // Nothing was read of a request that was not Salla's: no call went out for it.
    expect(fake.calls).toEqual([])
  })

  it('checks the signature before it reads the body, so a body that is not JSON is 400 only when signed', async () => {
    const { app } = setup()
    expect((await sallaHook(app, 'not json')).status).toBe(400)
    expect((await sallaHook(app, 'not json', { 'x-salla-signature': 'f'.repeat(64) })).status).toBe(
      401,
    )
  })

  it('refuses a body past the limit before looking at it', async () => {
    const { app } = setup()
    const big = JSON.stringify({ event: 'x', merchant: 1, pad: 'a'.repeat(300 * 1024) })
    expect((await sallaHook(app, big)).status).toBe(413)
  })

  it('answers 400 for a payload with no event or a merchant that is not a number', async () => {
    const { app } = setup()
    expect((await sallaHook(app, JSON.stringify({ merchant: 1 }))).status).toBe(400)
    expect(
      (await sallaHook(app, JSON.stringify({ event: 'app.installed', merchant: 'x/../y' }))).status,
    ).toBe(400)
    expect(
      (
        await sallaHook(
          app,
          JSON.stringify({ event: 'app.store.authorize', merchant: 1, data: {} }),
        )
      ).status,
    ).toBe(400)
  })

  it('takes events that are not its own with a 200 and no change', async () => {
    const { app, data } = setup()
    const response = await sallaHook(app, sallaEvent('order.created'))
    expect(response.status).toBe(200)
    expect(await data.get('salla', MERCHANT)).toBeNull()
  })

  it('does not let older tokens, replayed, overwrite the newer ones', async () => {
    const { app, data, deps } = setup()
    await sallaHook(app, sallaAuthorize('salla-access-2', 1793880000 + 86400))
    await sallaHook(app, sallaAuthorize('salla-access-1', 1793880000))
    const install = await data.get('salla', MERCHANT)
    expect(install === null ? null : openTokens(platformsOf(deps).context, install)?.access).toBe(
      'salla-access-2',
    )
  })

  it('answers 503, so Salla delivers again, when the store fails', async () => {
    const { app, data } = setup()
    data.upsert = () => Promise.reject(new Error('database down'))
    expect((await sallaHook(app, sallaAuthorize())).status).toBe(503)
  })

  it('checks the signature the way the owner chose, and never lets the other way in', async () => {
    const token = setup({ env: { ARABLYZER_SALLA_WEBHOOK_STRATEGY: 'token' } })
    const body = sallaAuthorize()
    expect((await sallaHook(token.app, body, { authorization: SALLA_SECRET })).status).toBe(200)
    expect((await sallaHook(token.app, body, { authorization: 'wrong' })).status).toBe(401)
    // The signature does not stand in for the token.
    expect(
      (
        await token.app.request('/api/platforms/salla/webhook', {
          method: 'POST',
          headers: { 'x-salla-signature': sallaSign(body) },
          body,
        })
      ).status,
    ).toBe(401)
    // And the token does not stand in for the signature.
    const signature = setup()
    expect(
      (
        await signature.app.request('/api/platforms/salla/webhook', {
          method: 'POST',
          headers: { authorization: SALLA_SECRET, 'x-salla-security-strategy': 'token' },
          body,
        })
      ).status,
    ).toBe(401)
    expect(() => setup({ env: { ARABLYZER_SALLA_WEBHOOK_STRATEGY: 'none' } })).toThrow(
      'signature or token',
    )
  })
})

describe('the Zid webhook and its secret header', () => {
  it('takes the install event and asks for the store’s audit', async () => {
    const { app, data } = setup()
    const response = await zidHook(app, zidEvent('app.market.application.install'))
    expect(response.status).toBe(200)
    const install = await data.get('zid', ZID_STORE)
    expect(install?.storeUrl).toBe('https://wyatt.example.sa/')
    expect(install?.auditDueAt).not.toBeNull()
  })

  it('refuses a wrong or missing secret, a secret in another header, and one of another length', async () => {
    const { app, data } = setup()
    const body = zidEvent('app.market.application.install')
    for (const headers of [
      { [ZID_WEBHOOK_HEADER]: 'wrong' },
      { [ZID_WEBHOOK_HEADER]: '' },
      { [ZID_WEBHOOK_HEADER]: `${ZID_SECRET}x` },
      { [ZID_WEBHOOK_HEADER]: ZID_SECRET.slice(1) },
    ]) {
      expect((await zidHook(app, body, headers)).status).toBe(401)
    }
    const other = await app.request('/api/platforms/zid/webhook', {
      method: 'POST',
      headers: { authorization: `Bearer ${ZID_SECRET}`, 'x-webhook-token': ZID_SECRET },
      body,
    })
    expect(other.status).toBe(401)
    expect(await data.get('zid', ZID_STORE)).toBeNull()
  })

  it('leaves the events of another app, and the subscription events, alone', async () => {
    const { app, data } = setup()
    expect(
      (await zidHook(app, zidEvent('app.market.application.install', { app_id: 9999 }))).status,
    ).toBe(200)
    expect((await zidHook(app, zidEvent('app.market.subscription.active'))).status).toBe(200)
    expect(await data.get('zid', ZID_STORE)).toBeNull()
    expect(
      (await zidHook(app, JSON.stringify({ event_name: 'app.market.application.install' }))).status,
    ).toBe(400)
    expect((await zidHook(app, 'nope')).status).toBe(400)
  })
})

describe('uninstalling deletes the merchant’s tokens and data', () => {
  it('Salla: the install, its sealed tokens, its audits’ scans and its reports are gone, and the panel says so', async () => {
    const { app, data, store, scheduler, advance } = setup()
    await sallaHook(app, sallaAuthorize())
    const other = JSON.stringify({ event: 'app.installed', merchant: 777, data: {} })
    await sallaHook(app, other)
    await scheduler.tick()
    const audit = await data.latestAudit((await data.get('salla', MERCHANT))?.id ?? '')
    expect(audit).not.toBeNull()
    await finish(store, audit?.scanId ?? '')
    expect(await store.get(audit?.scanId ?? '')).not.toBeNull()

    expect((await sallaHook(app, sallaEvent('app.uninstalled'))).status).toBe(200)
    expect(await data.get('salla', MERCHANT)).toBeNull()
    expect(await store.get(audit?.scanId ?? '')).toBeNull()
    // The panel opens for nobody now, though Salla still vouches for the token.
    const panel = await app.request('/api/platforms/salla/panel?token=em_tok_good')
    expect(panel.status).toBe(404)
    expect(await panel.text()).toContain('هذا المتجر غير مرتبط بالتطبيق')
    // Told twice, it is the same; and another store is untouched.
    expect((await sallaHook(app, sallaEvent('app.uninstalled'))).status).toBe(200)
    expect(await data.get('salla', '777')).not.toBeNull()
    // A new install starts clean.
    advance(1000)
    await sallaHook(app, sallaAuthorize())
    expect((await data.get('salla', MERCHANT))?.lastAuditAt).toBeNull()
  })

  it('Zid: the install, the panel’s lookup token, the audits and the reports are gone', async () => {
    const { app, data, store, scheduler, fake } = setup()
    const start = await app.request('/api/platforms/zid/install')
    const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    const state = new URL(start.headers.get('location') ?? 'about:blank').searchParams.get('state')
    await app.request(`/api/platforms/zid/callback?code=zid-code&state=${state ?? ''}`, {
      headers: { cookie },
    })
    await zidHook(app, zidEvent('app.market.application.install'))
    await scheduler.tick()
    const install = await data.get('zid', ZID_STORE)
    const audit = await data.latestAudit(install?.id ?? '')
    expect(audit).not.toBeNull()
    await finish(store, audit?.scanId ?? '')
    const lookup = fake.lookups[0] ?? ''
    expect((await app.request(`/api/platforms/zid/panel?token=${lookup}`)).status).toBe(200)

    expect((await zidHook(app, zidEvent('app.market.application.uninstall'))).status).toBe(200)
    expect(await data.get('zid', ZID_STORE)).toBeNull()
    expect(await data.byEmbedHash(createHash('sha256').update(lookup).digest('hex'))).toBeNull()
    expect(await store.get(audit?.scanId ?? '')).toBeNull()
    expect((await app.request(`/api/platforms/zid/panel?token=${lookup}`)).status).toBe(404)
    expect((await zidHook(app, zidEvent('app.market.application.uninstall'))).status).toBe(200)
  })
})

describe('the store audit follows the public scan’s rules', () => {
  const install = async (context: ReturnType<typeof setup>, url = 'https://shop.example/ar') => {
    await context.data.upsert({
      id: 'install-1',
      platform: 'salla',
      storeKey: MERCHANT,
      patch: { storeUrl: url },
      at: NOW,
    })
    await context.data.scheduleAudit('install-1', NOW)
  }

  it('queues the storefront’s scan, once, and records it against the store', async () => {
    const context = setup()
    await install(context)
    await context.scheduler.tick()
    expect(await context.queue.waiting()).toBe(1)
    const job = context.queue.take(new AbortController().signal)
    const taken = await job
    expect(taken?.url).toBe('https://shop.example/ar')
    const audit = await context.data.latestAudit('install-1')
    expect(audit?.scanId).toBe(taken?.id)
    expect((await context.data.get('salla', MERCHANT))?.auditDueAt).toBeNull()
    // Nothing more is due: another tick queues nothing.
    await context.scheduler.tick()
    expect(await context.queue.waiting()).toBe(0)
  })

  it('refuses a storefront that resolves to a private address, as a scan that failed', async () => {
    const context = setup({ resolve: '10.0.0.5' })
    await install(context)
    await context.scheduler.tick()
    expect(await context.queue.waiting()).toBe(0)
    const audit = await context.data.latestAudit('install-1')
    expect((await context.store.get(audit?.scanId ?? ''))?.state).toBe('failed')
  })

  it('refuses an address the egress rules refuse before it asks DNS', async () => {
    const context = setup()
    await install(context, 'http://user:pass@shop.example/')
    await context.scheduler.tick()
    expect(await context.queue.waiting()).toBe(0)
    const audit = await context.data.latestAudit('install-1')
    expect((await context.store.get(audit?.scanId ?? ''))?.state).toBe('failed')
  })

  it('puts the audit off, not away, when the host’s bucket is empty', async () => {
    const context = setup()
    await install(context)
    for (let n = 0; n < DEVELOPMENT_LIMITS.perHost.scans; n++) {
      await context.limiter.take(
        hostLimitKey('shop.example'),
        DEVELOPMENT_LIMITS.perHost,
        NOW.getTime(),
      )
    }
    await context.scheduler.tick()
    expect(await context.queue.waiting()).toBe(0)
    const kept = await context.data.get('salla', MERCHANT)
    expect(kept?.auditDueAt?.getTime()).toBeGreaterThan(NOW.getTime())
    expect(kept?.lastAuditAt).toBeNull()
  })

  it('keeps to the lower half of the queue, so a visitor is never behind a store', async () => {
    const context = setup()
    await install(context)
    for (let n = 0; n < DEVELOPMENT_LIMITS.queue / 2; n++) {
      await context.queue.add({ id: `visitor${String(n)}`, url: 'https://other.example/' })
    }
    await context.scheduler.tick()
    expect(await context.queue.waiting()).toBe(DEVELOPMENT_LIMITS.queue / 2)
    expect((await context.data.get('salla', MERCHANT))?.lastAuditAt).toBeNull()
  })

  it('audits a store at most once a day, however many updates the platform sends', async () => {
    const context = setup()
    await sallaHook(context.app, sallaAuthorize())
    await context.scheduler.tick()
    expect(await context.queue.waiting()).toBe(1)
    const first = (await context.data.get('salla', MERCHANT))?.lastAuditAt
    expect(first).toEqual(NOW)
    context.advance(60 * 60 * 1000)
    for (let n = 0; n < 3; n++) await sallaHook(context.app, sallaEvent('app.updated'))
    await context.scheduler.tick()
    expect(await context.queue.waiting()).toBe(1)
    const due = (await context.data.get('salla', MERCHANT))?.auditDueAt
    expect(due?.getTime()).toBe(NOW.getTime() + 24 * 60 * 60 * 1000)
    context.advance(24 * 60 * 60 * 1000)
    await context.scheduler.tick()
    expect(await context.queue.waiting()).toBe(2)
  })

  it('learns a Salla store’s address from Salla when the install event came first', async () => {
    const context = setup()
    await sallaHook(
      context.app,
      JSON.stringify({ event: 'app.installed', merchant: Number(MERCHANT), data: {} }),
    )
    expect((await context.data.get('salla', MERCHANT))?.storeUrl).toBeNull()
    await sallaHook(context.app, sallaAuthorize())
    expect((await context.data.get('salla', MERCHANT))?.storeUrl).toBe('https://shop.example/ar')
  })
})

describe('refreshing tokens', () => {
  const connect = async (context: ReturnType<typeof setup>, platform: 'salla' | 'zid') => {
    const start = await context.app.request(`/api/platforms/${platform}/install`)
    const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    const state = new URL(start.headers.get('location') ?? 'about:blank').searchParams.get('state')
    await context.app.request(
      `/api/platforms/${platform}/callback?code=${platform === 'salla' ? 'good-code' : 'zid-code'}&state=${state ?? ''}`,
      { headers: { cookie } },
    )
    return context.data.get(platform, platform === 'salla' ? MERCHANT : ZID_STORE)
  }

  it('Salla: refreshes before the access token ends, with the single-use refresh token, and only then', async () => {
    const context = setup()
    const before = await connect(context, 'salla')
    context.advance(24 * 60 * 60 * 1000)
    await context.scheduler.tick()
    expect(context.fake.state.sallaRefreshes).toBe(0)
    context.advance(10 * 24 * 60 * 60 * 1000)
    await context.scheduler.tick()
    expect(context.fake.state.sallaRefreshes).toBe(1)
    const after = await context.data.get('salla', MERCHANT)
    const tokens = after === null ? null : openTokens(platformsOf(context.deps).context, after)
    expect(tokens?.access).toBe('salla-access-2')
    expect(tokens?.refresh).toBe('salla-refresh-2')
    expect(after?.refreshDueAt?.getTime()).toBeGreaterThan(before?.refreshDueAt?.getTime() ?? 0)
    await context.scheduler.tick()
    expect(context.fake.state.sallaRefreshes).toBe(1)
  })

  it('Zid: refreshes on a calendar, and keeps the whole new set, the manager token too', async () => {
    const context = setup()
    await connect(context, 'zid')
    context.advance(200 * 24 * 60 * 60 * 1000)
    await context.scheduler.tick()
    expect(context.fake.state.zidRefreshes).toBe(0)
    context.advance(110 * 24 * 60 * 60 * 1000)
    await context.scheduler.tick()
    expect(context.fake.state.zidRefreshes).toBe(1)
    const after = await context.data.get('zid', ZID_STORE)
    const tokens = after === null ? null : openTokens(platformsOf(context.deps).context, after)
    expect(tokens?.access).toBe('zid-auth-2')
    expect(tokens?.manager).toBe('zid-manager-2')
    expect(tokens?.refresh).toBe('zid-refresh-2')
  })

  it('drops the tokens the platform no longer accepts, and the panel asks for a new activation', async () => {
    const context = setup()
    await connect(context, 'salla')
    context.fake.state.sallaRefreshOk = false
    context.advance(12 * 24 * 60 * 60 * 1000)
    await context.scheduler.tick()
    const dropped = await context.data.get('salla', MERCHANT)
    expect(dropped?.sealedTokens).toBeNull()
    expect(dropped?.status).toBe('reauth')
    const panel = await context.app.request('/api/platforms/salla/panel?token=em_tok_good')
    expect(await panel.text()).toContain('انتهى ربط التطبيق بمنصتك')
  })

  it('keeps the tokens and tries again when the platform cannot be reached', async () => {
    const context = setup()
    await connect(context, 'zid')
    context.fake.state.zidRefreshOk = false
    context.advance(310 * 24 * 60 * 60 * 1000)
    await context.scheduler.tick()
    // 400 is the platform saying no; a lease keeps this run from repeating at once.
    expect((await context.data.get('zid', ZID_STORE))?.status).toBe('reauth')
  })
})

describe('the merchant panel', () => {
  const ready = async (context: ReturnType<typeof setup>) => {
    await sallaHook(context.app, sallaAuthorize())
    await context.scheduler.tick()
    const install = await context.data.get('salla', MERCHANT)
    const audit = await context.data.latestAudit(install?.id ?? '')
    return audit?.scanId ?? ''
  }
  const SALLA_PANEL = '/api/platforms/salla/panel?token=em_tok_good'

  it('shows a Salla merchant the latest audit, in Arabic, with a link to the full report', async () => {
    const context = setup()
    const scanId = await ready(context)
    await finish(context.store, scanId)
    const response = await context.app.request(SALLA_PANEL)
    expect(response.status).toBe(200)
    const page = await response.text()
    expect(page).toContain('<html lang="ar" dir="rtl"')
    expect(page).toContain('تقرير متجرك')
    expect(page).toContain('<bdi dir="ltr">82</bdi>')
    expect(page).toContain('<bdi dir="ltr">100</bdi>')
    expect(page).toContain(`href="${SITE}/r/${scanId}"`)
    expect(page).toContain('rel="noopener noreferrer"')
    expect(page).toContain('<bdi dir="ltr">shop.example</bdi>')
    expect(page).toContain('حرجة')
    expect(page).toContain('<bdi dir="ltr">1</bdi>')
  })

  it('shows English when asked, and a dark theme, and links the English report', async () => {
    const context = setup()
    const scanId = await ready(context)
    await finish(context.store, scanId)
    const page = await (await context.app.request(`${SALLA_PANEL}&lang=en&theme=dark`)).text()
    expect(page).toContain('<html lang="en" dir="ltr" data-theme="dark"')
    expect(page).toContain('Your store report')
    expect(page).toContain(`href="${SITE}/en/r/${scanId}"`)
  })

  it('obeys the page rules: no style attribute, hashed script and style, weights 400 and 600, numbers apart', async () => {
    const context = setup()
    const scanId = await ready(context)
    await finish(context.store, scanId)
    for (const lang of ['ar', 'en']) {
      const response = await context.app.request(`${SALLA_PANEL}&lang=${lang}`)
      const page = await response.text()
      const policy = response.headers.get('content-security-policy') ?? ''
      expect(page).not.toMatch(/\sstyle\s*=/i)
      expect(page).not.toMatch(/\son[a-z]+\s*=/i)
      expect(page).not.toContain('javascript:')
      const sha = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`
      expect(policy).toContain(`style-src ${sha(PANEL_CSS)}`)
      expect(policy).toContain(sha(SALLA_SCRIPT))
      expect(page).toContain(`<style>${PANEL_CSS}</style>`)
      expect(page).toContain(`<script>${SALLA_SCRIPT}</script>`)
      // Every script is the inline one named by hash or the SDK, pinned and checked.
      const scripts = [...page.matchAll(/<script\b([^>]*)>/g)].map((match) => match[1] ?? '')
      expect(scripts).toHaveLength(2)
      expect(scripts[0]).toMatch(
        /src="https:\/\/unpkg\.com\/@salla\.sa\/embedded-sdk@\d+\.\d+\.\d+\/dist\/umd\/index\.js"/,
      )
      expect(scripts[0]).toContain('integrity="sha384-')
      expect(policy).toContain('https://unpkg.com/@salla.sa/embedded-sdk@')
      expect(policy).toContain("default-src 'none'")
      expect(policy).toContain('frame-ancestors https://s.salla.sa')
      expect(policy).not.toContain('unsafe-inline')
      const weights = [...PANEL_CSS.matchAll(/font-weight:\s*(\d+)/g)].map((match) => match[1])
      expect(new Set(weights)).toEqual(new Set(['400', '600']))
      expect(PANEL_CSS).not.toMatch(/letter-spacing/)
      expect(PANEL_CSS).not.toMatch(/gradient/)
      // Numbers and addresses are never loose in running text.
      const text = page
        .replace(/<style>[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '')
        .replace(/<bdi dir="ltr">[^<]*<\/bdi>/g, '')
        .replace(/<[^>]+>/g, ' ')
      expect(text).not.toMatch(/\d{2,}/)
    }
  })

  it('says what is happening while the scan runs, and when it failed', async () => {
    const context = setup()
    const scanId = await ready(context)
    expect(await (await context.app.request(SALLA_PANEL)).text()).toContain('نفحص متجرك الآن')
    await finish(context.store, scanId, null)
    expect(await (await context.app.request(SALLA_PANEL)).text()).toContain('تعذّر فحص المتجر')
  })

  it('asks for an audit when a store has none, and says it has not been audited yet', async () => {
    const context = setup()
    await sallaHook(
      context.app,
      JSON.stringify({ event: 'app.installed', merchant: Number(MERCHANT), data: {} }),
    )
    const page = await (await context.app.request(SALLA_PANEL)).text()
    expect(page).toContain('نفحص متجرك الآن')
    expect((await context.data.get('salla', MERCHANT))?.auditDueAt).not.toBeNull()
  })

  it('opens for the merchant Salla names and for nobody else', async () => {
    const context = setup()
    await ready(context)
    const bad = await context.app.request('/api/platforms/salla/panel?token=em_tok_forged')
    expect(bad.status).toBe(401)
    expect(await bad.text()).toContain('انتهت جلسة فتح الصفحة')
    const none = await context.app.request('/api/platforms/salla/panel')
    expect(none.status).toBe(401)
    const call = context.fake.calls.find((entry) => entry.url.endsWith('/introspect'))
    // Salla is asked with the app’s id, so another app’s token does not verify as ours.
    expect(call?.options.headers?.['s-source']).toBe(SALLA_APP)
    // And the token never comes back in a page.
    expect(await (await context.app.request(SALLA_PANEL)).text()).not.toContain('em_tok_good')
  })

  it('answers 503, not an error page of Salla’s, when Salla cannot be asked', async () => {
    const context = setup()
    await ready(context)
    const failing = createApp({
      ...context.deps,
      platforms: {
        ...platformsOf(context.deps),
        salla: {
          ...sallaOf(context.deps),
          introspect: () => Promise.resolve(null),
        },
      },
    })
    const response = await failing.request(SALLA_PANEL)
    expect(response.status).toBe(503)
    expect(await response.text()).toContain('الخدمة غير متاحة الآن')
  })

  it('shows a Zid merchant the audit through the lookup token Zid opens the app with', async () => {
    const context = setup()
    const start = await context.app.request('/api/platforms/zid/install')
    const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    const state = new URL(start.headers.get('location') ?? 'about:blank').searchParams.get('state')
    await context.app.request(`/api/platforms/zid/callback?code=zid-code&state=${state ?? ''}`, {
      headers: { cookie },
    })
    await zidHook(context.app, zidEvent('app.market.application.install'))
    await context.scheduler.tick()
    const install = await context.data.get('zid', ZID_STORE)
    const audit = await context.data.latestAudit(install?.id ?? '')
    await finish(context.store, audit?.scanId ?? '')
    const lookup = context.fake.lookups[0] ?? ''
    expect(lookup).toMatch(/^[0-9a-f-]{36}$/)
    // What Zid is told is the lookup token; what the store keeps is its hash.
    expect(JSON.stringify(install)).not.toContain(lookup)
    const response = await context.app.request(
      `/api/platforms/zid/panel?token=${lookup}&language=ar`,
    )
    expect(response.status).toBe(200)
    const page = await response.text()
    expect(page).toContain('<bdi dir="ltr">82</bdi>')
    expect(page).toContain('متجر زد')
    expect(page).not.toContain('<script')
    const policy = response.headers.get('content-security-policy') ?? ''
    expect(policy).toContain(
      "frame-ancestors 'self' https://*.zid.dev https://web.zid.sa https://dashboard.zid.sa",
    )
    expect(policy).not.toContain('script-src')
    expect(page).not.toMatch(/\sstyle\s*=/i)
    // Anything else is no store.
    for (const token of ['', 'not-a-uuid', '00000000-0000-4000-8000-000000000000']) {
      expect((await context.app.request(`/api/platforms/zid/panel?token=${token}`)).status).toBe(
        404,
      )
    }
  })

  it('is never cached, indexed or sent on with a referrer', async () => {
    const context = setup()
    await ready(context)
    const response = await context.app.request(SALLA_PANEL)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-robots-tag')).toContain('noindex')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(await response.text()).toContain('noindex')
  })

  it('limits what one visitor may ask of the panel, and has nothing for a visitor with no address', async () => {
    const context = setup()
    await ready(context)
    let last = 200
    for (let n = 0; n < 61; n++) last = (await context.app.request(SALLA_PANEL)).status
    expect(last).toBe(429)
    const nowhere = setup({ address: null })
    expect((await nowhere.app.request(SALLA_PANEL)).status).toBe(503)
    expect((await nowhere.app.request('/api/platforms/salla/install')).status).toBe(503)
  })
})

describe('sealing tokens', () => {
  const key = sealKeyFrom('s'.repeat(40))
  const tokens = {
    access: 'access-secret',
    refresh: 'refresh-secret',
    manager: null,
    expiresAt: new Date('2027-01-01T00:00:00Z'),
  }

  it('opens what it sealed for the same store, and leaves nothing readable', () => {
    const sealed = seal(key, 'salla:1', tokens)
    expect(sealed).not.toContain('access-secret')
    expect(Buffer.from(sealed.split('.')[2] ?? '', 'base64url').toString('utf8')).not.toContain(
      'secret',
    )
    expect(open(key, 'salla:1', sealed)).toEqual(tokens)
    expect(seal(key, 'salla:1', tokens)).not.toBe(sealed)
  })

  it('does not open for another store, under another key, or when changed', () => {
    const sealed = seal(key, 'salla:1', tokens)
    expect(open(key, 'salla:2', sealed)).toBeNull()
    expect(open(key, 'zid:1', sealed)).toBeNull()
    expect(open(sealKeyFrom('t'.repeat(40)), 'salla:1', sealed)).toBeNull()
    const [version, iv, body, tag] = sealed.split('.')
    const flipped = Buffer.from(body ?? '', 'base64url')
    flipped[0] = (flipped[0] ?? 0) ^ 1
    expect(
      open(key, 'salla:1', [version, iv, flipped.toString('base64url'), tag].join('.')),
    ).toBeNull()
    expect(open(key, 'salla:1', `${sealed}.extra`)).toBeNull()
    expect(open(key, 'salla:1', 'v2.a.b.c')).toBeNull()
    expect(open(key, 'salla:1', '')).toBeNull()
  })
})

describe('reading what the platforms send', () => {
  it('keeps a storefront address tidy and refuses what is not a web address', () => {
    expect(storeUrlOf('https://demo.salla.group/ar/merchant-store?x=1#top')).toBe(
      'https://demo.salla.group/ar/merchant-store',
    )
    expect(storeUrlOf('shop.example.com')).toBe('https://shop.example.com/')
    expect(storeUrlOf('https://wyatt.example.sa/')).toBe('https://wyatt.example.sa/')
    for (const bad of [
      'ftp://shop.example',
      'javascript:alert(1)',
      'https://user:pw@shop.example',
      '',
      '   ',
      null,
      42,
    ]) {
      expect(storeUrlOf(bad)).toBeNull()
    }
  })

  it('reads an expiry that is a unix time, a count of seconds, or missing', () => {
    expect(expiryOf(1793880000, NOW, 1000)).toEqual(new Date(1793880000 * 1000))
    expect(expiryOf(1209599, NOW, 1000)).toEqual(new Date(NOW.getTime() + 1209599 * 1000))
    expect(expiryOf(undefined, NOW, 5000)).toEqual(new Date(NOW.getTime() + 5000))
    expect(expiryOf('abc', NOW, 5000)).toEqual(new Date(NOW.getTime() + 5000))
    expect(expiryOf(-5, NOW, 5000)).toEqual(new Date(NOW.getTime() + 5000))
  })
})
