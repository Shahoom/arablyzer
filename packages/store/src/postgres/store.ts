import { fileURLToPath } from 'node:url'
import type { ScanState } from '@arablyzer/api-contract'
import type { Report } from '@arablyzer/report-schema'
import { and, eq, inArray, lt, type SQL } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Pool } from 'pg'
import type { NewScan, ScanRecord, ScanStore } from '../types'
import { scans } from './schema'

const MIGRATIONS = fileURLToPath(new URL('../../drizzle/', import.meta.url))
/** The advisory lock the migration holds, so API processes that start together migrate once. */
const MIGRATION_LOCK = 0x6172_6162 // "arab"

/** Scans in PostgreSQL through Drizzle. */
export class PostgresScanStore implements ScanStore {
  readonly #pool: Pool
  readonly #db: NodePgDatabase<{ scans: typeof scans }>

  constructor(pool: Pool) {
    this.#pool = pool
    this.#db = drizzle(pool, { schema: { scans } })
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
      score: report.score.overall,
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

  /** The change, made only when the scan is in one of the states it moves from. */
  async #move(
    id: string,
    from: readonly ScanState[],
    change: Partial<typeof scans.$inferInsert>,
  ): Promise<boolean> {
    const rows = await this.#update(and(eq(scans.id, id), inArray(scans.state, [...from])), change)
    return rows.length > 0
  }

  #update(where: SQL | undefined, change: Partial<typeof scans.$inferInsert>) {
    return this.#db.update(scans).set(change).where(where).returning({ id: scans.id })
  }
}
