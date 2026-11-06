import { createHmac } from 'node:crypto'
import { AlertsResponse, WhatsappState } from '@arablyzer/api-contract'
import { DEFAULT_POLICY, type safeFetch } from '@arablyzer/egress'
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
import { noMailer, type MailOutcome } from '../src/monitor/mail'
import {
  cloudApi,
  templateParam,
  whatsappFrom,
  whatsappSettingsFrom,
  type WhatsApp,
  type WhatsAppMessage,
  type WhatsAppSettings,
} from '../src/monitor/whatsapp'
import { maskPhone, normalizePhone } from '../src/whatsapp'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle } from './support/google'

const SITE = new URL('https://arablyzer.example')
const PLAN = {
  ARABLYZER_PLAN_ACCOUNT_SCANS: '3',
  ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '60',
  ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '2',
  ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '4',
  ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '30',
  ARABLYZER_PLAN_ACCOUNT_MONITORED_SITES: '3',
}
const ANONYMOUS = { ...DEVELOPMENT_LIMITS, perConnection: { scans: 1, seconds: 60 }, inFlight: 1 }
const START = new Date('2026-11-04T12:00:00.000Z')
const SECRET = { appSecret: 'app-secret', verifyToken: 'verify-token' }
const SETTINGS: WhatsAppSettings = {
  phoneNumberId: '1234567890',
  accessToken: 'EAAG-secret-token',
  version: 'v23.0',
  webhook: SECRET,
}

interface Seen {
  url?: string
  options?: Parameters<typeof safeFetch>[1]
}
const stub = (status: number | null, seen: Seen = {}, body?: unknown) =>
  ((url: string, options: Parameters<typeof safeFetch>[1]) => {
    seen.url = url
    seen.options = options
    return Promise.resolve({
      response:
        status === null
          ? null
          : { status, body: new TextEncoder().encode(JSON.stringify(body ?? {})) },
    })
  }) as unknown as typeof safeFetch

describe('numbers', () => {
  it.each([
    ['+966 50 123 4567', '+966501234567'],
    ['00966-50-123-4567', '+966501234567'],
    ['+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧', '+966501234567'],
    ['(+971) 55 123 4567', '+971551234567'],
  ])('reads %s as %s', (typed, e164) => {
    expect(normalizePhone(typed)).toBe(e164)
  })

  it.each(['0501234567', '+0123456789', '+96650', 'phone', '', '+966 50 123 4567 89012345'])(
    'refuses %s',
    (typed) => {
      expect(normalizePhone(typed)).toBeNull()
    },
  )

  it('hides the middle of a number, and cleans a template variable to one short line', () => {
    expect(maskPhone('+966501234567')).toBe('+966••••••567')
    expect(templateParam('a\n b\t\tc  d')).toBe('a b c d')
    expect(templateParam('x'.repeat(500))).toHaveLength(200)
    expect(templateParam('  \n ')).toBe('-')
  })
})

describe('the settings from the environment', () => {
  const on = {
    ARABLYZER_WHATSAPP_PROVIDER: 'cloud',
    WHATSAPP_PHONE_NUMBER_ID: '1234567890',
    WHATSAPP_ACCESS_TOKEN: 'EAAG-secret-token',
  }

  it('are off when nothing is set or when told so, and read nothing else', () => {
    expect(whatsappSettingsFrom({})).toBeNull()
    expect(
      whatsappSettingsFrom({ ARABLYZER_WHATSAPP_PROVIDER: 'off', WHATSAPP_ACCESS_TOKEN: 'x' }),
    ).toBeNull()
    expect(whatsappFrom({}, { policy: DEFAULT_POLICY }).available).toBe(false)
  })

  it('are on when complete, with the default version and no webhook unless both values are set', () => {
    expect(whatsappSettingsFrom(on)).toEqual({
      phoneNumberId: '1234567890',
      accessToken: 'EAAG-secret-token',
      version: 'v23.0',
      webhook: null,
    })
    expect(
      whatsappSettingsFrom({
        ...on,
        WHATSAPP_API_VERSION: 'v25.0',
        WHATSAPP_APP_SECRET: 's',
        WHATSAPP_VERIFY_TOKEN: 't',
      }),
    ).toMatchObject({ version: 'v25.0', webhook: { appSecret: 's', verifyToken: 't' } })
    expect(whatsappFrom(on, { policy: DEFAULT_POLICY }).available).toBe(true)
  })

  it.each([
    ['WHATSAPP_PHONE_NUMBER_ID', '', /WHATSAPP_PHONE_NUMBER_ID/],
    ['WHATSAPP_PHONE_NUMBER_ID', '+966501234567', /WHATSAPP_PHONE_NUMBER_ID/],
    ['WHATSAPP_ACCESS_TOKEN', '', /WHATSAPP_ACCESS_TOKEN/],
    ['WHATSAPP_API_VERSION', 'latest', /WHATSAPP_API_VERSION/],
    ['ARABLYZER_WHATSAPP_PROVIDER', 'twilio', /only provider is cloud/],
    ['WHATSAPP_APP_SECRET', 'only-one', /together or not at all/],
  ])('refuse to start with %s = %j', (name, value, error) => {
    expect(() => whatsappSettingsFrom({ ...on, [name]: value })).toThrow(error)
  })
})

