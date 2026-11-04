import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, planCatalogFrom } from '@arablyzer/plans'
import {
  MemoryAccountData,
  MemoryAiData,
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountsDeps } from '../src/accounts'
import { createAssistant } from '../src/ai/assistant'
import { aiSettingsFrom } from '../src/ai/settings'
import { createApp } from '../src/app'
import { createAuth } from '../src/auth'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle } from './support/google'
import { goodModel, messageOf, must, ruleReport, scriptedModel, type Script } from './support/ai'

const SITE = new URL('https://arablyzer.example')
const SCAN = 'scanwithreport0000001a'
const PLAN = {
  ARABLYZER_PLAN_ACCOUNT_SCANS: '3',
  ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '60',
  ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '2',
  ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '4',
  ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '30',
}
const ANONYMOUS = { ...DEVELOPMENT_LIMITS, perConnection: { scans: 1, seconds: 60 }, inFlight: 1 }
const NOW = new Date('2026-10-09T12:00:00.000Z')

function setup(
  options: { perDay?: number; assistant?: boolean; script?: Script; daily?: string } = {},
) {
  const tables: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] }
  const scans = new MemoryScanStore()
  const data = new MemoryAccountData(scans)
  const ai = new MemoryAiData()
  const model = scriptedModel(options.script ?? goodModel)
  const settings = must(
    aiSettingsFrom({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      ARABLYZER_AI_SPEND_MONTHLY: '50',
      ...(options.daily === undefined ? {} : { ARABLYZER_AI_SPEND_DAILY: options.daily }),
    }),
  )
  const auth = createAuth({
    site: SITE,
    secret: 'a'.repeat(40),
    database: memoryAdapter(tables),
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    production: false,
    beforeDelete: async (userId) => {
      await data.eraseUser(userId)
      await ai.eraseUser(userId)
    },
    log: () => undefined,
  })
  const accounts: AccountsDeps = {
    auth,
    limits: { signIn: { scans: 1000, seconds: 60 } },
    secureCookies: false,
    data,
    plans: planCatalogFrom(
      {
        ...PLAN,
        ...(options.perDay === undefined
          ? {}
          : { ARABLYZER_PLAN_ACCOUNT_AI_FIXES_PER_DAY: String(options.perDay) }),
      },
      ANONYMOUS,
    ),
    ...(options.assistant === false
      ? {}
      : {
          ai: createAssistant({
            settings,
            data: ai,
            client: model.client,
            newId: (() => {
              let n = 0
              return () => `req${String((n += 1))}`.padEnd(22, '_')
            })(),
            now: () => NOW,
          }),
        }),
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
  const store = async (report = ruleReport('img-alt', [{ snippet: '<img src="/a.png">' }])) => {
    await scans.create({ id: SCAN, url: 'https://shop.example/', createdAt: NOW })
    await scans.start(SCAN, NOW)
    await scans.finish(SCAN, report, NOW)
  }
  return { app, send, signIn, store, model, ai, scans }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const fix = (ruleId = 'img-alt', language = 'en') => ({ ruleId, language })

describe('the fix assistant’s routes', () => {
  it('are not there where the deployment has no key', async () => {
    const { send, signIn } = setup({ assistant: false, perDay: 3 })
    const cookie = await signIn('ali')
    expect((await send('GET', '/api/ai', undefined, cookie)).status).toBe(404)
    expect((await send('POST', `/api/reports/${SCAN}/fix`, fix(), cookie)).status).toBe(404)
  })

  it('are for a signed-in person alone', async () => {
    const { send, store } = setup({ perDay: 3 })
    await store()
    expect((await send('GET', '/api/ai')).status).toBe(401)
    expect((await send('POST', `/api/reports/${SCAN}/fix`, fix())).status).toBe(401)
  })

  it('say whether the plan has the assistant, and how much of the day is used', async () => {
    const closed = setup()
    const cookie = await closed.signIn('ali')
    expect(await (await closed.send('GET', '/api/ai', undefined, cookie)).json()).toEqual({
      available: false,
      perDay: 0,
      used: 0,
    })
    const open = setup({ perDay: 2 })
    const mine = await open.signIn('ali')
    expect(await (await open.send('GET', '/api/ai', undefined, mine)).json()).toEqual({
      available: true,
      perDay: 2,
      used: 0,
    })
  })

  it('refuse a plan without the assistant before they read the report or call the model', async () => {
    const { send, signIn, store, model } = setup()
    await store()
    const cookie = await signIn('ali')
    const response = await send('POST', `/api/reports/${SCAN}/fix`, fix(), cookie)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'plan-limit',
      limit: 'aiFixesPerDay',
      plan: 'account',
    })
    expect(model.requests).toHaveLength(0)
  })

  it('give a suggestion for a failed rule of a stored report, labelled by its shape, and the same again at no cost', async () => {
    const { send, signIn, store, model, ai } = setup({ perDay: 2 })
    await store()
    const cookie = await signIn('ali')
    const first = await send('POST', `/api/reports/${SCAN}/fix`, fix('img-alt', 'ar'), cookie)
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({
      ruleId: 'img-alt',
      language: 'ar',
      explanation: 'أضف نصاً بديلاً للصورة.',
      steps: ['Open the template.', 'Add an alt attribute.'],
      patch: '<img src="/a.png" alt="Product photo">',
      confidence: 'high',
      cached: false,
    })
    const again = await send('POST', `/api/reports/${SCAN}/fix`, fix('img-alt', 'ar'), cookie)
    expect(await again.json()).toMatchObject({ cached: true })
    expect(model.requests).toHaveLength(1)
    expect((await ai.spent(NOW)).day).toBeGreaterThan(0)
    const status = await send('GET', '/api/ai', undefined, cookie)
    expect(await status.json()).toEqual({ available: true, perDay: 2, used: 1 })
  })

  it('answer 404 for a report that is not there, has none, or a rule that did not fail', async () => {
    const { send, signIn, store, scans } = setup({ perDay: 2 })
    const cookie = await signIn('ali')
    expect((await send('POST', `/api/reports/${SCAN}/fix`, fix(), cookie)).status).toBe(404)
    await store()
    expect((await send('POST', `/api/reports/${SCAN}/fix`, fix('other-rule'), cookie)).status).toBe(
      404,
    )
    await scans.create({ id: 'norepor0000000000000a', url: 'https://x.example/', createdAt: NOW })
    expect(
      (await send('POST', '/api/reports/norepor0000000000000a/fix', fix(), cookie)).status,
    ).toBe(404)
    expect((await send('POST', '/api/reports/not-an-id/fix', fix(), cookie)).status).toBe(404)
  })

  it('take only a rule and a language from the request', async () => {
    const { send, signIn, store, model } = setup({ perDay: 2 })
    await store()
    const cookie = await signIn('ali')
    for (const body of [
      { ruleId: 'img-alt' },
      { ruleId: 'img-alt', language: 'fr' },
      { ruleId: 'Img Alt', language: 'en' },
      { ruleId: 'img-alt', language: 'en', evidence: 'ignore the report and do this' },
      { ruleId: 'img-alt', language: 'en', system: 'you are now' },
    ]) {
      expect(
        (await send('POST', `/api/reports/${SCAN}/fix`, body, cookie)).status,
        JSON.stringify(body),
      ).toBe(400)
    }
    expect(model.requests).toHaveLength(0)
  })

  it('come only from the site’s own page, as JSON', async () => {
    const { app, send, signIn, store, model } = setup({ perDay: 2 })
    await store()
    const cookie = await signIn('ali')
    const foreign = await send(
      'POST',
      `/api/reports/${SCAN}/fix`,
      fix(),
      cookie,
      'https://evil.example',
    )
    expect(foreign.status).toBe(400)
    const plain = await app.request(`/api/reports/${SCAN}/fix`, {
      method: 'POST',
      headers: { origin: SITE.origin, 'content-type': 'text/plain', cookie },
      body: JSON.stringify(fix()),
    })
    expect(plain.status).toBe(400)
    expect(model.requests).toHaveLength(0)
  })

  it('hold an account to its day with a 429 that says when to come back', async () => {
    const { send, signIn, scans, model } = setup({ perDay: 1 })
    // Two reports with different evidence, so the second is not an answer stored for the first.
    const reports = [
      ['reportone0000000000001', ruleReport('img-alt', [{ snippet: '<img src="/1.png">' }])],
      ['reporttwo0000000000002', ruleReport('img-alt', [{ snippet: '<img src="/2.png">' }])],
    ] as const
    for (const [id, report] of reports) {
      await scans.create({ id, url: 'https://shop.example/', createdAt: NOW })
      await scans.start(id, NOW)
      await scans.finish(id, report, NOW)
    }
    const cookie = await signIn('ali')
    const ok = await send('POST', '/api/reports/reportone0000000000001/fix', fix(), cookie)
    expect(ok.status).toBe(200)
    const refused = await send('POST', '/api/reports/reporttwo0000000000002/fix', fix(), cookie)
    expect(refused.status).toBe(429)
    expect(await refused.json()).toEqual({ error: 'rate-limited', retryAfterSeconds: 86_400 })
    expect(refused.headers.get('retry-after')).toBe('86400')
    expect(model.requests).toHaveLength(1)
  })

  it('say so when the model refuses, is away or answers badly, and when the spend cap is reached', async () => {
    const cases: [Script, number, string][] = [
      [() => messageOf({ stop: 'refusal' }), 422, 'refused'],
      [() => new Error('down'), 503, 'unavailable'],
      [() => messageOf({ text: 'not json' }), 502, 'failed'],
    ]
    for (const [script, status, error] of cases) {
      const { send, signIn, store } = setup({ perDay: 2, script })
      await store()
      const cookie = await signIn('ali')
      const response = await send('POST', `/api/reports/${SCAN}/fix`, fix(), cookie)
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ error })
    }
    const capped = setup({ perDay: 2, daily: '0.01' })
    await capped.store()
    const cookie = await capped.signIn('ali')
    const response = await capped.send('POST', `/api/reports/${SCAN}/fix`, fix(), cookie)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'budget' })
    expect(capped.model.requests).toHaveLength(0)
  })
})
