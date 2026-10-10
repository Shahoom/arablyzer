import type { Language, LogoType, PdfError, PdfKind, PdfState } from '@arablyzer/api-contract'
import type { Pool } from 'pg'
import {
  isCrawlPdf,
  monthOf,
  type BrandRecord,
  type NewPdf,
  type PdfCreated,
  type PdfData,
  type PdfJob,
} from '../pdfs'

interface JobRow {
  id: string
  user_id: string
  kind: PdfKind
  scan_id: string | null
  crawl_id: string | null
  base_id: string | null
  language: Language
  state: PdfState
  error: PdfError | null
  bytes: number | null
  created_at: Date
  started_at: Date | null
  finished_at: Date | null
  lease_until: Date | null
}

/** Every column but the file itself: a listing never reads the bytes. */
const JOB = `id, user_id, kind, scan_id, crawl_id, base_id, language, state, error, bytes,
  created_at, started_at, finished_at, lease_until`

const job = (row: JobRow): PdfJob => ({
  id: row.id,
  userId: row.user_id,
  kind: row.kind,
  subject: row.scan_id ?? row.crawl_id ?? '',
  base: row.base_id,
  language: row.language,
  state: row.state,
  error: row.error,
  bytes: row.bytes,
  createdAt: row.created_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  leaseUntil: row.lease_until,
})

const ACTIVE = "('queued', 'running')"
const UNIQUE_VIOLATION = '23505'

/** What PDF export and white-label keep, in PostgreSQL (M4.7). */
export class PostgresPdfData implements PdfData {
  readonly #pool: Pool

  constructor(pool: Pool) {
    this.#pool = pool
  }

