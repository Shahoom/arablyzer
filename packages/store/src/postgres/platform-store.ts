import type { Pool } from 'pg'
import type { InstallStatus, Platform, PlatformData, PlatformInstall } from '../platforms'

interface Row {
  id: string
  platform: Platform
  store_key: string
  store_name: string | null
  store_url: string | null
  sealed_tokens: string | null
  tokens_expire_at: Date | null
  tokens_at: Date | null
  refresh_due_at: Date | null
  status: InstallStatus
  embed_token_hash: string | null
  installed_at: Date
  updated_at: Date
  audit_due_at: Date | null
  last_audit_at: Date | null
}

const COLUMNS = `id, platform, store_key, store_name, store_url, sealed_tokens, tokens_expire_at,
  tokens_at, refresh_due_at, status, embed_token_hash, installed_at, updated_at, audit_due_at,
  last_audit_at`

const install = (row: Row): PlatformInstall => ({
  id: row.id,
  platform: row.platform,
  storeKey: row.store_key,
  storeName: row.store_name,
  storeUrl: row.store_url,
  sealedTokens: row.sealed_tokens,
  tokensExpireAt: row.tokens_expire_at,
  tokensAt: row.tokens_at,
  refreshDueAt: row.refresh_due_at,
  status: row.status,
  embedTokenHash: row.embed_token_hash,
  installedAt: row.installed_at,
  updatedAt: row.updated_at,
  auditDueAt: row.audit_due_at,
  lastAuditAt: row.last_audit_at,
})

/** The Salla and Zid apps' data in PostgreSQL (M9). */
export class PostgresPlatformData implements PlatformData {
  readonly #pool: Pool

  constructor(pool: Pool) {
    this.#pool = pool
  }

  async upsert(input: Parameters<PlatformData['upsert']>[0]) {
    const { id, platform, storeKey, patch, at } = input
    const client = await this.#pool.connect()
    try {
      const made = await client.query(
        `INSERT INTO platform_installs (id, platform, store_key, status, installed_at, updated_at)
         VALUES ($1, $2, $3, 'active', $4, $4) ON CONFLICT (platform, store_key) DO NOTHING`,
        [id, platform, storeKey, at],
      )
      const values: unknown[] = [platform, storeKey, at]
      const sets = ['updated_at = $3']
      const bind = (value: unknown): string => {
        values.push(value)
        return `$${String(values.length)}`
      }
      const field = (column: string, value: unknown): void => {
        if (value !== undefined) sets.push(`${column} = ${bind(value)}`)
      }
      field('store_name', patch.storeName)
      field('store_url', patch.storeUrl)
      field('embed_token_hash', patch.embedTokenHash)
      const tokens = patch.tokens
      if (tokens !== undefined) {
        // Every expression below reads the row as it was, so one condition decides them all.
        const when = `(tokens_expire_at IS NULL OR tokens_expire_at <= ${bind(tokens.expiresAt)})`
        const take = (column: string, value: unknown): void => {
          sets.push(`${column} = CASE WHEN ${when} THEN ${bind(value)} ELSE ${column} END`)
        }
        take('sealed_tokens', tokens.sealed)
        take('tokens_expire_at', tokens.expiresAt)
        take('tokens_at', tokens.at)
        take('refresh_due_at', tokens.refreshDueAt)
        sets.push(`status = CASE WHEN ${when} THEN 'active' ELSE status END`)
      }
      const { rows } = await client.query<Row>(
        `UPDATE platform_installs SET ${sets.join(', ')}
         WHERE platform = $1 AND store_key = $2 RETURNING ${COLUMNS}`,
        values,
      )
      const row = rows[0]
      if (row === undefined) throw new Error('The statement returned no row')
      return { install: install(row), created: (made.rowCount ?? 0) > 0 }
    } finally {
      client.release()
    }
  }