describe('the Cloud API', () => {
  const api = (fetcher: typeof safeFetch, log?: (line: string) => void) =>
    cloudApi({
      phoneNumberId: '1234567890',
      accessToken: 'EAAG-secret-token',
      version: 'v23.0',
      policy: DEFAULT_POLICY,
      fetcher,
      ...(log === undefined ? {} : { log }),
    })

  it('sends an approved template through the egress rules, the token in a header and the number as digits', async () => {
    const seen: Seen = {}
    const outcome = await api(stub(200, seen)).send({
      to: '+966501234567',
      template: 'scoreDrop',
      language: 'ar',
      params: ['example.com', '92', '74', 'https://arablyzer.example/r/abc'],
    })
    expect(outcome).toBe('sent')
    expect(seen.url).toBe('https://graph.facebook.com/v23.0/1234567890/messages')
    expect(seen.options?.json).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '966501234567',
      type: 'template',
      template: {
        name: 'arablyzer_score_drop',
        language: { code: 'ar' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'example.com' },
              { type: 'text', text: '92' },
              { type: 'text', text: '74' },
              { type: 'text', text: 'https://arablyzer.example/r/abc' },
            ],
          },
        ],
      },
    })
    expect(seen.options?.headers).toEqual({ authorization: 'Bearer EAAG-secret-token' })
    expect(seen.options?.policy).toBe(DEFAULT_POLICY)
  })

  it('carries the verification code on the copy button as well as in the body', async () => {
    const seen: Seen = {}
    await api(stub(200, seen)).send({
      to: '+966501234567',
      template: 'verify',
      language: 'en',
      params: ['123456'],
    })
    const template = (seen.options?.json as { template: { name: string; components: unknown[] } })
      .template
    expect(template.name).toBe('arablyzer_verify')
    expect(template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: '123456' }] },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: '123456' }],
      },
    ])
  })

  it('cleans every variable: no line break can reach the template', async () => {
    const seen: Seen = {}
    await api(stub(200, seen)).send({
      to: '+966501234567',
      template: 'down',
      language: 'en',
      params: ['evil.example\n\nClick here'],
    })
    const body = (
      seen.options?.json as {
        template: { components: { parameters: { text: string }[] }[] }
      }
    ).template.components[0]
    expect(body?.parameters[0]?.text).toBe('evil.example Click here')
  })

  it.each([
    [200, undefined, 'sent'],
    [201, undefined, 'sent'],
    [400, { error: { code: 131026 } }, 'rejected'],
    [400, { error: { code: 132000 } }, 'rejected'],
    [400, {}, 'rejected'],
    [400, { error: { code: 130429 } }, 'retry'],
    [400, { error: { code: 131056 } }, 'retry'],
    [401, { error: { code: 190 } }, 'retry'],
    [403, undefined, 'retry'],
    [429, undefined, 'retry'],
    [500, undefined, 'retry'],
    [503, undefined, 'retry'],
    [null, undefined, 'retry'],
  ] as const)('turns an answer of %s %j into %s', async (status, body, outcome) => {
    const message: WhatsAppMessage = {
      to: '+966501234567',
      template: 'critical',
      language: 'en',
      params: ['example.com', '2', 'https://arablyzer.example/r/abc'],
    }
    expect(await api(stub(status, {}, body)).send(message)).toBe(outcome)
  })

  it('never throws, and tells the log a status and Meta’s code, never the token or the number', async () => {
    const told: string[] = []
    const failing = ((): Promise<never> =>
      Promise.reject(
        new Error('connect ECONNREFUSED EAAG-secret-token 966501234567'),
      )) as unknown as typeof safeFetch
    const message: WhatsAppMessage = {
      to: '+966501234567',
      template: 'down',
      language: 'en',
      params: ['example.com'],
    }
    expect(await api(failing, (line) => told.push(line)).send(message)).toBe('retry')
    expect(
      await api(stub(400, {}, { error: { code: 131026 } }), (line) => told.push(line)).send(
        message,
      ),
    ).toBe('rejected')
    expect(told).toEqual(['WhatsApp could not be reached', 'WhatsApp answered 400 (code 131026)'])
    expect(told.join(' ')).not.toMatch(/EAAG|966501234567/)
  })
})

