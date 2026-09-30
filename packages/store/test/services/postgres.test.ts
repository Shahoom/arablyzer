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

  it("lists no overall score for a tool page's scan: the score is a whole scan's", async () => {
    const id = 'AbCdEfGhIjKlMnOpQrSt_u'
    await store.create({ id, url: 'https://example.com/', createdAt: NOW, tool: 'rtl-check' })
    await store.start(id, NOW)
    // Its two rules passed: 100, of those rules alone.
    const report = { scan: { status: 'complete' }, score: { overall: 100 } } as unknown as Report
    expect(await store.finish(id, report, NOW)).toBe(true)
    expect(await store.get(id)).toMatchObject({ state: 'complete', tool: 'rtl-check', report })
    const { rows } = await pool.query<{ score: number | null }>(
      'SELECT score FROM scans WHERE id = $1',
      [id],
    )
    expect(rows[0]?.score).toBeNull()
  })

  // M2.3c review: a scan of a page the site answered with a challenge, or refused, has no score
  // (packages/scoring), and the listing's column keeps none, not a stale or zero one.
  it('lists no score for a scan that never reached its page', async () => {
    const id = 'AbCdEfGhIjKlMnOpQrSt_v'
    await store.create({ id, url: 'https://example.com/', createdAt: NOW })
    await store.start(id, NOW)
    const report = { scan: { status: 'partial' }, score: { overall: null } } as unknown as Report
    expect(await store.finish(id, report, NOW)).toBe(true)
    expect(await store.get(id)).toMatchObject({ state: 'partial', tool: null, report })
    const { rows } = await pool.query<{ score: number | null }>(
      'SELECT score FROM scans WHERE id = $1',
      [id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.score).toBeNull()
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

  it('says where each scan is without reading their reports, and leaves out those it has not', async () => {
    const [queued, running, done] = [
      'AbCdEfGhIjKlMnOpQrSt_6',
      'AbCdEfGhIjKlMnOpQrSt_7',
      'AbCdEfGhIjKlMnOpQrSt_8',
    ]
    for (const id of [queued, running, done]) {
      await store.create({ id, url: 'https://example.com/', createdAt: NOW })
    }
    await store.start(running, NOW)
    await store.start(done, NOW)
    await store.finish(
      done,
      { scan: { status: 'complete' }, score: { overall: 90 } } as unknown as Report,
      NOW,
    )
    expect(await store.states([queued, running, done, 'AbCdEfGhIjKlMnOpQrSt_9'])).toEqual(
      new Map([
        [queued, 'queued'],
        [running, 'running'],
        [done, 'complete'],
      ]),
    )
    expect(await store.states([])).toEqual(new Map())
  })

  describe('deleting a report with its token', () => {
    const create = (id: string, deleteTokenHash?: string) =>
      store.create({
        id,
        url: 'https://example.com/?token=secret',
        createdAt: NOW,
        ...(deleteTokenHash === undefined ? {} : { deleteTokenHash }),
      })
    const hashes = async (id: string) =>
      (
        await pool.query<{ delete_token_hash: string | null }>(
          'SELECT delete_token_hash FROM scans WHERE id = $1',
          [id],
        )
      ).rows[0]?.delete_token_hash

    it('keeps the hash it is given, and never gives it back with the scan', async () => {
      await create('AbCdEfGhIjKlMnOpQrSt_h', 'a'.repeat(64))
      expect(await hashes('AbCdEfGhIjKlMnOpQrSt_h')).toBe('a'.repeat(64))
      expect(JSON.stringify(await store.get('AbCdEfGhIjKlMnOpQrSt_h'))).not.toContain('aaaa')
      await create('AbCdEfGhIjKlMnOpQrSt_i')
      expect(await hashes('AbCdEfGhIjKlMnOpQrSt_i')).toBeNull()
    })

    it('deletes the scan and its report for the hash, and for no other, in any state', async () => {
      const id = 'AbCdEfGhIjKlMnOpQrSt_j'
      await create(id, 'b'.repeat(64))
      await store.start(id, NOW)
      await store.finish(
        id,
        { scan: { status: 'complete' }, score: { overall: 90 } } as unknown as Report,
        NOW,
      )
      expect(await store.delete(id, 'c'.repeat(64))).toBe('forbidden')
      expect(await store.delete(id, '')).toBe('forbidden')
      expect(await store.get(id)).not.toBeNull()
      expect(await store.delete(id, 'b'.repeat(64))).toBe('deleted')
      expect(await store.get(id)).toBeNull()
      expect(await store.delete(id, 'b'.repeat(64))).toBe('missing')
      const queued = 'AbCdEfGhIjKlMnOpQrSt_k'
      await create(queued, 'd'.repeat(64))
      expect(await store.delete(queued, 'd'.repeat(64))).toBe('deleted')
    })

    it('never deletes a scan that has no hash, as those before the token had none', async () => {
      const id = 'AbCdEfGhIjKlMnOpQrSt_l'
      await create(id)
      for (const guess of ['', 'null', 'NULL', ' ']) {
        expect(await store.delete(id, guess), JSON.stringify(guess)).toBe('forbidden')
      }
      expect(await store.get(id)).not.toBeNull()
    })
  })

  describe('retention', () => {
    const day = 24 * 60 * 60 * 1000
    const ago = (days: number) => new Date(NOW.getTime() - days * day)
    /** A store of its own, so the scans of the tests before it are not counted. */
    async function fresh(batch?: number) {
      const own = await database()
      const scans = new PostgresScanStore(
        own.pool,
        batch === undefined ? {} : { deleteBatch: batch },
      )
      await scans.migrate()
      return { ...own, scans }
    }

    it('deletes the scans created before a time, in any state, and their reports, and only those', async () => {
      const { scans, pool, drop } = await fresh()
      try {
        const report = { scan: { status: 'complete' }, score: { overall: 90 } } as unknown as Report
        const made = async (id: string, days: number) =>
          scans.create({ id, url: 'https://example.com/?token=secret', createdAt: ago(days) })
        await made('AbCdEfGhIjKlMnOpQrSt_a', 120)
        await made('AbCdEfGhIjKlMnOpQrSt_b', 45)
        await made('AbCdEfGhIjKlMnOpQrSt_c', 30)
        await made('AbCdEfGhIjKlMnOpQrSt_d', 2)
        await scans.start('AbCdEfGhIjKlMnOpQrSt_a', NOW)
        await scans.finish('AbCdEfGhIjKlMnOpQrSt_a', report, NOW)
        await scans.fail('AbCdEfGhIjKlMnOpQrSt_b', NOW)
        expect(await scans.deleteOlderThan(ago(30))).toBe(2)
        expect(await scans.get('AbCdEfGhIjKlMnOpQrSt_a')).toBeNull()
        expect(await scans.get('AbCdEfGhIjKlMnOpQrSt_b')).toBeNull()
        // At the cutoff is not older than it.
        expect(await scans.get('AbCdEfGhIjKlMnOpQrSt_c')).not.toBeNull()
        expect(await scans.get('AbCdEfGhIjKlMnOpQrSt_d')).not.toBeNull()
        const { rows } = await pool.query<{ count: string }>('SELECT count(*) FROM scans')
        expect(rows[0]?.count).toBe('2')
        expect(await scans.deleteOlderThan(ago(30))).toBe(0)
      } finally {
        await drop()
      }
    })

    it('deletes in batches, so no one statement holds many reports, until none is left', async () => {
      const { scans, pool, drop } = await fresh(2)
      try {
        for (let i = 0; i < 7; i++) {
          await scans.create({
            id: `AbCdEfGhIjKlMnOpQrSt_${String(i)}`,
            url: 'https://example.com/',
            createdAt: ago(60 + i),
          })
        }
        await scans.create({
          id: 'AbCdEfGhIjKlMnOpQrSt_k',
          url: 'https://example.com/',
          createdAt: ago(1),
        })
        expect(await scans.deleteOlderThan(ago(30))).toBe(7)
        const { rows } = await pool.query<{ id: string }>('SELECT id FROM scans')
        expect(rows.map((row) => row.id)).toEqual(['AbCdEfGhIjKlMnOpQrSt_k'])
      } finally {
        await drop()
      }
    })
  })

  it('migrates once when processes start together', async () => {
    await Promise.all([store.migrate(), new PostgresScanStore(pool).migrate()])
  })
})
