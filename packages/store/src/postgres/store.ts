import { fileURLToPath } from 'node:url'
import type { ScanState } from '@arablyzer/api-contract'
import type { Report } from '@arablyzer/report-schema'
import { and, eq, exists, inArray, lt, notExists, sql, type SQL } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import type { Pool } from 'pg'
import type { Deletion, NewScan, RetentionScope, ScanRecord, ScanStore } from '../types'
import { scans } from './schema'
import { accountScans } from './site-schema'

export const MIGRATIONS = fileURLToPath(new URL('../../drizzle/', import.meta.url))
/** The advisory lock the migration holds, so API processes that start together migrate once. */
export const MIGRATION_LOCK = 0x6172_6162 // "arab"

/** How many scans one statement of a retention sweep deletes: each holds a report. */
const DELETE_BATCH = 500

export interface PostgresScanStoreOptions {
  /** How many scans one statement of deleteOlderThan deletes; tests make it small. */
  readonly deleteBatch?: number
}

/** Scans in PostgreSQL through Drizzle. */
export class PostgresScanStore implements ScanStore {
  readonly #pool: Pool
  readonly #db: NodePgDatabase<{ scans: typeof scans }>
  readonly #deleteBatch: number

  constructor(pool: Pool, options: PostgresScanStoreOptions = {}) {
    this.#pool = pool
    this.#db = drizzle(pool, { schema: { scans } })
    this.#deleteBatch = options.deleteBatch ?? DELETE_BATCH
  }

  /** Brings the tables up to this version's schema (packages/store/drizzle), one process at a time. */
  async migrate(): Promise<void> {
    const client = await this.#pool.connect()
    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK])
      try {
        await migrate(drizzle(client), { migrationsFolder: MIGRATIONS })
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK])
      }
    } finally {
      client.release()
    }
  }

  async create(scan: NewScan): Promise<void> {
    await this.#db.insert(scans).values({
      id: scan.id,
      url: scan.url,
      createdAt: scan.createdAt,
      tool: scan.tool ?? null,
      state: 'queued',
      deleteTokenHash: scan.deleteTokenHash ?? null,
    })
  }

  async get(id: string): Promise<ScanRecord | null> {
    const [row] = await this.#db.select().from(scans).where(eq(scans.id, id)).limit(1)
    if (row === undefined) return null
    return {
      id: row.id,
      url: row.url,
      tool: row.tool,
      state: row.state,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      report: row.report,
    }
  }

  start(id: string, at: Date): Promise<boolean> {
    return this.#move(id, ['queued'], { state: 'running', startedAt: at })
  }

  finish(id: string, report: Report, at: Date): Promise<boolean> {
    return this.#move(id, ['running'], {
      state: report.scan.status,
      finishedAt: at,
      report,
      // The overall score is a whole scan's: a tool's scan ran the tool's rules alone (M2.2).
      score: sql`CASE WHEN ${scans.tool} IS NULL THEN ${report.score.overall}::integer END`,
    })
  }

  fail(id: string, at: Date): Promise<boolean> {
    return this.#move(id, ['queued', 'running'], { state: 'failed', finishedAt: at })
  }

  async failStale(startedBefore: Date, at: Date): Promise<string[]> {
    const rows = await this.#update(
      and(eq(scans.state, 'running'), lt(scans.startedAt, startedBefore)),
      { state: 'failed', finishedAt: at },
    )
    return rows.map((row) => row.id)
  }

  async delete(id: string, tokenHash: string): Promise<Deletion> {
    // One statement decides: the row goes only where the hash is its own, and a null hash is no
    // hash. Only when nothing went, is the scan asked for, to tell a wrong hash from no scan.
    const deleted = await this.#db
      .delete(scans)
      .where(and(eq(scans.id, id), eq(scans.deleteTokenHash, tokenHash)))
      .returning({ id: scans.id })
    if (deleted.length > 0) return 'deleted'
    const [row] = await this.#db
      .select({ id: scans.id })
      .from(scans)
      .where(eq(scans.id, id))
      .limit(1)
    return row === undefined ? 'missing' : 'forbidden'
  }

  async deleteOlderThan(before: Date, scope: RetentionScope = 'unlinked'): Promise<number> {
    // Whose scans: those an account keeps are told apart by the link's scan id alone, the one
    // column of that table the worker's role can read.
    const kept = this.#db
      .select({ id: accountScans.scanId })
      .from(accountScans)
      .where(eq(accountScans.scanId, scans.id))
    const whose = scope === 'linked' ? exists(kept) : notExists(kept)
    // In batches, so no one statement holds the reports of a table's worth of scans: the first
    // sweep after retention is set may find years of them.
    let deleted = 0
    for (;;) {
      const oldest = this.#db
        .select({ id: scans.id })
        .from(scans)
        .where(and(lt(scans.createdAt, before), whose))
        .limit(this.#deleteBatch)
      const rows = await this.#db
        .delete(scans)
        .where(inArray(scans.id, oldest))
        .returning({ id: scans.id })
      deleted += rows.length
      if (rows.length < this.#deleteBatch) return deleted
    }
  }

  async states(ids: readonly string[]): Promise<ReadonlyMap<string, ScanState>> {
    if (ids.length === 0) return new Map()
    const rows = await this.#db
      .select({ id: scans.id, state: scans.state })
      .from(scans)
      .where(inArray(scans.id, [...ids]))
    return new Map(rows.map((row) => [row.id, row.state]))
  }

  /** The change, made only when the scan is in one of the states it moves from. */
  async #move(
    id: string,
    from: readonly ScanState[],
    change: PgUpdateSetSource<typeof scans>,
  ): Promise<boolean> {
    const rows = await this.#update(and(eq(scans.id, id), inArray(scans.state, [...from])), change)
    return rows.length > 0
  }

  #update(where: SQL | undefined, change: PgUpdateSetSource<typeof scans>) {
    return this.#db.update(scans).set(change).where(where).returning({ id: scans.id })
  }
}