function setup(
  options: {
    plan?: Record<string, string>
    /** What each message becomes; absent, WhatsApp is off. */
    send?: (message: WhatsAppMessage) => MailOutcome
    webhook?: boolean
  } = {},
) {
  const tables: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] }
  const scans = new MemoryScanStore()
  const data = new MemoryAccountData(scans)
  const monitors = new MemoryMonitorData(data, scans)
  const messages: WhatsAppMessage[] = []
  const whatsapp: WhatsApp =
    options.send === undefined
      ? { available: false, send: () => Promise.resolve('rejected') }
      : {
          available: true,
          send: (message) => {
            messages.push(message)
            return Promise.resolve(options.send?.(message) ?? 'sent')
          },
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
  let clock = START
  const accounts: AccountsDeps = {
    auth,
    limits: { signIn: { scans: 1000, seconds: 60 } },
    secureCookies: false,
    data,
    plans: planCatalogFrom(
      { ...PLAN, ARABLYZER_PLAN_ACCOUNT_WHATSAPP_ALERTS: 'on', ...options.plan },
      ANONYMOUS,
    ),
    monitors,
    sender: { send: () => Promise.resolve({ status: 204, ok: true }) },
    mail: noMailer,
    whatsapp,
    whatsappSettings: { ...SETTINGS, webhook: options.webhook === false ? null : SECRET },
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
    now: () => clock,
    accounts,
  })
  const send = (
    method: string,
    path: string,
    body?: unknown,
    cookie?: string,
    headers: Record<string, string> = {},
    raw?: string,
  ) =>
    app.request(path, {
      method,
      headers: {
        origin: SITE.origin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie === undefined ? {} : { cookie }),
        ...headers,
      },
      ...(raw !== undefined
        ? { body: raw }
        : body === undefined
          ? {}
          : { body: JSON.stringify(body) }),
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
      ).json()) as { id: string }
    ).id
  const idOf = async (cookie: string) =>
    ((await (await send('GET', '/api/account', undefined, cookie)).json()) as { id: string }).id
  const state = async (cookie: string) =>
    AlertsResponse.parse(await (await send('GET', '/api/account/alerts', undefined, cookie)).json())
      .whatsapp
  /** Sends the code and gives it back, the way the person reads it from their phone. */
  const requestCode = async (cookie: string, phone = '+966 50 123 4567') => {
    const response = await send('PUT', '/api/account/whatsapp', { phone }, cookie)
    return { response, code: messages.at(-1)?.params[0] ?? '' }
  }
  return {
    send,
    signIn,
    addSite,
    idOf,
    state,
    requestCode,
    messages,
    monitors,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms)
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the number and its code', () => {
  it('is off for the page without a provider, and without a plan that has it', async () => {
    const off = setup()
    const cookie = await off.signIn('ali')
    expect(await off.state(cookie)).toEqual({
      available: false,
      allowed: false,
      phone: null,
      verified: false,
      sites: [],
    })
    expect(
      (await off.send('PUT', '/api/account/whatsapp', { phone: '+966501234567' }, cookie)).status,
    ).toBe(404)

    const free = setup({
      send: () => 'sent',
      plan: { ARABLYZER_PLAN_ACCOUNT_WHATSAPP_ALERTS: 'off' },
    })
    const person = await free.signIn('bo')
    expect(await free.state(person)).toMatchObject({ available: true, allowed: false })
    const refused = await free.send(
      'PUT',
      '/api/account/whatsapp',
      { phone: '+966501234567' },
      person,
    )
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({
      error: 'plan-limit',
      limit: 'whatsapp',
      plan: 'account',
    })
    expect(free.messages).toHaveLength(0)
  })

  it('sends a code to the number, verifies it once given back, and shows only a masked number', async () => {
    const t = setup({ send: () => 'sent' })
    const cookie = await t.signIn('ali')
    const { response, code } = await t.requestCode(cookie, '+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧')
    expect(response.status).toBe(200)
    expect(t.messages).toEqual([
      { to: '+966501234567', template: 'verify', language: 'ar', params: [code] },
    ])
    expect(code).toMatch(/^\d{6}$/)
    expect(WhatsappState.parse(await response.json())).toEqual({
      available: true,
      allowed: true,
      phone: '+966••••••567',
      verified: false,
      sites: [],
    })
    // Nothing is stored in a form that holds the code or the whole number's place in the page.
    expect(JSON.stringify(await t.state(cookie))).not.toContain(code)
    const wrong = await t.send(
      'POST',
      '/api/account/whatsapp/verify',
      { code: code === '000000' ? '000001' : '000000' },
      cookie,
    )
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toEqual({ error: 'invalid-token' })
    const right = await t.send('POST', '/api/account/whatsapp/verify', { code }, cookie)
    expect(right.status).toBe(200)
    expect(WhatsappState.parse(await right.json())).toMatchObject({ verified: true })
    // Spent: the same code does not work twice.
    expect((await t.send('POST', '/api/account/whatsapp/verify', { code }, cookie)).status).toBe(
      400,
    )
  })

  it('locks the code after five wrong tries, and lets it expire', async () => {
    const t = setup({ send: () => 'sent' })
    const cookie = await t.signIn('ali')
    const { code } = await t.requestCode(cookie)
    const wrong = code === '111111' ? '222222' : '111111'
    for (let n = 0; n < 5; n++) {
      expect(
        (await t.send('POST', '/api/account/whatsapp/verify', { code: wrong }, cookie)).status,
      ).toBe(400)
    }
    const locked = await t.send('POST', '/api/account/whatsapp/verify', { code }, cookie)
    expect(locked.status).toBe(429)
    expect(locked.headers.get('retry-after')).not.toBeNull()

    const u = setup({ send: () => 'sent' })
    const person = await u.signIn('bo')
    const sent = await u.requestCode(person)
    u.advance(11 * 60_000)
    const late = await u.send('POST', '/api/account/whatsapp/verify', { code: sent.code }, person)
    expect(late.status).toBe(400)
    expect((await u.state(person)).verified).toBe(false)
  })

  it('limits the codes per person, per number and for the server, and sends none to a bad number', async () => {
    const t = setup({ send: () => 'sent' })
    const cookie = await t.signIn('ali')
    for (let n = 0; n < 3; n++) expect((await t.requestCode(cookie)).response.status).toBe(200)
    const limited = await t.requestCode(cookie)
    expect(limited.response.status).toBe(429)
    expect(t.messages).toHaveLength(3)

    // Other accounts cannot be used to send the same number more codes.
    const bo = await t.signIn('bo')
    expect((await t.requestCode(bo)).response.status).toBe(429)
    expect((await t.requestCode(bo, '+966 50 999 9999')).response.status).toBe(200)

    const bad = await t.send('PUT', '/api/account/whatsapp', { phone: '0501234567' }, bo)
    expect(bad.status).toBe(400)
    expect((await t.send('PUT', '/api/account/whatsapp', { phone: 5 }, bo)).status).toBe(400)
  })

  it('stores nothing when the provider refuses the number or is down', async () => {
    let outcome: MailOutcome = 'rejected'
    const t = setup({ send: () => outcome })
    const cookie = await t.signIn('ali')
    expect((await t.requestCode(cookie)).response.status).toBe(400)
    outcome = 'retry'
    expect((await t.requestCode(cookie, '+966 50 999 9999')).response.status).toBe(503)
    expect(await t.monitors.whatsapp(await t.idOf(cookie))).toBeNull()
  })

  it('is guarded like the other account routes', async () => {
    const t = setup({ send: () => 'sent' })
    expect((await t.send('PUT', '/api/account/whatsapp', { phone: '+966501234567' })).status).toBe(
      401,
    )
    const cookie = await t.signIn('ali')
    expect(
      (
        await t.send('PUT', '/api/account/whatsapp', { phone: '+966501234567' }, cookie, {
          origin: 'https://evil.example',
        })
      ).status,
    ).toBe(400)
    expect(t.messages).toHaveLength(0)
  })
})

