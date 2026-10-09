import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateDatabase, PostgresAuthMaintenance } from '../../src/index'
import { database, hasPostgres } from './services'

const suffix = randomBytes(4).toString('hex')
const ROLES = {
  appRole: `app_${suffix}`,
  migrateRole: `migrate_${suffix}`,
  workerRole: `worker_${suffix}`,
}
const password = () => randomBytes(32).toString('hex')
const DENIED = /permission denied|must be owner/i
const NOW = new Date('2026-10-09T12:00:00.000Z')
const AT = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

describe.skipIf(!hasPostgres)('the accounts tables', () => {
  const secret = password()
  let drop: () => Promise<void>
  let app: pg.Pool
  let admin: pg.Pool
  beforeAll(async () => {
    const made = await database()
    drop = made.drop
    admin = made.pool
    await migrateDatabase(made.pool, {
      appPassword: secret,
      workerPassword: password(),
      ...ROLES,
    })
    const url = new URL(made.url)
    url.username = ROLES.appRole
    url.password = secret
    app = new pg.Pool({ connectionString: url.href, max: 2 })
  })
  afterAll(async () => {
    await app.end()
    await drop()
    const cleanup = new pg.Client({ connectionString: process.env.ARABLYZER_TEST_DATABASE_URL })
    await cleanup.connect()
    for (const role of Object.values(ROLES)) await cleanup.query(`DROP ROLE IF EXISTS ${role}`)
    await cleanup.end()
  })

  const addUser = (id: string, email: string) =>
    app.query(
      'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $2, $3, true, $4, $4)',
      [id, 'Ali', email, NOW],
    )
  const addSession = (id: string, user: string, expires: Date) =>
    app.query(
      'INSERT INTO sessions (id, token, user_id, expires_at, created_at, updated_at) VALUES ($1, $1, $2, $3, $4, $4)',
      [id, user, expires, NOW],
    )

  it('belong to the migration role, which the application is not', async () => {
    const { rows } = await admin.query<{ tableowner: string }>(
      "SELECT tableowner FROM pg_tables WHERE tablename IN ('users', 'sessions', 'accounts', 'verifications')",
    )
    expect(rows.map((row) => row.tableowner)).toEqual(Array(4).fill(ROLES.migrateRole))
    await expect(app.query('ALTER TABLE users ADD COLUMN crept text')).rejects.toThrow(DENIED)
    await expect(app.query('TRUNCATE users')).rejects.toThrow(DENIED)
  })

  it("lose a person's sessions and accounts with them", async () => {
    await addUser('u-cascade', 'cascade@example.com')
    await addSession('s-cascade', 'u-cascade', AT(60))
    await app.query(
      "INSERT INTO accounts (id, account_id, provider_id, user_id, created_at, updated_at) VALUES ('a-cascade', 'g', 'google', 'u-cascade', $1, $1)",
      [NOW],
    )
    await app.query("DELETE FROM users WHERE id = 'u-cascade'")
    for (const table of ['sessions', 'accounts']) {
      const { rows } = await app.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE user_id = 'u-cascade'`,
      )
      expect(rows).toEqual([{ n: 0 }])
    }
  })

  it('keep one person for one address, and a language that is ar, en or nothing', async () => {
    await addUser('u-one', 'one@example.com')
    await expect(addUser('u-two', 'one@example.com')).rejects.toThrow(/unique/i)
    await app.query("UPDATE users SET language = 'en' WHERE id = 'u-one'")
    await app.query("UPDATE users SET language = NULL WHERE id = 'u-one'")
    await expect(app.query("UPDATE users SET language = 'fr' WHERE id = 'u-one'")).rejects.toThrow(
      /users_language/,
    )
  })

  it('are swept by expiry: only what has expired goes, and is counted', async () => {
    await addUser('u-sweep', 'sweep@example.com')
    await addSession('s-old', 'u-sweep', AT(-5))
    await addSession('s-live', 'u-sweep', AT(60))
    for (const [id, expires] of [
      ['v-old', AT(-1)],
      ['v-live', AT(10)],
    ] as const) {
      await app.query(
        "INSERT INTO verifications (id, identifier, value, expires_at, created_at, updated_at) VALUES ($1, $1, '{}', $2, $3, $3)",
        [id, expires, NOW],
      )
    }
    const gone = await new PostgresAuthMaintenance(app).deleteExpired(NOW)
    expect(gone).toEqual({ sessions: 1, verifications: 1 })
    const left = await app.query<{ id: string }>(
      "SELECT id FROM sessions WHERE user_id = 'u-sweep' UNION ALL SELECT id FROM verifications ORDER BY id",
    )
    expect(left.rows.map((row) => row.id)).toEqual(['s-live', 'v-live'])
    expect(await new PostgresAuthMaintenance(app).deleteExpired(NOW)).toEqual({
      sessions: 0,
      verifications: 0,
    })
  })
})
