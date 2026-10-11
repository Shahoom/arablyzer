import type { Pool } from 'pg'
import {
  KEY_TOUCH_MS,
  type ApiKeyData,
  type ApiKeyRecord,
  type KeyCreated,
  type NewApiKey,
} from '../apikeys'

interface Row {
  id: string
  user_id: string
  name: string
  prefix: string
  created_at: Date
  last_used_at: Date | null
}

const record = (row: Row): ApiKeyRecord => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  prefix: row.prefix,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
})

/** API keys in PostgreSQL (M5.1). */
export class PostgresApiKeyData implements ApiKeyData {
  readonly #pool: Pool

  constructor(pool: Pool) {
    this.#pool = pool
  }

  async create(key: NewApiKey, limit: number): Promise<KeyCreated> {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      // One person's keys are made one at a time, so the count is the count the insert makes true.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `api-keys:${key.userId}`,
      ])
      const count = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM api_keys WHERE user_id = $1',
        [key.userId],
      )
      if ((count.rows[0]?.n ?? 0) >= limit) {
        await client.query('COMMIT')
        return { kind: 'limit' }
      }
      await client.query(
        'INSERT INTO api_keys (id, user_id, name, prefix, hash, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [key.id, key.userId, key.name, key.prefix, key.hash, key.createdAt],
      )
      await client.query('COMMIT')
      return {
        kind: 'created',
        key: {
          id: key.id,
          userId: key.userId,
          name: key.name,
          prefix: key.prefix,
          createdAt: key.createdAt,
          lastUsedAt: null,
        },
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async list(userId: string): Promise<ApiKeyRecord[]> {
    const { rows } = await this.#pool.query<Row>(
      'SELECT id, user_id, name, prefix, created_at, last_used_at FROM api_keys WHERE user_id = $1 ORDER BY created_at, id',
      [userId],
    )
    return rows.map(record)
  }

  async revoke(userId: string, keyId: string): Promise<boolean> {
    const { rowCount } = await this.#pool.query(
      'DELETE FROM api_keys WHERE user_id = $1 AND id = $2',
      [userId, keyId],
    )
    return (rowCount ?? 0) > 0
  }

  async authenticate(hash: string) {
    const { rows } = await this.#pool.query<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM api_keys WHERE hash = $1',
      [hash],
    )
    const row = rows[0]
    return row === undefined ? null : { keyId: row.id, userId: row.user_id }
  }

  async touch(keyId: string, at: Date): Promise<void> {
    await this.#pool.query(
      `UPDATE api_keys SET last_used_at = $2
       WHERE id = $1 AND (last_used_at IS NULL OR last_used_at <= $2::timestamptz - make_interval(secs => $3))`,
      [keyId, at, KEY_TOUCH_MS / 1000],
    )
  }

  async eraseUser(userId: string): Promise<void> {
    await this.#pool.query('DELETE FROM api_keys WHERE user_id = $1', [userId])
  }
}