describe('a site’s opt-in', () => {
  async function verified(t: ReturnType<typeof setup>, cookie: string) {
    const { code } = await t.requestCode(cookie)
    await t.send('POST', '/api/account/whatsapp/verify', { code }, cookie)
  }

  it('needs a monitor, a plan that has WhatsApp and a verified number, and shows in the state', async () => {
    const t = setup({ send: () => 'sent' })
    const cookie = await t.signIn('ali')
    const site = await t.addSite(cookie, 1)
    const path = `/api/sites/${site}/whatsapp`
    // Not monitored yet.
    expect((await t.send('PUT', path, { enabled: true }, cookie)).status).toBe(404)
    await t.send('PUT', `/api/sites/${site}/monitor`, { enabled: true }, cookie)
    // Monitored, but no verified number.
    expect((await t.send('PUT', path, { enabled: true }, cookie)).status).toBe(400)
    await verified(t, cookie)
    const on = await t.send('PUT', path, { enabled: true }, cookie)
    expect(on.status).toBe(200)
    expect(WhatsappState.parse(await on.json()).sites).toEqual([
      { id: site, url: 'https://example.com/1', enabled: true },
    ])
    expect(await t.monitors.whatsappTarget(await t.idOf(cookie), site)).toBe('+966501234567')
    const off = await t.send('PUT', path, { enabled: false }, cookie)
    expect(WhatsappState.parse(await off.json()).sites[0]?.enabled).toBe(false)
    expect((await t.send('PUT', path, { enabled: 'yes' }, cookie)).status).toBe(400)
    expect(
      (await t.send('PUT', '/api/sites/nope/whatsapp', { enabled: true }, cookie)).status,
    ).toBe(404)
  })

  it('ends with the monitoring, and with the number, which anyone may remove', async () => {
    const t = setup({ send: () => 'sent' })
    const cookie = await t.signIn('ali')
    const [a, b] = [await t.addSite(cookie, 1), await t.addSite(cookie, 2)]
    for (const id of [a, b])
      await t.send('PUT', `/api/sites/${id}/monitor`, { enabled: true }, cookie)
    await verified(t, cookie)
    for (const id of [a, b])
      await t.send('PUT', `/api/sites/${id}/whatsapp`, { enabled: true }, cookie)
    await t.send('PUT', `/api/sites/${a}/monitor`, { enabled: false }, cookie)
    expect((await t.state(cookie)).sites).toEqual([
      { id: b, url: 'https://example.com/2', enabled: true },
    ])
    const removed = await t.send('DELETE', '/api/account/whatsapp', undefined, cookie)
    expect(WhatsappState.parse(await removed.json())).toMatchObject({
      phone: null,
      verified: false,
      sites: [{ id: b, enabled: false }],
    })
    expect(await t.monitors.whatsappTarget(await t.idOf(cookie), b)).toBeNull()
  })

  it('is another person’s 404, and a plan without WhatsApp cannot opt in', async () => {
    const t = setup({ send: () => 'sent' })
    const ali = await t.signIn('ali')
    const bo = await t.signIn('bo')
    const site = await t.addSite(ali, 1)
    expect((await t.send('PUT', `/api/sites/${site}/whatsapp`, { enabled: true }, bo)).status).toBe(
      404,
    )
    const free = setup({
      send: () => 'sent',
      plan: { ARABLYZER_PLAN_ACCOUNT_WHATSAPP_ALERTS: 'off' },
    })
    const cookie = await free.signIn('cy')
    const own = await free.addSite(cookie, 1)
    const refused = await free.send('PUT', `/api/sites/${own}/whatsapp`, { enabled: true }, cookie)
    expect(refused.status).toBe(403)
  })
})

