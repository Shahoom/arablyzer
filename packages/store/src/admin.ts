import { createHash } from 'node:crypto'
import type { ScanState } from '@arablyzer/api-contract'
import type { PlanOverrides } from '@arablyzer/plans'
import type { AccountData } from './accounts'
import type { ApiKeyData } from './apikeys'
import { ACTIVE_STATES, type CrawlData } from './crawls'
import type { MemoryScanStore } from './memory'
import type { MonitorData } from './monitors'
import type { PdfData } from './pdfs'

// What the owner's panel reads and keeps (M4.8): who is suspended, the numbers over a plan, the
// audit of what the owner did, and the reads across every account that no other store has. The
// API's role alone uses it; the worker's role cannot read the tables behind it.

/** What the owner has decided about one account. */
export interface UserState {
  readonly suspendedAt: Date | null
  readonly lastSignInAt: Date | null
  readonly overrides: PlanOverrides
}

export const NO_STATE: UserState = Object.freeze({
  suspendedAt: null,
  lastSignInAt: null,
  overrides: Object.freeze({}),
})

export const AUDIT_ACTIONS = [
  'user.view',
  'user.suspend',
  'user.unsuspend',
  'user.revoke_sessions',
  'user.revoke_key',
  'user.overrides',
  'user.delete',
  'scan.delete',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/** Numbers and words only: an address never goes in a detail, so erasing it leaves none behind. */
export type AuditDetail = Readonly<Record<string, string | number | boolean | null>>

export interface NewAuditEntry {
  readonly id: string
  readonly at: Date
  readonly actorId: string
  readonly actorEmail: string
  readonly action: AuditAction
  readonly targetId: string | null
  readonly targetEmail: string | null
  readonly detail: AuditDetail
  /** The admin's IPv6 /48 or IPv4 /24; null where there is no address. */
  readonly network: string | null
}

/** An entry as it is read: an erased account's address is null and its id is `erasedRef`'s. */
export interface AuditEntry {
  readonly id: string
  readonly at: Date
  readonly actorId: string
  readonly actorEmail: string | null
  readonly action: string
  readonly targetId: string | null
  readonly targetEmail: string | null
  readonly detail: AuditDetail
  readonly network: string | null
}

/** The audit is kept this long. */
export const AUDIT_DAYS = 365

/** What an erased account's id becomes in the audit: stable, and not reversible. */
export function erasedRef(userId: string): string {
  return `erased:${createHash('sha256').update(userId).digest('hex').slice(0, 32)}`
}

/** One account as the panel lists it. */
export interface AdminUserRow {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly language: string | null
  readonly createdAt: Date
  readonly lastSignInAt: Date | null
  readonly suspendedAt: Date | null
  readonly hasOverrides: boolean
  /** Sessions that have not expired. */
  readonly sessions: number
  readonly sites: number
  readonly monitors: number
  readonly apiKeys: number
  /** Scans the account keeps in its history. */
  readonly scans: number
}

export interface AdminScanRow {
  readonly id: string
  readonly url: string
  readonly host: string
  readonly tool: string | null
  readonly state: ScanState
  readonly createdAt: Date
  readonly score: number | null
  /** The account that keeps it; null for an anonymous scan. */
  readonly userId: string | null
  readonly userEmail: string | null
}

export interface Overview {
  readonly accounts: {
    readonly total: number
    readonly newThisWeek: number
    readonly activeThisWeek: number
    readonly suspended: number
  }
  readonly scans: {
    readonly today: { readonly anonymous: number; readonly account: number }
    readonly week: { readonly anonymous: number; readonly account: number }
    readonly failed24h: number
    readonly running: number
    readonly queued: number
    readonly oldestQueuedAt: Date | null
    readonly lastFinishedAt: Date | null
  }
  readonly monitorsActive: number
  readonly crawlsRunning: number
  readonly pdfsThisMonth: number
  /** The last `OVERVIEW_DAYS` days, oldest first, for the sparklines. */
  readonly daily: {
    readonly days: readonly string[]
    readonly scansAnonymous: readonly number[]
    readonly scansAccount: readonly number[]
    readonly newAccounts: readonly number[]
  }
}

export const OVERVIEW_DAYS = 14

export interface Page<T> {
  readonly rows: T[]
  readonly total: number
}

export interface AdminData {
  state(userId: string): Promise<UserState>
  /** Suspends (a date) or lifts it (null). */
  setSuspended(userId: string, at: Date | null, now: Date): Promise<void>
  /** Replaces the account's overrides; none at all clears them. */
  setOverrides(userId: string, overrides: PlanOverrides, now: Date): Promise<void>
  /** Notes a sign-in; never fails a sign-in (the caller catches). */
  noteSignIn(userId: string, at: Date): Promise<void>

  audit(entry: NewAuditEntry): Promise<void>
  /** Newest first; one account's, or all. */
  auditLog(options: {
    readonly targetId?: string
    readonly limit: number
    readonly offset: number
  }): Promise<Page<AuditEntry>>
  /** Deletes the entries before the time; how many. */
  sweepAudit(before: Date): Promise<number>
  /**
   * What the owner kept of an account goes with it: its state and overrides are deleted, and its
   * audit rows lose the address and take `erasedRef` for the id, as target and as actor.
   */
  eraseUser(userId: string): Promise<void>

  /** Newest first. `q` matches the address or the name, in any case. */
  users(options: {
    readonly q?: string
    readonly limit: number
    readonly offset: number
  }): Promise<Page<AdminUserRow>>
  user(userId: string): Promise<AdminUserRow | null>
  overview(now: Date): Promise<Overview>
  /** Newest first. `host` matches part of the page's host name. */
  scans(options: {
    readonly state?: ScanState
    readonly host?: string
    readonly limit: number
    readonly offset: number
  }): Promise<Page<AdminScanRow>>
  topHosts(since: Date, limit: number): Promise<{ readonly host: string; readonly count: number }[]>
  /** Deletes the scan with its report, whoever it belongs to; false when there is none. */
  deleteScan(scanId: string): Promise<boolean>
}

/** The part of an address that names the site, lower case. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** What a memory source gives of a user and a session: the library's rows, read loosely. */
type Row = Readonly<Record<string, unknown>>

export interface MemoryAdminSources {
  /** Better Auth's memory tables (`user`, `session`), read when asked. */
  readonly users: () => readonly Row[]
  readonly sessions: () => readonly Row[]
  readonly scans: MemoryScanStore
  readonly accounts: AccountData
  readonly monitors?: MonitorData
  readonly crawls?: CrawlData
  readonly pdfs?: PdfData
  readonly apiKeys?: ApiKeyData
}

const DAY_MS = 86_400_000
const dayOf = (at: Date): string => at.toISOString().slice(0, 10)
const asDate = (value: unknown): Date =>
  value instanceof Date ? value : new Date(typeof value === 'string' ? value : 0)
const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

/** AdminData in memory, over the other memory stores, for tests and `pnpm dev`. */
export class MemoryAdminData implements AdminData {
  readonly #sources: MemoryAdminSources
  readonly #states = new Map<string, UserState>()
  readonly #audit: AuditEntry[] = []

  constructor(sources: MemoryAdminSources) {
    this.#sources = sources
  }

  state(userId: string): Promise<UserState> {
    return Promise.resolve(this.#states.get(userId) ?? NO_STATE)
  }

  setSuspended(userId: string, at: Date | null): Promise<void> {
    const kept = this.#states.get(userId) ?? NO_STATE
    this.#states.set(userId, { ...kept, suspendedAt: at })
    return Promise.resolve()
  }

  setOverrides(userId: string, overrides: PlanOverrides): Promise<void> {
    const kept = this.#states.get(userId) ?? NO_STATE
    this.#states.set(userId, { ...kept, overrides })
    return Promise.resolve()
  }

  noteSignIn(userId: string, at: Date): Promise<void> {
    const kept = this.#states.get(userId) ?? NO_STATE
    this.#states.set(userId, { ...kept, lastSignInAt: at })
    return Promise.resolve()
  }

  audit(entry: NewAuditEntry): Promise<void> {
    this.#audit.push({ ...entry })
    return Promise.resolve()
  }

  auditLog(options: {
    targetId?: string
    limit: number
    offset: number
  }): Promise<Page<AuditEntry>> {
    const all = this.#audit
      .filter((entry) => options.targetId === undefined || entry.targetId === options.targetId)
      .sort((a, b) => b.at.getTime() - a.at.getTime())
    return Promise.resolve({
      rows: all.slice(options.offset, options.offset + options.limit),
      total: all.length,
    })
  }

  sweepAudit(before: Date): Promise<number> {
    const keep = this.#audit.filter((entry) => entry.at >= before)
    const gone = this.#audit.length - keep.length
    this.#audit.length = 0
    this.#audit.push(...keep)
    return Promise.resolve(gone)
  }

  eraseUser(userId: string): Promise<void> {
    this.#states.delete(userId)
    const ref = erasedRef(userId)
    for (const [index, entry] of this.#audit.entries()) {
      this.#audit[index] = {
        ...entry,
        ...(entry.targetId === userId ? { targetId: ref, targetEmail: null } : {}),
        ...(entry.actorId === userId ? { actorId: ref, actorEmail: null } : {}),
      }
    }
    return Promise.resolve()
  }

  async #row(user: Row): Promise<AdminUserRow> {
    const id = asString(user.id)
    const { accounts, monitors, apiKeys } = this.#sources
    const state = this.#states.get(id) ?? NO_STATE
    const now = Date.now()
    const sessions = this.#sources
      .sessions()
      .filter((s) => s.userId === id && asDate(s.expiresAt).getTime() > now).length
    return {
      id,
      email: asString(user.email),
      name: asString(user.name),
      language: typeof user.language === 'string' ? user.language : null,
      createdAt: asDate(user.createdAt),
      lastSignInAt: state.lastSignInAt,
      suspendedAt: state.suspendedAt,
      hasOverrides: Object.keys(state.overrides).length > 0,
      sessions,
      sites: (await accounts.sites(id)).length,
      monitors: monitors === undefined ? 0 : (await monitors.monitors(id)).length,
      apiKeys: apiKeys === undefined ? 0 : (await apiKeys.list(id)).length,
      scans: (await accounts.history(id, Number.MAX_SAFE_INTEGER)).length,
    }
  }

  async users(options: { q?: string; limit: number; offset: number }): Promise<Page<AdminUserRow>> {
    const q = options.q?.trim().toLowerCase() ?? ''
    const found = this.#sources
      .users()
      .filter(
        (user) =>
          q === '' ||
          asString(user.email).toLowerCase().includes(q) ||
          asString(user.name).toLowerCase().includes(q),
      )
      .sort((a, b) => asDate(b.createdAt).getTime() - asDate(a.createdAt).getTime())
    const rows = await Promise.all(
      found.slice(options.offset, options.offset + options.limit).map((user) => this.#row(user)),
    )
    return { rows, total: found.length }
  }

  async user(userId: string): Promise<AdminUserRow | null> {
    const found = this.#sources.users().find((user) => user.id === userId)
    return found === undefined ? null : this.#row(found)
  }

  async #owners(): Promise<ReadonlyMap<string, string>> {
    const owners = new Map<string, string>()
    for (const user of this.#sources.users()) {
      const id = asString(user.id)
      for (const entry of await this.#sources.accounts.history(id, Number.MAX_SAFE_INTEGER)) {
        owners.set(entry.scanId, id)
      }
    }
    return owners
  }

  async overview(now: Date): Promise<Overview> {
    const users = this.#sources.users()
    const owners = await this.#owners()
    const scans = this.#sources.scans.records()
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS)
    const today = dayOf(now)
    const count = (since: (scan: { createdAt: Date }) => boolean, account: boolean) =>
      scans.filter((scan) => since(scan) && owners.has(scan.id) === account).length
    const days = Array.from({ length: OVERVIEW_DAYS }, (_, i) =>
      dayOf(new Date(now.getTime() - (OVERVIEW_DAYS - 1 - i) * DAY_MS)),
    )
    const per = (dates: readonly Date[]) =>
      days.map((day) => dates.filter((date) => dayOf(date) === day).length)
    const active = new Set(
      this.#sources
        .sessions()
        .filter((s) => asDate(s.updatedAt) >= weekAgo)
        .map((s) => asString(s.userId)),
    )
    let monitorsActive = 0
    let crawlsRunning = 0
    let pdfsThisMonth = 0
    for (const user of users) {
      const id = asString(user.id)
      if (this.#sources.monitors !== undefined) {
        monitorsActive += (await this.#sources.monitors.monitors(id)).filter(
          (m) => !m.paused,
        ).length
      }
      if (this.#sources.crawls !== undefined) {
        for (const crawl of (await this.#sources.crawls.latestPerSite(id)).values()) {
          if (ACTIVE_STATES.includes(crawl.state)) crawlsRunning++
        }
      }
      if (this.#sources.pdfs !== undefined) pdfsThisMonth += await this.#sources.pdfs.used(id, now)
    }
    const queued = scans.filter((scan) => scan.state === 'queued')
    const finished = scans.flatMap((scan) => (scan.finishedAt === null ? [] : [scan.finishedAt]))
    return {
      accounts: {
        total: users.length,
        newThisWeek: users.filter((user) => asDate(user.createdAt) >= weekAgo).length,
        activeThisWeek: [...active].filter((id) => users.some((user) => user.id === id)).length,
        suspended: [...this.#states.values()].filter((state) => state.suspendedAt !== null).length,
      },
      scans: {
        today: {
          anonymous: count((s) => dayOf(s.createdAt) === today, false),
          account: count((s) => dayOf(s.createdAt) === today, true),
        },
        week: {
          anonymous: count((s) => s.createdAt >= weekAgo, false),
          account: count((s) => s.createdAt >= weekAgo, true),
        },
        failed24h: scans.filter(
          (s) => s.state === 'failed' && s.createdAt >= new Date(now.getTime() - DAY_MS),
        ).length,
        running: scans.filter((s) => s.state === 'running').length,
        queued: queued.length,
        oldestQueuedAt:
          queued.length === 0
            ? null
            : new Date(Math.min(...queued.map((s) => s.createdAt.getTime()))),
        lastFinishedAt:
          finished.length === 0 ? null : new Date(Math.max(...finished.map((d) => d.getTime()))),
      },
      monitorsActive,
      crawlsRunning,
      pdfsThisMonth,
      daily: {
        days,
        scansAnonymous: per(scans.filter((s) => !owners.has(s.id)).map((s) => s.createdAt)),
        scansAccount: per(scans.filter((s) => owners.has(s.id)).map((s) => s.createdAt)),
        newAccounts: per(users.map((u) => asDate(u.createdAt))),
      },
    }
  }

  async scans(options: {
    state?: ScanState
    host?: string
    limit: number
    offset: number
  }): Promise<Page<AdminScanRow>> {
    const owners = await this.#owners()
    const emails = new Map(this.#sources.users().map((u) => [asString(u.id), asString(u.email)]))
    const host = options.host?.trim().toLowerCase() ?? ''
    const found = this.#sources.scans
      .records()
      .filter(
        (scan) =>
          (options.state === undefined || scan.state === options.state) &&
          (host === '' || hostOf(scan.url).includes(host)),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return {
      total: found.length,
      rows: found.slice(options.offset, options.offset + options.limit).map((scan) => {
        const userId = owners.get(scan.id) ?? null
        return {
          id: scan.id,
          url: scan.url,
          host: hostOf(scan.url),
          tool: scan.tool,
          state: scan.state,
          createdAt: scan.createdAt,
          score: scan.tool === null ? (scan.report?.score.overall ?? null) : null,
          userId,
          userEmail: userId === null ? null : (emails.get(userId) ?? null),
        }
      }),
    }
  }

  topHosts(since: Date, limit: number): Promise<{ host: string; count: number }[]> {
    const counts = new Map<string, number>()
    for (const scan of this.#sources.scans.records()) {
      if (scan.createdAt < since) continue
      const host = hostOf(scan.url)
      counts.set(host, (counts.get(host) ?? 0) + 1)
    }
    return Promise.resolve(
      [...counts]
        .map(([host, count]) => ({ host, count }))
        .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host))
        .slice(0, limit),
    )
  }

  async deleteScan(scanId: string): Promise<boolean> {
    if ((await this.#sources.scans.get(scanId)) === null) return false
    this.#sources.scans.purge([scanId])
    return true
  }
}
