import { AlertsResponse, MonitorResponse, SitesResponse } from '@arablyzer/api-contract'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, planCatalogFrom } from '@arablyzer/plans'
import {
  MemoryAccountData,
  MemoryInFlight,
  MemoryMonitorData,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountsDeps } from '../src/accounts'
import { createApp } from '../src/app'
import { createAuth } from '../src/auth'
import type { Mailer } from '../src/monitor/mail'
import type { AlertMessage, WebhookSender } from '../src/monitor/webhook'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle } from './support/google'

const SITE = new URL('https://arablyzer.example')
const PLAN = {
  ARABLYZER_PLAN_ACCOUNT_SCANS: '3',
  ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '60',
  ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '2',
  ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '4',
  ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '30',
}
const ANONYMOUS = { ...DEVELOPMENT_LIMITS, perConnection: { scans: 1, seconds: 60 }, inFlight: 1 }

function setup(options: { monitoring?: boolean; status?: number | null; mail?: boolean } = {}) {
  const tables: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] }
  const scans = new MemoryScanStore()
  const data = new MemoryAccountData(scans)
  const monitors = new MemoryMonitorData(data, scans)
  const sent: { webhook: { url: string; secret: string }; message: AlertMessage }[] = []
  const sender: WebhookSender = {
    send: (webhook, message) => {
      sent.push({ webhook, message })
      const status = options.status === undefined ? 204 : options.status
      return Promise.resolve({ status, ok: status !== null && status >= 200 && status < 300 })
    },
  }
  const mail: Mailer = {
    available: options.mail === true,
    send: () => Promise.resolve(options.mail === true),
  }
  const auth = createAuth({
    site: SITE,
    secret: 'a'.repeat(40),
    database: memoryAdapter(tables),
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    production: false,
    beforeDelete: async (userId) => {
      await data.eraseUser(userId)
      await monitors.eraseUser(userId)
    },
    log: () => undefined,
  })
  const accounts: AccountsDeps = {
    auth,
    limits: { signIn: { scans: 1000, seconds: 60 } },
    secureCookies: false,
    data,
    plans: planCatalogFrom(PLAN, ANONYMOUS),
    ...(options.monitoring === false ? {} : { monitors, sender, mail }),
  }
  const app = createApp({
    limits: ANONYMOUS,
    policy: DEFAULT_POLICY,
    resolver: () => Promise.resolve([{ address: '93.184.215.14', family: 4 }]),
    turnstile: () => Promise.resolve(true),
    limiter: new MemoryRateLimiter(),
    store: scans,
    queue: new MemoryScanQueue(),
    events: new MemoryScanEvents(20),
    inFlight: new MemoryInFlight(),
    address: () => '203.0.113.9',
    connectionKey: (a) => `key-of-${a}`,
    newId: () => 'scan000000000000000001',
    origin: SITE.origin,
    accounts,
  })
  const send = (
    method: string,
    path: string,
    body?: unknown,
    cookie?: string,
    origin = SITE.origin,
  ) =>
    app.request(path, {
      method,
      headers: {
        origin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie === undefined ? {} : { cookie }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const signIn = async (sub: string) => {
    stubGoogle(idToken({ sub, email: `${sub}@example.com` }))
    const response = await send('POST', '/api/session/one-tap', {
      credential: idToken({ sub, email: `${sub}@example.com` }),
    })
    return response.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
  }
  const addSite = async (cookie: string, n: number) =>
    (
      (await (
        await send('POST', '/api/sites', { url: `https://example.com/${String(n)}` }, cookie)
      ).json()) as {
        id: string
      }
    ).id
  return { send, signIn, addSite, sent, monitors }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('monitoring a saved site', () => {
  it('turns on at the plan’s interval, holds to the plan’s one site, and turns off', async () => {
    const { send, signIn, addSite } = setup()
    const cookie = await signIn('ali')
    const [first, second] = [await addSite(cookie, 1), await addSite(cookie, 2)]
    const on = await send('PUT', `/api/sites/${first}/monitor`, { enabled: true }, cookie)
    expect(on.status).toBe(200)
    const body = MonitorResponse.parse(await on.json())
    expect(body.monitor).toMatchObject({ everyDays: 7, paused: false, failures: 0, trend: [] })
    // Again is the same monitor, not a second place used.
    expect(
      (await send('PUT', `/api/sites/${first}/monitor`, { enabled: true }, cookie)).status,
    ).toBe(200)
    const over = await send('PUT', `/api/sites/${second}/monitor`, { enabled: true }, cookie)
    expect(over.status).toBe(403)
    expect(await over.json()).toEqual({
      error: 'plan-limit',
      limit: 'monitoredSites',
      plan: 'account',
    })
    const listed = SitesResponse.parse(
      await (await send('GET', '/api/sites', undefined, cookie)).json(),
    )
    expect(listed.monitoring).toEqual({ limit: 1, everyDays: 7 })
    expect(listed.sites.find((site) => site.id === first)?.monitor).not.toBeNull()
    expect(listed.sites.find((site) => site.id === second)?.monitor).toBeNull()
    const off = await send('PUT', `/api/sites/${first}/monitor`, { enabled: false }, cookie)
    expect(MonitorResponse.parse(await off.json())).toEqual({ monitor: null })
    expect(
      (await send('PUT', `/api/sites/${second}/monitor`, { enabled: true }, cookie)).status,
    ).toBe(200)
  })

  it('answers 404 for another person’s site, 401 signed out, 400 for a foreign origin or body', async () => {
    const { send, signIn, addSite } = setup()
    const ali = await signIn('ali')
    const sara = await signIn('sara')
    const site = await addSite(ali, 1)
    const path = `/api/sites/${site}/monitor`
    expect((await send('PUT', path, { enabled: true }, sara)).status).toBe(404)
    expect((await send('PUT', path, { enabled: true })).status).toBe(401)
    expect((await send('PUT', path, { enabled: true }, ali, 'https://evil.example')).status).toBe(
      400,
    )
    expect((await send('PUT', path, { enabled: 'yes' }, ali)).status).toBe(400)
    expect((await send('PUT', '/api/sites/nope/monitor', { enabled: true }, ali)).status).toBe(404)
  })

  it('is not there without monitoring', async () => {
    const { send, signIn, addSite } = setup({ monitoring: false })
    const cookie = await signIn('ali')
    const site = await addSite(cookie, 1)
    expect(
      (await send('PUT', `/api/sites/${site}/monitor`, { enabled: true }, cookie)).status,
    ).toBe(404)
    expect((await send('GET', '/api/account/alerts', undefined, cookie)).status).toBe(404)
    const listed = SitesResponse.parse(
      await (await send('GET', '/api/sites', undefined, cookie)).json(),
    )
    expect(listed.sites[0]?.monitor).toBeNull()
  })
})

describe('alert settings', () => {
  const hook = 'https://hooks.slack.com/services/T000/B000/XXXX'

  it('starts with defaults, saves a webhook and shows its secret once, never its address', async () => {
    const { send, signIn } = setup()
    const cookie = await signIn('ali')
    const start = AlertsResponse.parse(
      await (await send('GET', '/api/account/alerts', undefined, cookie)).json(),
    )
    expect(start).toEqual({
      webhook: null,
      dropThreshold: 10,
      onCritical: true,
      onDown: true,
      weeklySummary: false,
      email: { available: false, enabled: false },
    })
    const saved = await send(
      'PUT',
      '/api/account/alerts',
      { webhookUrl: hook, dropThreshold: 5 },
      cookie,
    )
    expect(saved.status).toBe(200)
    const body = AlertsResponse.parse(await saved.json())
    expect(body.secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.webhook).toEqual({
      host: 'hooks.slack.com',
      kind: 'slack',
      failures: 0,
      disabled: false,
    })
    expect(body.dropThreshold).toBe(5)
    expect(JSON.stringify(body)).not.toContain('XXXX')
    const read = await (await send('GET', '/api/account/alerts', undefined, cookie)).text()
    expect(read).not.toContain('XXXX')
    expect(read).not.toContain(body.secret ?? 'x')
    // The same address keeps its secret and sends none; a rotation makes a new one.
    const same = AlertsResponse.parse(
      await (
        await send('PUT', '/api/account/alerts', { webhookUrl: hook, weeklySummary: true }, cookie)
      ).json(),
    )
    expect(same.secret).toBeUndefined()
    expect(same.weeklySummary).toBe(true)
    const rotated = AlertsResponse.parse(
      await (await send('PUT', '/api/account/alerts', { rotateSecret: true }, cookie)).json(),
    )
    expect(rotated.secret).toBeDefined()
    expect(rotated.secret).not.toBe(body.secret)
    const removed = AlertsResponse.parse(
      await (await send('PUT', '/api/account/alerts', { webhookUrl: null }, cookie)).json(),
    )
    expect(removed.webhook).toBeNull()
  })

  it('tells the kind from the host, and refuses an address a scan would refuse', async () => {
    const { send, signIn } = setup()
    const cookie = await signIn('ali')
    const kindOf = async (url: string) =>
      AlertsResponse.parse(
        await (await send('PUT', '/api/account/alerts', { webhookUrl: url }, cookie)).json(),
      ).webhook?.kind
    expect(await kindOf('https://discord.com/api/webhooks/1/abc')).toBe('discord')
    expect(await kindOf('https://example.org/hook')).toBe('generic')
    const refused = async (url: string) => {
      const response = await send('PUT', '/api/account/alerts', { webhookUrl: url }, cookie)
      return [response.status, ((await response.json()) as { error: string }).error]
    }
    expect(await refused('http://example.org/hook')).toEqual([400, 'unsupported-scheme'])
    expect(await refused('https://user:pw@example.org/hook')).toEqual([400, 'credentials-in-url'])
    expect(await refused('https://localhost/hook')).toEqual([422, 'blocked-host'])
    expect(await refused('https://10.0.0.5/hook')).toEqual([422, 'blocked-address'])
    expect(await refused('nonsense')).toEqual([400, 'invalid-url'])
    expect((await send('PUT', '/api/account/alerts', { dropThreshold: 0 }, cookie)).status).toBe(
      400,
    )
    expect((await send('PUT', '/api/account/alerts', { email: true }, cookie)).status).toBe(400)
  })

  it('offers email only where a mailer exists', async () => {
    const { send, signIn } = setup({ mail: true })
    const cookie = await signIn('ali')
    const saved = AlertsResponse.parse(
      await (await send('PUT', '/api/account/alerts', { email: true }, cookie)).json(),
    )
    expect(saved.email).toEqual({ available: true, enabled: true })
  })

  it('sends a signed test to the saved webhook, in the account’s language, and turns a disabled one on', async () => {
    const { send, signIn, sent, monitors } = setup()
    const cookie = await signIn('ali')
    expect((await send('POST', '/api/account/alerts/test', undefined, cookie)).status).toBe(400)
    const saved = AlertsResponse.parse(
      await (await send('PUT', '/api/account/alerts', { webhookUrl: hook }, cookie)).json(),
    )
    const test = await send('POST', '/api/account/alerts/test', undefined, cookie)
    expect(await test.json()).toEqual({ ok: true, status: 204 })
    expect(sent[0]?.webhook).toMatchObject({ url: hook, secret: saved.secret })
    expect(sent[0]?.message.type).toBe('webhook.test')
    const { id } = (await (await send('GET', '/api/account', undefined, cookie)).json()) as {
      id: string
    }
    await monitors.delivered(id, false, new Date(), 1)
    expect((await monitors.alerts(id)).webhook?.disabledAt).not.toBeNull()
    await send('POST', '/api/account/alerts/test', undefined, cookie)
    expect((await monitors.alerts(id)).webhook?.disabledAt).toBeNull()
  })

  it('reports a webhook that does not answer, and limits tests per person', async () => {
    const { send, signIn } = setup({ status: null })
    const cookie = await signIn('ali')
    await send('PUT', '/api/account/alerts', { webhookUrl: hook }, cookie)
    const first = await send('POST', '/api/account/alerts/test', undefined, cookie)
    expect(await first.json()).toEqual({ ok: false, status: null })
    for (let n = 0; n < 4; n++) await send('POST', '/api/account/alerts/test', undefined, cookie)
    const limited = await send('POST', '/api/account/alerts/test', undefined, cookie)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).not.toBeNull()
  })
})