describe('Meta’s webhook', () => {
  const sign = (body: string, secret = SECRET.appSecret) =>
    `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  const inbound = (from: string, text: string, type = 'text') =>
    JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ from, type, text: { body: text } }] } }] }],
    })

  async function withNumber(t: ReturnType<typeof setup>) {
    const cookie = await t.signIn('ali')
    const { code } = await t.requestCode(cookie)
    await t.send('POST', '/api/account/whatsapp/verify', { code }, cookie)
    return { cookie, id: await t.idOf(cookie) }
  }

  it('answers Meta’s check with the challenge only for the verify token', async () => {
    const t = setup({ send: () => 'sent' })
    const ok = await t.send(
      'GET',
      '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=12345',
    )
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe('12345')
    for (const query of [
      'hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1',
      'hub.mode=unsubscribe&hub.verify_token=verify-token&hub.challenge=1',
      '',
    ]) {
      expect((await t.send('GET', `/api/whatsapp/webhook?${query}`)).status).toBe(403)
    }
  })

  it('forgets a number whose owner replies STOP, in either language, and nothing else', async () => {
    const t = setup({ send: () => 'sent' })
    const { id } = await withNumber(t)
    const post = (body: string, signature = sign(body)) =>
      t.send(
        'POST',
        '/api/whatsapp/webhook',
        undefined,
        undefined,
        { 'x-hub-signature-256': signature },
        body,
      )

    const hello = inbound('966501234567', 'hello there')
    expect((await post(hello)).status).toBe(200)
    expect(await t.monitors.whatsapp(id)).not.toBeNull()

    const stopBody = inbound('966501234567', ' Stop! ')
    expect((await post(stopBody, 'sha256=bad')).status).toBe(401)
    expect((await post(stopBody, sign(stopBody, 'wrong-secret'))).status).toBe(401)
    expect(await t.monitors.whatsapp(id)).not.toBeNull()

    const response = await post(stopBody)
    expect(await response.json()).toEqual({ ok: true, stopped: 1 })
    expect(await t.monitors.whatsapp(id)).toBeNull()

    const arabic = setup({ send: () => 'sent' })
    const second = await withNumber(arabic)
    const body = inbound('966501234567', 'إيقاف')
    await arabic.send(
      'POST',
      '/api/whatsapp/webhook',
      undefined,
      undefined,
      { 'x-hub-signature-256': sign(body) },
      body,
    )
    expect(await arabic.monitors.whatsapp(second.id)).toBeNull()
  })

  it('ignores a message that is not text, a number that is not ours, and a body that is not Meta’s', async () => {
    const t = setup({ send: () => 'sent' })
    const { id } = await withNumber(t)
    const post = (body: string) =>
      t.send(
        'POST',
        '/api/whatsapp/webhook',
        undefined,
        undefined,
        { 'x-hub-signature-256': sign(body) },
        body,
      )
    expect((await post(inbound('966501234567', 'stop', 'image'))).status).toBe(200)
    expect((await post(inbound('966599999999', 'stop'))).status).toBe(200)
    expect((await post(inbound('not-digits', 'stop'))).status).toBe(200)
    expect((await post('{"entry":"x"}')).status).toBe(200)
    expect((await post('not json')).status).toBe(503)
    expect(await t.monitors.whatsapp(id)).not.toBeNull()
  })

  it('is not mounted without the app secret and verify token', async () => {
    const t = setup({ send: () => 'sent', webhook: false })
    expect(
      (
        await t.send(
          'GET',
          '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1',
        )
      ).status,
    ).toBe(404)
  })
})
