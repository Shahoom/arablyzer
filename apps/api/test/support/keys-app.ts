import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS, planCatalogFrom } from '@arablyzer/plans'
import {
  MemoryAccountData,
  MemoryApiKeyData,
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { expect } from 'vitest'
import type { AccountsDeps } from '../../src/accounts'
import { createApp } from '../../src/app'
import { createAuth } from '../../src/auth'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle } from './google'

// An app with accounts and API keys in memory, a person who can sign in, and calls with a key.
export const SITE = new URL('https://arablyzer.example')
const PLAN = {
  ARABLYZER_PLAN_ACCOUNT_SCANS: '4',
  ARABLYZER_PLAN_ACCOUNT_SCAN_SECONDS: '60',
  ARABLYZER_PLAN_ACCOUNT_INFLIGHT: '20',
  ARABLYZER_PLAN_ACCOUNT_SAVED_SITES: '2',
  ARABLYZER_PLAN_ACCOUNT_HISTORY_DAYS: '30',
}
const ANONYMOUS = { ...DEVELOPMENT_LIMITS, perConnection: { scans: 1, seconds: 60 }, inFlight: 1 }

export function setup(options: { accounts?: boolean; plan?: Record<string, string> } = {}) {
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
