import { describe, expect, it } from 'vitest'
import { AUDIT_DAYS, erasedRef, type AdminData, type NewAuditEntry } from '../src/index'

export const NOW = new Date('2026-10-16T12:00:00.000Z')
const DAY = 86_400_000

export interface Harness {
  readonly admin: AdminData
  /** Makes the account exist, empty of everything else. */
  user(input: { id: string; email: string; name: string; createdAt: Date }): Promise<void>
  /** Makes a scan, kept by the account when `userId` is given. */
  scan(input: {
    id: string
    url: string
    createdAt: Date
    state: 'queued' | 'failed'
    userId?: string
  }): Promise<void>
}

let counter = 0
const id = (prefix: string) => `${prefix}${String(++counter)}`.padEnd(22, '_')

const entry = (overrides: Partial<NewAuditEntry> = {}): NewAuditEntry => ({
  id: id('a'),
  at: NOW,
  actorId: 'admin-1'.padEnd(22, '_'),
  actorEmail: 'owner@example.com',
  action: 'user.suspend',
  targetId: null,
  targetEmail: null,
  detail: {},
  network: '203.0.113.0/24',
  ...overrides,
})

/** What the owner’s panel keeps and reads (M4.8), over the memory store and PostgreSQL alike. */
export function adminContract(make: () => Harness | Promise<Harness>): void {
  describe('the owner’s panel data', () => {
    it('has no state for an account nobody has touched, and keeps what is set', async () => {
      const h = await make()
      const userId = id('u')
      await h.user({ id: userId, email: `${userId}@example.com`, name: 'Ali', createdAt: NOW })
      expect(await h.admin.state(userId)).toEqual({
        suspendedAt: null,
        lastSignInAt: null,
        overrides: {},
      })
      await h.admin.setSuspended(userId, NOW, NOW)
      await h.admin.setOverrides(userId, { scansPerDay: 7, whiteLabel: true }, NOW)
      await h.admin.noteSignIn(userId, new Date(NOW.getTime() + 1000))
      expect(await h.admin.state(userId)).toEqual({
        suspendedAt: NOW,
        lastSignInAt: new Date(NOW.getTime() + 1000),
        overrides: { scansPerDay: 7, whiteLabel: true },
      })
      // Lifting the suspension leaves the overrides; clearing the overrides leaves the rest.
      await h.admin.setSuspended(userId, null, NOW)
      expect((await h.admin.state(userId)).overrides).toEqual({ scansPerDay: 7, whiteLabel: true })
      await h.admin.setOverrides(userId, {}, NOW)
      expect(await h.admin.state(userId)).toMatchObject({ suspendedAt: null, overrides: {} })
    })

    it('keeps the audit newest first, by account, and sweeps what is a year old', async () => {
      const h = await make()
      const target = id('t')
      const old = entry({ at: new Date(NOW.getTime() - (AUDIT_DAYS + 1) * DAY), targetId: target })
      const mid = entry({ at: new Date(NOW.getTime() - DAY), targetId: target })
      const last = entry({ at: NOW, targetId: 'someone-else'.padEnd(22, '_') })
      for (const e of [old, mid, last]) await h.admin.audit(e)
      const all = await h.admin.auditLog({ limit: 50, offset: 0 })
      expect(
        all.rows.map((row) => row.id).filter((x) => [old.id, mid.id, last.id].includes(x)),
      ).toEqual([last.id, mid.id, old.id])
      const mine = await h.admin.auditLog({ targetId: target, limit: 1, offset: 0 })
      expect(mine.total).toBe(2)
      expect(mine.rows.map((row) => row.id)).toEqual([mid.id])
      const second = await h.admin.auditLog({ targetId: target, limit: 1, offset: 1 })
      expect(second.rows.map((row) => row.id)).toEqual([old.id])
      expect(
        await h.admin.sweepAudit(new Date(NOW.getTime() - AUDIT_DAYS * DAY)),
      ).toBeGreaterThanOrEqual(1)
      expect((await h.admin.auditLog({ targetId: target, limit: 9, offset: 0 })).rows).toHaveLength(
        1,
      )
    })

    it('erases an account’s state, and its address and id from the audit, keeping the rows', async () => {
      const h = await make()
      const gone = id('g')
      const admin = id('m')
      for (const [userId, email] of [
        [gone, `${gone}@example.com`],
        [admin, `${admin}@example.com`],
      ] as const) {
        await h.user({ id: userId, email, name: 'x', createdAt: NOW })
      }
      await h.admin.setOverrides(gone, { savedSites: 3 }, NOW)
      await h.admin.setSuspended(gone, NOW, NOW)
      const about = entry({
        actorId: admin,
        actorEmail: `${admin}@example.com`,
        targetId: gone,
        targetEmail: `${gone}@example.com`,
        action: 'user.delete',
      })
      const by = entry({
        actorId: gone,
        actorEmail: `${gone}@example.com`,
        targetId: admin,
        targetEmail: `${admin}@example.com`,
      })
      await h.admin.audit(about)
      await h.admin.audit(by)
      await h.admin.eraseUser(gone)
      expect(await h.admin.state(gone)).toMatchObject({ suspendedAt: null, overrides: {} })
      const rows = (await h.admin.auditLog({ limit: 100, offset: 0 })).rows
      const a = rows.find((row) => row.id === about.id)
      const b = rows.find((row) => row.id === by.id)
      expect(a).toMatchObject({ targetId: erasedRef(gone), targetEmail: null, actorId: admin })
      expect(b).toMatchObject({ actorId: erasedRef(gone), actorEmail: null, targetId: admin })
      expect(JSON.stringify(rows)).not.toContain(`${gone}@example.com`)
      expect(erasedRef(gone)).toMatch(/^erased:[0-9a-f]{32}$/)
    })

    it('lists accounts newest first, finds them by address or name, and treats % as itself', async () => {
      const h = await make()
      const tag = id('q').slice(0, 8)
      const a = id('a')
      const b = id('b')
      const c = id('c')
      await h.user({
        id: a,
        email: `first-${tag}@example.com`,
        name: 'Nour',
        createdAt: new Date(NOW.getTime() - 3 * DAY),
      })
      await h.user({
        id: b,
        email: `second-${tag}@example.com`,
        name: 'Sami 100%',
        createdAt: new Date(NOW.getTime() - 2 * DAY),
      })
      await h.user({
        id: c,
        email: `third-${tag}@EXAMPLE.com`,
        name: 'Layla',
        createdAt: new Date(NOW.getTime() - DAY),
      })
      const found = await h.admin.users({ q: tag, limit: 2, offset: 0 })
      expect(found.total).toBe(3)
      expect(found.rows.map((row) => row.id)).toEqual([c, b])
      expect(
        (await h.admin.users({ q: tag, limit: 2, offset: 2 })).rows.map((row) => row.id),
      ).toEqual([a])
      expect((await h.admin.users({ q: tag.toUpperCase(), limit: 9, offset: 0 })).total).toBe(3)
      expect(
        (await h.admin.users({ q: 'nour', limit: 9, offset: 0 })).rows.some((row) => row.id === a),
      ).toBe(true)
      expect(
        (await h.admin.users({ q: '100%', limit: 9, offset: 0 })).rows.map((row) => row.id),
      ).toEqual([b])
      expect(
        (await h.admin.users({ q: '%', limit: 9, offset: 0 })).rows.map((row) => row.id),
      ).toEqual([b])
      expect(await h.admin.user('nobody'.padEnd(22, '_'))).toBeNull()
      expect(await h.admin.user(a)).toMatchObject({
        id: a,
        email: `first-${tag}@example.com`,
        sessions: 0,
        sites: 0,
        monitors: 0,
        apiKeys: 0,
        scans: 0,
        suspendedAt: null,
        hasOverrides: false,
      })
      await h.admin.setOverrides(a, { pdfPerMonth: 1 }, NOW)
      expect((await h.admin.user(a))?.hasOverrides).toBe(true)
    })

    it('lists scans by state and host, says whose they are, and deletes one', async () => {
      const h = await make()
      const tag = id('h').slice(0, 8).toLowerCase()
      const userId = id('o')
      await h.user({ id: userId, email: `${userId}@example.com`, name: 'Owner', createdAt: NOW })
      const mine = id('s')
      const anon = id('s')
      const failed = id('s')
      await h.scan({
        id: mine,
        url: `https://shop-${tag}.example/a`,
        createdAt: new Date(NOW.getTime() - 3000),
        state: 'queued',
        userId,
      })
      await h.scan({
        id: anon,
        url: `https://shop-${tag}.example/b?x=1`,
        createdAt: new Date(NOW.getTime() - 2000),
        state: 'queued',
      })
      await h.scan({
        id: failed,
        url: `https://other-${tag}.example/`,
        createdAt: new Date(NOW.getTime() - 1000),
        state: 'failed',
      })
      const byHost = await h.admin.scans({ host: `SHOP-${tag}`, limit: 10, offset: 0 })
      expect(byHost.rows.map((row) => row.id)).toEqual([anon, mine])
      expect(byHost.rows[1]).toMatchObject({
        host: `shop-${tag}.example`,
        userId,
        userEmail: `${userId}@example.com`,
        state: 'queued',
      })
      expect(byHost.rows[0]).toMatchObject({ userId: null, userEmail: null })
      expect(
        (await h.admin.scans({ host: tag, state: 'failed', limit: 10, offset: 0 })).rows.map(
          (row) => row.id,
        ),
      ).toEqual([failed])
      expect((await h.admin.scans({ host: tag, limit: 1, offset: 1 })).total).toBe(3)
      const top = await h.admin.topHosts(new Date(NOW.getTime() - DAY), 100)
      expect(top.find((row) => row.host === `shop-${tag}.example`)?.count).toBe(2)
      expect(await h.admin.deleteScan(anon)).toBe(true)
      expect(await h.admin.deleteScan(anon)).toBe(false)
      expect((await h.admin.scans({ host: tag, limit: 10, offset: 0 })).total).toBe(2)
    })

    it('counts the week for the overview, and its fourteen days', async () => {
      const h = await make()
      const before = await h.admin.overview(NOW)
      const userId = id('v')
      await h.user({
        id: userId,
        email: `${userId}@example.com`,
        name: 'V',
        createdAt: new Date(NOW.getTime() - DAY),
      })
      await h.scan({
        id: id('s'),
        url: 'https://ov.example/',
        createdAt: new Date(NOW.getTime() - 1000),
        state: 'queued',
        userId,
      })
      await h.scan({
        id: id('s'),
        url: 'https://ov.example/x',
        createdAt: new Date(NOW.getTime() - 2000),
        state: 'failed',
      })
      await h.admin.setSuspended(userId, NOW, NOW)
      const after = await h.admin.overview(NOW)
      expect(after.accounts.total).toBe(before.accounts.total + 1)
      expect(after.accounts.newThisWeek).toBe(before.accounts.newThisWeek + 1)
      expect(after.accounts.suspended).toBe(before.accounts.suspended + 1)
      expect(after.scans.today.account).toBe(before.scans.today.account + 1)
      expect(after.scans.today.anonymous).toBe(before.scans.today.anonymous + 1)
      expect(after.scans.week.account).toBe(before.scans.week.account + 1)
      expect(after.scans.failed24h).toBe(before.scans.failed24h + 1)
      expect(after.scans.queued).toBe(before.scans.queued + 1)
      expect(after.daily.days).toHaveLength(14)
      expect(after.daily.days.at(-1)).toBe('2026-10-16')
      expect(after.daily.scansAccount.at(-1)).toBe((before.daily.scansAccount.at(-1) ?? 0) + 1)
      expect(after.daily.newAccounts.at(-2)).toBe((before.daily.newAccounts.at(-2) ?? 0) + 1)
    })
  })
}