  async brand(userId: string): Promise<BrandRecord | null> {
    const { rows } = await this.#pool.query<{
      name: string
      color: string | null
      logo_type: LogoType | null
      updated_at: Date
    }>('SELECT name, color, logo_type, updated_at FROM account_brand WHERE user_id = $1', [userId])
    const row = rows[0]
    if (row === undefined) return null
    return {
      userId,
      name: row.name,
      color: row.color,
      logoType: row.logo_type,
      updatedAt: row.updated_at,
    }
  }

  async logo(
    userId: string,
  ): Promise<{ readonly type: LogoType; readonly bytes: Uint8Array } | null> {
    const { rows } = await this.#pool.query<{ logo: Buffer | null; logo_type: LogoType | null }>(
      'SELECT logo, logo_type FROM account_brand WHERE user_id = $1',
      [userId],
    )
    const row = rows[0]
    return row?.logo == null || row.logo_type === null
      ? null
      : { type: row.logo_type, bytes: new Uint8Array(row.logo) }
  }

  async setBrand(
    userId: string,
    brand: { readonly name: string; readonly color: string | null },
    at: Date,
  ): Promise<void> {
    await this.#pool.query(
      `INSERT INTO account_brand (user_id, name, color, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET name = $2, color = $3, updated_at = $4`,
      [userId, brand.name, brand.color, at],
    )
  }

  async setLogo(
    userId: string,
    logo: { readonly type: LogoType; readonly bytes: Uint8Array } | null,
    at: Date,
  ): Promise<void> {
    await this.#pool.query(
      `INSERT INTO account_brand (user_id, logo, logo_type, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET logo = $2, logo_type = $3, updated_at = $4`,
      [userId, logo === null ? null : Buffer.from(logo.bytes), logo?.type ?? null, at],
    )
  }

  async create(input: NewPdf, perMonth: number): Promise<PdfCreated> {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      let row: JobRow | undefined
      try {
        const inserted = await client.query<JobRow>(
          `INSERT INTO pdf_jobs (id, user_id, kind, scan_id, crawl_id, base_id, language, state, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8) RETURNING ${JOB}`,
          [
            input.id,
            input.userId,
            input.kind,
            isCrawlPdf(input.kind) ? null : input.subject,
            isCrawlPdf(input.kind) ? input.subject : null,
            input.base,
            input.language,
            input.createdAt,
          ],
        )
        row = inserted.rows[0]
      } catch (error) {
        await client.query('ROLLBACK')
        // The unique index on the account's active PDFs is what says one is being made already.
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) return { kind: 'active' }
        throw error
      }
      // Counted and added in one statement: it takes the month's row only while it is below the cap.
      const counted = await client.query(
        `INSERT INTO pdf_usage (user_id, month, count) VALUES ($1, $2, 1)
         ON CONFLICT (user_id, month) DO UPDATE SET count = pdf_usage.count + 1
         WHERE pdf_usage.count < $3 RETURNING count`,
        [input.userId, monthOf(input.createdAt), perMonth],
      )
      if (counted.rowCount === 0 || perMonth < 1) {
        await client.query('ROLLBACK')
        return { kind: 'limit' }
      }
      await client.query('COMMIT')
      if (row === undefined) throw new Error('The insert returned no row')
      return { kind: 'created', job: job(row) }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async get(id: string): Promise<PdfJob | null> {
    const { rows } = await this.#pool.query<JobRow>(`SELECT ${JOB} FROM pdf_jobs WHERE id = $1`, [
      id,
    ])
    return rows[0] === undefined ? null : job(rows[0])
  }

  async list(userId: string, limit: number): Promise<PdfJob[]> {
    const { rows } = await this.#pool.query<JobRow>(
      `SELECT ${JOB} FROM pdf_jobs WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT $2`,
      [userId, limit],
    )
    return rows.map(job)
  }

  async used(userId: string, at: Date): Promise<number> {
    const { rows } = await this.#pool.query<{ count: number }>(
      'SELECT count FROM pdf_usage WHERE user_id = $1 AND month = $2',
      [userId, monthOf(at)],
    )
    return rows[0]?.count ?? 0
  }

  async file(id: string): Promise<Uint8Array | null> {
    const { rows } = await this.#pool.query<{ pdf: Buffer | null }>(
      "SELECT pdf FROM pdf_jobs WHERE id = $1 AND state = 'done'",
      [id],
    )
    const file = rows[0]?.pdf
    return file === null || file === undefined ? null : new Uint8Array(file)
  }

  async claim(now: Date, leaseUntil: Date): Promise<PdfJob | null> {
    const { rows } = await this.#pool.query<JobRow>(
      // The conditions are in the outer statement too: a claim that waited for another's commit
      // re-reads the row under them, and finds the lease taken.
      `UPDATE pdf_jobs SET state = 'running', lease_until = $2, started_at = COALESCE(started_at, $1)
       WHERE state IN ${ACTIVE} AND (lease_until IS NULL OR lease_until <= $1) AND id = (
         SELECT id FROM pdf_jobs
         WHERE state IN ${ACTIVE} AND (lease_until IS NULL OR lease_until <= $1)
         ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
       ) RETURNING ${JOB}`,
      [now, leaseUntil],
    )
    return rows[0] === undefined ? null : job(rows[0])
  }

  async finish(id: string, file: Uint8Array, at: Date): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `UPDATE pdf_jobs SET state = 'done', pdf = $2, bytes = $3, finished_at = $4, lease_until = NULL
       WHERE id = $1 AND state = 'running'`,
      [id, Buffer.from(file), file.length, at],
    )
    return (rowCount ?? 0) > 0
  }

  async fail(id: string, error: PdfError, at: Date): Promise<boolean> {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{ user_id: string; created_at: Date }>(
        `UPDATE pdf_jobs SET state = 'failed', error = $2, finished_at = $3, lease_until = NULL
         WHERE id = $1 AND state IN ${ACTIVE} RETURNING user_id, created_at`,
        [id, error, at],
      )
      const failed = rows[0]
      if (failed !== undefined) {
        // A file that could not be made is not counted against the month.
        await client.query(
          'UPDATE pdf_usage SET count = GREATEST(count - 1, 0) WHERE user_id = $1 AND month = $2',
          [failed.user_id, monthOf(failed.created_at)],
        )
      }
      await client.query('COMMIT')
      return failed !== undefined
    } catch (caught) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw caught
    } finally {
      client.release()
    }
  }

  async requeue(id: string): Promise<void> {
    await this.#pool.query(
      "UPDATE pdf_jobs SET state = 'queued', lease_until = NULL WHERE id = $1 AND state = 'running'",
      [id],
    )
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      `DELETE FROM pdf_jobs WHERE id = $1 AND user_id = $2 AND state NOT IN ${ACTIVE}`,
      [id, userId],
    )
    return (rowCount ?? 0) > 0
  }

  async expire(before: Date): Promise<number> {
    const { rowCount } = await this.#pool.query(
      "UPDATE pdf_jobs SET state = 'expired', pdf = NULL WHERE state = 'done' AND created_at < $1",
      [before],
    )
    return rowCount ?? 0
  }

  async prune(before: Date, month: string): Promise<number> {
    const { rowCount } = await this.#pool.query(
      `DELETE FROM pdf_jobs WHERE state NOT IN ${ACTIVE} AND created_at < $1`,
      [before],
    )
    await this.#pool.query('DELETE FROM pdf_usage WHERE month < $1', [month])
    return rowCount ?? 0
  }

  async eraseUser(userId: string): Promise<void> {
    // The rows go by cascade with the user; these are the explicit steps the memory version needs.
    await this.#pool.query('DELETE FROM pdf_jobs WHERE user_id = $1', [userId])
    await this.#pool.query('DELETE FROM pdf_usage WHERE user_id = $1', [userId])
    await this.#pool.query('DELETE FROM account_brand WHERE user_id = $1', [userId])
  }
}
