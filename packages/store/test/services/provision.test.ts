import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateDatabase, PostgresScanStore } from '../../src/index'
import { database, hasPostgres } from './services'

const NOW = new Date('2026-09-30T12:00:00.000Z')
const suffix = randomBytes(4).toString('hex')
/** Roles are the cluster's, not a database's: these have names of their own, and are dropped. */
const ROLES = { appRole: `app_${suffix}`, migrateRole: `migrate_${suffix}` }
const password = () => randomBytes(32).toString('hex')

/** A pool that connects as one of the roles, to one of the test databases. */
function as(role: string, secret: string, database: URL): pg.Pool {
  const url = new URL(database)
  url.username = role
  url.password = secret
  return new pg.Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 5_000 })
}

const DENIED =
  /permission denied|must be owner|must be superuser|must be able to SET ROLE|not permitted/i

describe.skipIf(!hasPostgres)('the database roles', () => {
  const opened: { pool: pg.Pool; drop: () => Promise<void> }[] = []
  const pools: pg.Pool[] = []
  afterAll(async () => {
    for (const pool of pools) await pool.end()
    for (const { drop } of opened.reverse()) await drop()
    // Every database that held anything of the roles is gone: they can be too.
    const cleanup = new pg.Client({ connectionString: process.env.ARABLYZER_TEST_DATABASE_URL })
    await cleanup.connect()
    for (const role of Object.values(ROLES)) await cleanup.query(`DROP ROLE IF EXISTS ${role}`)
    await cleanup.end()
  })

  /** A new database, its schema made and its roles set by `migrateDatabase`. */
  async function provisioned(appPassword: string) {
    const made = await database()
    opened.push(made)
    await migrateDatabase(made.pool, { appPassword, ...ROLES })
    return made
  }

  describe('on a new database', () => {
    const secret = password()
    let admin: pg.Pool
    let app: pg.Pool
    let url: URL
    beforeAll(async () => {
      const made = await provisioned(secret)
      admin = made.pool
      url = made.url
      app = as(ROLES.appRole, secret, url)
      pools.push(app)
    })

    it('leave the application to read and write scans, and to delete them', async () => {
      const id = 'AbCdEfGhIjKlMnOpQrSt_r'
      const store = new PostgresScanStore(app)
      await store.create({ id, url: 'https://example.com/', createdAt: NOW })
      expect(await store.start(id, NOW)).toBe(true)
      expect(await store.fail(id, NOW)).toBe(true)
      expect(await store.get(id)).toMatchObject({ id, state: 'failed', finishedAt: NOW })
      expect(await store.failStale(new Date(NOW.getTime() + 1), NOW)).toEqual([])
    })

    it('leave the application to delete a scan, which retention and a visitor’s own deletion do', async () => {
      const id = 'AbCdEfGhIjKlMnOpQrSt_d'
      const store = new PostgresScanStore(app)
      await store.create({ id, url: 'https://example.com/', createdAt: NOW })
      await app.query('DELETE FROM scans WHERE id = $1', [id])
      expect(await store.get(id)).toBeNull()
    })

    it('are not a superuser, and can make nothing', async () => {
      const { rows } = await app.query<Record<string, boolean>>(
        `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
         FROM pg_roles WHERE rolname = current_user`,
      )
      expect(Object.values(rows[0] ?? {})).toEqual([false, false, false, false, false])
    })

    it('keep the application from changing the schema, the data it has, or the server', async () => {
      for (const statement of [
        'TRUNCATE scans',
        'DROP TABLE scans',
        'ALTER TABLE scans ADD COLUMN extra integer',
        'CREATE TABLE elsewhere (a integer)',
        'CREATE TEMPORARY TABLE elsewhere (a integer)',
        'CREATE SCHEMA elsewhere',
        'CREATE INDEX elsewhere ON scans (url)',
        'CREATE EXTENSION IF NOT EXISTS pgcrypto',
        'SELECT * FROM drizzle.__drizzle_migrations',
        'DELETE FROM drizzle.__drizzle_migrations',
        `CREATE ROLE ${ROLES.appRole}_other`,
        `SET ROLE ${ROLES.migrateRole}`,
        "COPY scans TO PROGRAM 'true'",
        "COPY scans TO '/tmp/scans'",
        "SELECT pg_read_file('/etc/passwd')",
        "ALTER SYSTEM SET log_statement = 'all'",
      ]) {
        await expect(app.query(statement), statement).rejects.toThrow(DENIED)
      }
    })

    it('give the tables to a role that cannot log in', async () => {
      const { rows } = await admin.query<{ tableowner: string }>(
        "SELECT tableowner FROM pg_tables WHERE tablename = 'scans' OR tablename = '__drizzle_migrations'",
      )
      expect(rows.map((row) => row.tableowner)).toEqual([ROLES.migrateRole, ROLES.migrateRole])
      const owner = await admin.query<{ rolcanlogin: boolean; rolsuper: boolean }>(
        'SELECT rolcanlogin, rolsuper FROM pg_roles WHERE rolname = $1',
        [ROLES.migrateRole],
      )
      expect(owner.rows[0]).toEqual({ rolcanlogin: false, rolsuper: false })
      const login = as(ROLES.migrateRole, secret, url)
      pools.push(login)
      await expect(login.query('SELECT 1')).rejects.toThrow(
        /password authentication failed|not permitted to log in/,
      )
    })

    it('leave a table a later migration makes to the application to read and write', async () => {
      await admin.query(`SET ROLE ${ROLES.migrateRole}`)
      try {
        await admin.query('CREATE TABLE later (id text PRIMARY KEY, n serial)')
      } finally {
        await admin.query('RESET ROLE')
      }
      await app.query("INSERT INTO later (id) VALUES ('a')")
      expect((await app.query('SELECT id, n FROM later')).rows).toEqual([{ id: 'a', n: 1 }])
      await app.query("UPDATE later SET id = 'b'")
      await app.query('DELETE FROM later')
      await expect(app.query('TRUNCATE later')).rejects.toThrow(DENIED)
    })
  })

  it('run again to the same end, and set the password they are given', async () => {
    const first = password()
    const second = password()
    const { pool, url } = await provisioned(first)
    const before = as(ROLES.appRole, first, url)
    pools.push(before)
    await before.query('SELECT 1')
    // A second run of the same version changes nothing but the password.
    await migrateDatabase(pool, { appPassword: second, ...ROLES })
    await expect(as(ROLES.appRole, first, url).query('SELECT 1')).rejects.toThrow(
      /password authentication failed/,
    )
    const after = as(ROLES.appRole, second, url)
    pools.push(after)
    expect((await after.query('SELECT count(*)::int AS n FROM scans')).rows).toEqual([{ n: 0 }])
  })

  it('take a database an older version made under the bootstrap user, data and all', async () => {
    const secret = password()
    const made = await database()
    opened.push(made)
    // Before the roles: the API migrated as the one user, which owns the tables.
    const old = new PostgresScanStore(made.pool)
    await old.migrate()
    await old.create({ id: 'AbCdEfGhIjKlMnOpQrSt_o', url: 'https://example.com/', createdAt: NOW })
    const before = await made.pool.query<{ tableowner: string }>(
      "SELECT tableowner FROM pg_tables WHERE tablename = 'scans'",
    )
    expect(before.rows[0]?.tableowner).not.toBe(ROLES.migrateRole)

    await migrateDatabase(made.pool, { appPassword: secret, ...ROLES })
    const owners = await made.pool.query<{ tableowner: string }>(
      "SELECT tableowner FROM pg_tables WHERE tablename IN ('scans', '__drizzle_migrations')",
    )
    expect(owners.rows.map((row) => row.tableowner)).toEqual([ROLES.migrateRole, ROLES.migrateRole])
    const app = as(ROLES.appRole, secret, made.url)
    pools.push(app)
    expect((await new PostgresScanStore(app).get('AbCdEfGhIjKlMnOpQrSt_o'))?.state).toBe('queued')
    await expect(app.query('DROP TABLE scans')).rejects.toThrow(DENIED)
  })

  it('put a role back that drifted: a superuser, a member of the owner, rights too many', async () => {
    const secret = password()
    const { pool, url } = await provisioned(secret)
    await pool.query(`ALTER ROLE ${ROLES.appRole} SUPERUSER CREATEDB`)
    await pool.query(`GRANT TRUNCATE, REFERENCES, TRIGGER ON scans TO ${ROLES.appRole}`)
    await pool.query(`GRANT CREATE ON SCHEMA public TO ${ROLES.appRole}`)
    await pool.query(`GRANT ${ROLES.migrateRole} TO ${ROLES.appRole}`)
    await pool.query(`GRANT USAGE ON SCHEMA drizzle TO ${ROLES.appRole}`)
    await pool.query(`GRANT SELECT ON drizzle.__drizzle_migrations TO ${ROLES.appRole}`)
    await migrateDatabase(pool, { appPassword: secret, ...ROLES })
    const app = as(ROLES.appRole, secret, url)
    pools.push(app)
    const { rows } = await app.query<{ rolsuper: boolean; rolcreatedb: boolean }>(
      'SELECT rolsuper, rolcreatedb FROM pg_roles WHERE rolname = current_user',
    )
    expect(rows[0]).toEqual({ rolsuper: false, rolcreatedb: false })
    await expect(app.query('TRUNCATE scans')).rejects.toThrow(DENIED)
    await expect(app.query('CREATE TABLE crept (a integer)')).rejects.toThrow(DENIED)
    await expect(app.query(`SET ROLE ${ROLES.migrateRole}`)).rejects.toThrow(DENIED)
    await expect(app.query('SELECT * FROM drizzle.__drizzle_migrations')).rejects.toThrow(DENIED)
    await app.query('DELETE FROM scans')
  })

  it('refuses names it would have to quote, and one role for both jobs', async () => {
    const { pool } = await database().then((made) => (opened.push(made), made))
    await expect(
      migrateDatabase(pool, { appPassword: password(), appRole: 'Bad Role', migrateRole: 'm' }),
    ).rejects.toThrow(/lower case letters/)
    await expect(
      migrateDatabase(pool, { appPassword: password(), appRole: 'same', migrateRole: 'same' }),
    ).rejects.toThrow(/two roles/)
  })
})
