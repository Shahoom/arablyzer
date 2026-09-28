import type { Report } from '@arablyzer/report-schema'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresScanStore } from '../../src/index'
import { database, hasPostgres } from './services'

const NOW = new Date('2026-09-28T12:00:00.000Z')

describe.skipIf(!hasPostgres)('PostgreSQL', () => {
  let pool: pg.Pool
  let drop: () => Promise<void>
  let store: PostgresScanStore

  beforeAll(async () => {
    ;({ pool, drop } = await database())
    store = new PostgresScanStore(pool)
    await store.migrate()
    // A second migration of the same version does nothing.
    await store.migrate()
  })
  afterAll(async () => {
    await drop()
  })

  it('keeps a scan from queued to its report', async () => {
    const id = 'AbCdEfGhIjKlMnOpQrSt_1'
    await store.create({ id, url: 'https://example.com/', createdAt: NOW })
    expect(await store.get(id)).toEqual({
      id,
      url: 'https://example.com/',
      state: 'queued',
      createdAt: NOW,
      startedAt: null,
      finishedAt: null,
      report: null,
    })
    await store.start(id, NOW)
    const report = {
      scan: { status: 'partial' },
      score: { overall: 81 },
      findings: [{ message: { ar: 'نص عربي «مقتبس»' } }],
    } as unknown as Report
    await store.finish(id, report, NOW)
    expect(await store.get(id)).toMatchObject({
      state: 'partial',
      startedAt: NOW,
      finishedAt: NOW,
      report,
    })
    const { rows } = await pool.query<{ score: number | null }>(
      'SELECT score FROM scans WHERE id = $1',
      [id],
    )
    expect(rows[0]?.score).toBe(81)
  })

  it('fails a scan that could not run, and knows no scan it was not given', async () => {
    const id = 'AbCdEfGhIjKlMnOpQrSt_2'
    await store.create({ id, url: 'https://example.com/', createdAt: NOW })
    await store.fail(id, NOW)
    expect(await store.get(id)).toMatchObject({ state: 'failed', report: null })
    expect(await store.get('AbCdEfGhIjKlMnOpQrSt_9')).toBeNull()
    await expect(store.start('AbCdEfGhIjKlMnOpQrSt_9', NOW)).rejects.toThrow(/No scan/)
    await expect(
      store.create({ id, url: 'https://example.com/', createdAt: NOW }),
    ).rejects.toThrow()
  })
})
