import { randomBytes } from 'node:crypto'
import { DEFAULT_POLICY } from '@arablyzer/egress'
import { DEVELOPMENT_LIMITS } from '@arablyzer/plans'
import {
  authDatabase,
  authSchema,
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  PostgresScanStore,
} from '@arablyzer/store'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app'
import { createAuth } from '../../src/auth'
import { CLIENT_ID, CLIENT_SECRET, idToken, stubGoogle } from '../support/google'

// Accounts on PostgreSQL, where uniqueness, cascades and concurrency are the database's: the
// whole flow through createApp, and what is left of a person after they erase the account.
const databaseUrl = process.env.ARABLYZER_TEST_DATABASE_URL
if (process.env.ARABLYZER_REQUIRE_SERVICES === '1' && databaseUrl === undefined) {
  throw new Error('ARABLYZER_TEST_DATABASE_URL is required')
}

const SITE = new URL('https://arablyzer.example')

describe.skipIf(databaseUrl === undefined)('accounts on PostgreSQL', () => {
  let pool: pg.Pool
  let drop: () => Promise<void>
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    const name = `arablyzer_accounts_${randomBytes(6).toString('hex')}`
    const admin = new pg.Client({ connectionString: databaseUrl })
    await admin.connect()
    await admin.query(`CREATE DATABASE ${name}`)
    await admin.end()
    const url = new URL(databaseUrl ?? '')
    url.pathname = `/${name}`
    pool = new pg.Pool({ connectionString: url.href, max: 8 })
    drop = async () => {
      await pool.end()
      const cleanup = new pg.Client({ connectionString: databaseUrl })
      await cleanup.connect()
      await cleanup.query(`DROP DATABASE IF EXISTS ${name}`)
      await cleanup.end()
    }
    await new PostgresScanStore(pool).migrate()
    const auth = createAuth({
      site: SITE,
      secret: 'a'.repeat(40),
      database: drizzleAdapter(authDatabase(pool), {
        provider: 'pg',
        schema: authSchema,
        usePlural: true,
      }),
      google: { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET },
      production: false,
      log: () => undefined,
    })
    app = createApp({
      limits: DEVELOPMENT_LIMITS,
      policy: DEFAULT_POLICY,
      resolver: () => Promise.resolve([]),
      turnstile: () => Promise.resolve(true),
      limiter: new MemoryRateLimiter(),
      store: new PostgresScanStore(pool),
      queue: new MemoryScanQueue(),
      events: new MemoryScanEvents(20),
      inFlight: new MemoryInFlight(),
      address: () => '203.0.113.9',
      connectionKey: (a) => `key-of-${a}`,
      newId: () => 'scan000000000000000001',
      origin: SITE.origin,
      accounts: {
        auth,
        limits: { signIn: { scans: 1000, seconds: 60 } },
        secureCookies: false,
      },
    })
    stubGoogle()
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    await drop()
  })

  const send = (method: string, path: string, body?: unknown, cookie?: string) =>
    app.request(path, {
      method,
      headers: {
        origin: SITE.origin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie === undefined ? {} : { cookie }),
        'user-agent': 'Mozilla/5.0 (a real browser)',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const oneTap = (claims = {}) =>
    send('POST', '/api/session/one-tap', { credential: idToken(claims) })
  const cookieOf = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')

  it('signs in, reads the account, signs out, and signs in to the same account', async () => {
    const first = await oneTap({ sub: 'flow-1', email: 'flow@example.com' })
    expect(first.status).toBe(200)
    const cookie = cookieOf(first)
    expect((await send('GET', '/api/account', undefined, cookie)).status).toBe(200)
    expect((await send('DELETE', '/api/session', undefined, cookie)).status).toBe(204)
    expect((await send('GET', '/api/account', undefined, cookie)).status).toBe(401)
    const again = await oneTap({ sub: 'flow-1', email: 'flow@example.com' })
    expect(again.status).toBe(200)
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM users WHERE email = 'flow@example.com'",
    )
    expect(rows).toEqual([{ n: 1 }])
  })

  it('keeps no address, agent or token of the person in any row', async () => {
    await oneTap({ sub: 'keep-1', email: 'keep@example.com' })
    const sessions = await pool.query('SELECT ip_address, user_agent FROM sessions')
    for (const row of sessions.rows) expect(row).toEqual({ ip_address: null, user_agent: null })
    const accounts = await pool.query(
      "SELECT access_token, refresh_token, id_token, password FROM accounts WHERE account_id = 'keep-1'",
    )
    expect(accounts.rows).toEqual([
      { access_token: null, refresh_token: null, id_token: null, password: null },
    ])
    const users = await pool.query("SELECT image FROM users WHERE email = 'keep@example.com'")
    expect(users.rows).toEqual([{ image: null }])
  })

  it('makes one person of the same Google account arriving at once, never a server error', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        Promise.resolve(oneTap({ sub: 'race-1', email: 'race@example.com' })),
      ),
    )
    for (const result of results) expect([200, 400, 503]).toContain(result.status)
    expect(results.some((result) => result.status === 200)).toBe(true)
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM users WHERE email = 'race@example.com'",
    )
    expect(rows).toEqual([{ n: 1 }])
  })

  it('leaves nothing of the person, in any table, once they erase the account', async () => {
    const response = await oneTap({ sub: 'erase-1', email: 'erase@example.com' })
    const cookie = cookieOf(response)
    const { id } = (await response.json()) as { id: string }
    expect((await send('DELETE', '/api/account', { confirm: true }, cookie)).status).toBe(204)
    expect((await send('GET', '/api/account', undefined, cookie)).status).toBe(401)
    const tables = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    )
    expect(tables.rows.length).toBeGreaterThanOrEqual(5)
    for (const { table_name: table } of tables.rows) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM "${table}" t WHERE t::text LIKE $1 OR t::text LIKE $2 OR t::text LIKE $3`,
        [`%${id}%`, '%erase@example.com%', '%erase-1%'],
      )
      expect(rows, table).toEqual([{ n: 0 }])
    }
  })
})
