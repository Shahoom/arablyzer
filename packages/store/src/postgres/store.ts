import { fileURLToPath } from 'node:url'
import type { Report } from '@arablyzer/report-schema'
import { eq } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Pool } from 'pg'
import type { ScanRecord, ScanStore } from '../types'
import { scans } from './schema'

const MIGRATIONS = fileURLToPath(new URL('../../drizzle/', import.meta.url))

/** Scans in PostgreSQL through Drizzle. */
export class PostgresScanStore implements ScanStore {
  readonly #db: NodePgDatabase<{ scans: typeof scans }>

  constructor(pool: Pool) {
    this.#db = drizzle(pool, { schema: { scans } })
  }

  /** Brings the tables up to this version's schema (packages/store/drizzle). */
  migrate(): Promise<void> {
    return migrate(this.#db, { migrationsFolder: MIGRATIONS })
  }

  async create(scan: { id: string; url: string; createdAt: Date }): Promise<void> {
    await this.#db.insert(scans).values({ ...scan, state: 'queued' })
  }

  async get(id: string): Promise<ScanRecord | null> {
    const [row] = await this.#db.select().from(scans).where(eq(scans.id, id)).limit(1)
    if (row === undefined) return null
    return {
      id: row.id,
      url: row.url,
      state: row.state,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      report: row.report,
    }
  }

  async start(id: string, at: Date): Promise<void> {
    await this.#updated(
      this.#db
        .update(scans)
        .set({ state: 'running', startedAt: at })
        .where(eq(scans.id, id))
        .returning({ id: scans.id }),
      id,
    )
  }

  async finish(id: string, report: Report, at: Date): Promise<void> {
    await this.#updated(
      this.#db
        .update(scans)
        .set({ state: report.scan.status, finishedAt: at, report, score: report.score.overall })
        .where(eq(scans.id, id))
        .returning({ id: scans.id }),
      id,
    )
  }

  async fail(id: string, at: Date): Promise<void> {
    await this.#updated(
      this.#db
        .update(scans)
        .set({ state: 'failed', finishedAt: at })
        .where(eq(scans.id, id))
        .returning({ id: scans.id }),
      id,
    )
  }

  async #updated(query: Promise<{ id: string }[]>, id: string): Promise<void> {
    if ((await query).length === 0) throw new Error(`No scan ${id}`)
  }
}