  async get(platform: Platform, storeKey: string) {
    const { rows } = await this.#pool.query<Row>(
      `SELECT ${COLUMNS} FROM platform_installs WHERE platform = $1 AND store_key = $2`,
      [platform, storeKey],
    )
    return rows[0] === undefined ? null : install(rows[0])
  }

  async byEmbedHash(hash: string) {
    const { rows } = await this.#pool.query<Row>(
      `SELECT ${COLUMNS} FROM platform_installs WHERE embed_token_hash = $1`,
      [hash],
    )
    return rows[0] === undefined ? null : install(rows[0])
  }

  async scheduleAudit(installId: string, dueAt: Date): Promise<void> {
    await this.#pool.query(
      `UPDATE platform_installs
       SET audit_due_at = CASE WHEN audit_due_at IS NULL OR audit_due_at > $2 THEN $2 ELSE audit_due_at END
       WHERE id = $1`,
      [installId, dueAt],
    )
  }

  async claimAudits(now: Date, max: number, leaseUntil: Date) {
    // Locked and leased in one statement: a second scheduler skips them, and a crash leaves the
    // lease, which ends by itself.
    const { rows } = await this.#pool.query<Row>(
      `WITH due AS (
         SELECT id FROM platform_installs
         WHERE audit_due_at IS NOT NULL AND audit_due_at <= $1
           AND (audit_lease_until IS NULL OR audit_lease_until <= $1)
         ORDER BY audit_due_at, id LIMIT $2 FOR UPDATE SKIP LOCKED)
       UPDATE platform_installs p SET audit_lease_until = $3
       FROM due WHERE p.id = due.id RETURNING ${COLUMNS.replace(/\b(\w+)\b/g, 'p.$1')}`,
      [now, max, leaseUntil],
    )
    return rows.map(install)
  }

  async deferAudit(installId: string, until: Date): Promise<void> {
    await this.#pool.query(
      'UPDATE platform_installs SET audit_due_at = $2, audit_lease_until = NULL WHERE id = $1',
      [installId, until],
    )
  }

  async recordAudit(input: { installId: string; scanId: string; at: Date }): Promise<void> {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        'INSERT INTO platform_audits (scan_id, install_id, created_at) VALUES ($1, $2, $3)',
        [input.scanId, input.installId, input.at],
      )
      await client.query(
        `UPDATE platform_installs
         SET audit_due_at = NULL, audit_lease_until = NULL, last_audit_at = $2 WHERE id = $1`,
        [input.installId, input.at],
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async latestAudit(installId: string) {
    const { rows } = await this.#pool.query<{ scan_id: string; created_at: Date }>(
      `SELECT scan_id, created_at FROM platform_audits WHERE install_id = $1
       ORDER BY created_at DESC, scan_id LIMIT 1`,
      [installId],
    )
    const row = rows[0]
    return row === undefined ? null : { scanId: row.scan_id, at: row.created_at }
  }

  async claimRefreshes(now: Date, max: number, leaseUntil: Date) {
    const { rows } = await this.#pool.query<Row>(
      `WITH due AS (
         SELECT id FROM platform_installs
         WHERE sealed_tokens IS NOT NULL AND refresh_due_at IS NOT NULL AND refresh_due_at <= $1
           AND (refresh_lease_until IS NULL OR refresh_lease_until <= $1)
         ORDER BY refresh_due_at, id LIMIT $2 FOR UPDATE SKIP LOCKED)
       UPDATE platform_installs p SET refresh_lease_until = $3
       FROM due WHERE p.id = due.id RETURNING ${COLUMNS.replace(/\b(\w+)\b/g, 'p.$1')}`,
      [now, max, leaseUntil],
    )
    return rows.map(install)
  }

  async dropTokens(installId: string): Promise<void> {
    await this.#pool.query(
      `UPDATE platform_installs
       SET sealed_tokens = NULL, tokens_expire_at = NULL, tokens_at = NULL, refresh_due_at = NULL,
           refresh_lease_until = NULL, status = 'reauth'
       WHERE id = $1`,
      [installId],
    )
  }

  async erase(platform: Platform, storeKey: string): Promise<boolean> {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      const found = await client.query<{ id: string }>(
        'SELECT id FROM platform_installs WHERE platform = $1 AND store_key = $2 FOR UPDATE',
        [platform, storeKey],
      )
      const id = found.rows[0]?.id
      if (id === undefined) {
        await client.query('COMMIT')
        return false
      }
      // The audits' scans first, with their reports; the install's delete takes the links.
      await client.query(
        'DELETE FROM scans WHERE id IN (SELECT scan_id FROM platform_audits WHERE install_id = $1)',
        [id],
      )
      await client.query('DELETE FROM platform_installs WHERE id = $1', [id])
      await client.query('COMMIT')
      return true
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }
}
