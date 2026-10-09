import type { Pool } from 'pg'

/** What the hourly sweep of the accounts tables removes. */
export interface AuthMaintenance {
  /** Deletes the sessions and the sign-in states (verifications) that have expired. */
  deleteExpired(now: Date): Promise<{ sessions: number; verifications: number }>
}

/**
 * Better Auth deletes an expired session only when someone presents it, and a sign-in state only
 * when it is spent; the rest would stay. Both go once they expire (BUILD-PLAN §14: keep nothing
 * longer than it is of use).
 */
export class PostgresAuthMaintenance implements AuthMaintenance {
  private readonly pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  async deleteExpired(now: Date): Promise<{ sessions: number; verifications: number }> {
    const sessions = await this.pool.query('DELETE FROM sessions WHERE expires_at < $1', [now])
    const verifications = await this.pool.query('DELETE FROM verifications WHERE expires_at < $1', [
      now,
    ])
    return { sessions: sessions.rowCount ?? 0, verifications: verifications.rowCount ?? 0 }
  }
}
