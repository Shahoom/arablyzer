import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, planCatalogFrom } from '@arablyzer/plans'
import {
  MemoryAccountData,
  MemoryAdminData,
  MemoryApiKeyData,
  MemoryInFlight,
  MemoryMonitorData,
  MemoryPdfData,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { expect } from 'vitest'
import type { AccountsDeps } from '../../src/accounts'
import { withOverrides } from '../../src/admin/plans'
import { createApp } from '../../src/app'
import { createAuth } from '../../src/auth'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle } from './google'

// An app with accounts, API keys and the owner's panel in memory: `boss` is the administrator,
// anyone else who signs in is not.
export const SITE = new URL('https://arablyzer.example')
export const ADMIN_EMAIL = 'boss@example.com'
const PLAN = {
  ARABLYZER_PLAN_ACCOUNT_SCANS: '4',
  ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '60',
  ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '20',
  ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '2',
  ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '30',
}
const ANONYMOUS = { ...DEVELOPMENT_LIMITS, perConnection: { scans: 1, seconds: 60 }, inFlight: 1 }

export function setup(options: { emails?: string[]; now?: () => Date } = {}) {
  const tables: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
  }
  const scans = new MemoryScanStore()
  const data = new MemoryAccountData(scans)
  const keys = new MemoryApiKeyData()
  const pdfs = new MemoryPdfData()
  const monitors = new MemoryMonitorData(data, scans)
  const admin = new MemoryAdminData({
    users: () => tables.user ?? [],
    sessions: () => tables.session ?? [],
    scans,
    accounts: data,
    monitors,
    pdfs,
    apiKeys: keys,
  })
  const erase = async (userId: string) => {
    await data.eraseUser(userId)
    await monitors.eraseUser(userId)
    await pdfs.eraseUser(userId)
    await keys.eraseUser(userId)
    await admin.eraseUser(userId)
  }
  const auth = createAuth({
    site: SITE,
    secret: 'a'.repeat(40),
    database: memoryAdapter(tables),
    google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
    production: false,
    beforeDelete: erase,
    isSuspended: async (userId) => (await admin.state(userId)).suspendedAt !== null,
    onSignIn: (userId, at) => admin.noteSignIn(userId, at),
    log: () => undefined,
  })
  const accounts: AccountsDeps = {
    auth,
    limits: { signIn: { scans: 1000, seconds: 60 } },
    secureCookies: false,
    data,
    plans: withOverrides(planCatalogFrom(PLAN, ANONYMOUS), admin),
    apiKeys: keys,
    monitors,
    pdfs,
    admin,
    adminEmails: options.emails ?? [ADMIN_EMAIL],
    erase,
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
    ...(options.now === undefined ? {} : { now: options.now }),
    accounts,
  })
  const request = (
    method: string,
    path: string,
    init: {
      cookie?: string
      json?: unknown
      form?: Record<string, string>
      origin?: string | null
    } = {},
  ) => {
    const headers: Record<string, string> = {}
    if (init.origin !== null) headers.origin = init.origin ?? SITE.origin
    if (init.cookie !== undefined) headers.cookie = init.cookie
    if (init.json !== undefined) headers['content-type'] = 'application/json'
    if (init.form !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded'
    return app.request(path, {
      method,
      headers,
      ...(init.json === undefined ? {} : { body: JSON.stringify(init.json) }),
      ...(init.form === undefined ? {} : { body: new URLSearchParams(init.form).toString() }),
    })
  }
  const signInResponse = async (sub: string, name = sub) => {
    stubGoogle(idToken({ sub, email: `${sub}@example.com`, name }))
    return request('POST', '/api/session/one-tap', {
      json: { credential: idToken({ sub, email: `${sub}@example.com`, name }) },
    })
  }
  const signIn = async (sub: string, name = sub) => {
    const response = await signInResponse(sub, name)
    expect(response.status).toBe(200)
    return response.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
  }
  const userId = (sub: string): string => {
    const found = tables.user?.find((u) => u.email === `${sub}@example.com`)
    return typeof found?.id === 'string' ? found.id : ''
  }
  const withKey = async (cookie: string, name = 'CI') => {
    const made = await request('POST', '/api/account/keys', { cookie, json: { name } })
    expect(made.status).toBe(201)
    return ((await made.json()) as { secret: string; key: { id: string } }).secret
  }
  const call = (method: string, path: string, secret: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        authorization: `Bearer ${secret}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  return {
    app,
    request,
    signIn,
    signInResponse,
    userId,
    withKey,
    call,
    tables,
    admin,
    scans,
    keys,
    data,
  }
}
