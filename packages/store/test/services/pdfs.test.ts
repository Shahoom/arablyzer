import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateDatabase, PostgresPdfData, PostgresScanStore } from '../../src/index'
import { NOW, pdfContract } from '../pdf-contract'
import { database, hasPostgres } from './services'

const suffix = randomBytes(4).toString('hex')
const ROLES = {
  appRole: `app_${suffix}`,
  migrateRole: `migrate_${suffix}`,
  workerRole: `worker_${suffix}`,
}
const password = () => randomBytes(32).toString('hex')
const as = (role: string, secret: string, url: URL) => {
  const made = new URL(url)
  made.username = role
  made.password = secret
  return new pg.Pool({ connectionString: made.href, max: 12 })
}

describe.skipIf(!hasPostgres)('PDF export and the brand, on PostgreSQL', () => {
  const appSecret = password()
  const workerSecret = password()
  let drop: () => Promise<void>
  let app: pg.Pool
  let worker: pg.Pool
  let pdfs: PostgresPdfData

  beforeAll(async () => {
    const made = await database()
    drop = made.drop
    await migrateDatabase(made.pool, {
      appPassword: appSecret,
      workerPassword: workerSecret,
      ...ROLES,
    })
    app = as(ROLES.appRole, appSecret, made.url)
    worker = as(ROLES.workerRole, workerSecret, made.url)
    pdfs = new PostgresPdfData(app)
  })
  afterAll(async () => {
    await app.end()
    await worker.end()
    await drop()
    const cleanup = new pg.Client({ connectionString: process.env.ARABLYZER_TEST_DATABASE_URL })
    await cleanup.connect()
    for (const role of Object.values(ROLES)) await cleanup.query(`DROP ROLE IF EXISTS ${role}`)
    await cleanup.end()
  })

  pdfContract(() => ({
    pdfs,
    reset: async () => {
      await app.query('DELETE FROM pdf_jobs')
      await app.query('DELETE FROM pdf_usage')
    },
    scan: (scanId) =>
      new PostgresScanStore(app)
        .create({ id: scanId, url: 'https://shop.example/', createdAt: NOW })
        .then(() => undefined),
    user: async (id) => {
      await app.query(
        'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $1, $2, true, $3, $3) ON CONFLICT DO NOTHING',
        [id, `${id}@example.com`, NOW],
      )
    },
  }))

  it('closes the PDF tables to the worker’s role, and a deleted scan takes its PDF', async () => {
    for (const table of ['pdf_jobs', 'pdf_usage', 'account_brand']) {
      await expect(worker.query(`SELECT count(*) FROM ${table}`), table).rejects.toThrow(
        /permission denied/,
      )
    }
    const userId = 'pdf-owner'.padEnd(22, '_')
    const scanId = 'pdf-scan'.padEnd(22, '_')
    await app.query(
      'INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $1, $2, true, $3, $3)',
      [userId, `${userId}@example.com`, NOW],
    )
    await new PostgresScanStore(app).create({
      id: scanId,
      url: 'https://shop.example/',
      createdAt: NOW,
    })
    const made = await pdfs.create(
      {
        id: 'pdf-job'.padEnd(22, '_'),
        userId,
        kind: 'scan',
        subject: scanId,
        base: null,
        language: 'en',
        createdAt: NOW,
      },
      3,
    )
    expect(made.kind).toBe('created')
    await app.query('DELETE FROM scans WHERE id = $1', [scanId])
    expect(await pdfs.get('pdf-job'.padEnd(22, '_'))).toBeNull()
    // The account's erasure leaves nothing in the three tables.
    await pdfs.setBrand(userId, { name: 'x', color: null }, NOW)
    await app.query('DELETE FROM users WHERE id = $1', [userId])
    for (const table of ['pdf_jobs', 'pdf_usage', 'account_brand']) {
      const { rows } = await app.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`,
        [userId],
      )
      expect((rows[0] as { n: number }).n, table).toBe(0)
    }
  })
})
