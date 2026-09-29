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
      tool: null,
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

  it("keeps the tool a tool page's scan ran", async () => {
    const id = 'AbCdEfGhIjKlMnOpQrSt_t'
    await store.create({ id, url: 'https://example.com/', createdAt: NOW, tool: 'rtl-check' })
    expect((await store.get(id))?.tool).toBe('rtl-check')
  })

  it('fails a scan that could not run, and knows no scan it was not given', async () => {
    const id = 'AbCdEfGhIjKlMnOpQrSt_2'
    await store.create({ id, url: 'https://example.com/', createdAt: NOW })
    expect(await store.fail(id, NOW)).toBe(true)
    expect(await store.get(id)).toMatchObject({ state: 'failed', report: null })
    expect(await store.get('AbCdEfGhIjKlMnOpQrSt_9')).toBeNull()
    expect(await store.start('AbCdEfGhIjKlMnOpQrSt_9', NOW)).toBe(false)
    await expect(
      store.create({ id, url: 'https://example.com/', createdAt: NOW }),
    ).rejects.toThrow()
  })

  it('moves a scan one way only: never started twice, never failed once it has a report', async () => {
    const id = 'AbCdEfGhIjKlMnOpQrSt_3'
    const report = { scan: { status: 'complete' }, score: { overall: 90 } } as unknown as Report
    await store.create({ id, url: 'https://example.com/', createdAt: NOW })
    expect(await store.finish(id, report, NOW)).toBe(false)
    expect(await store.start(id, NOW)).toBe(true)
    expect(await store.start(id, NOW)).toBe(false)
    expect(await store.finish(id, report, NOW)).toBe(true)
    expect(await store.fail(id, NOW)).toBe(false)
    expect(await store.get(id)).toMatchObject({ state: 'complete', report })
  })

  it('fails the scans left running since before a time, and only those', async () => {
    const [old, recent] = ['AbCdEfGhIjKlMnOpQrSt_4', 'AbCdEfGhIjKlMnOpQrSt_5']
    for (const id of [old, recent]) {
      await store.create({ id, url: 'https://example.com/', createdAt: NOW })
    }
    await store.start(old, new Date(NOW.getTime() - 20 * 60_000))
    await store.start(recent, NOW)
    expect(await store.failStale(new Date(NOW.getTime() - 10 * 60_000), NOW)).toEqual([old])
    expect(await store.get(old)).toMatchObject({ state: 'failed' })
    expect(await store.get(recent)).toMatchObject({ state: 'running' })
  })

  it('migrates once when processes start together', async () => {
    await Promise.all([store.migrate(), new PostgresScanStore(pool).migrate()])
  })
})
