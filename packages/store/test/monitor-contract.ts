import type { Report } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import type { AccountData, DueMonitor, MonitorData, ScanStore } from '../src/index'

export const NOW = new Date('2026-10-09T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
export const at = (days: number) => new Date(NOW.getTime() + days * DAY)

export interface Harness {
  readonly monitors: MonitorData
  readonly accounts: AccountData
  readonly scans: ScanStore
  /** Makes the person exist (PostgreSQL needs the row). */
  user(id: string): Promise<void>
}

let counter = 0
/** An id of 22 characters, so it passes where a scan's or a site's id is checked. */
export const id = (prefix: string) => `${prefix}${String(++counter)}`.padEnd(22, '_')

/** The monitoring contract, run over the memory store and PostgreSQL alike. */
export function monitorContract(make: () => Harness | Promise<Harness>): void {
  async function setup(sites = 3) {
    const h = await make()
    const userId = id('u')
    await h.user(userId)
    const made: { id: string; url: string }[] = []
    for (let n = 0; n < sites; n++) {
      const site = { id: id('s'), url: `https://site${String(counter)}.example/`, createdAt: at(n) }
      await h.accounts.addSite(userId, site, 10)
      made.push(site)
    }
    return { ...h, userId, sites: made }
  }
  const input = (days = 7, next = at(0)) => ({ everyDays: days, nextRunAt: next, createdAt: NOW })
  const finished = (score: number | null, status: 'complete' | 'partial' = 'complete') =>
    ({ scan: { status }, score: { overall: score }, findings: [] }) as unknown as Report

  describe('enabling', () => {
    it('holds a person to the limit when many enables arrive at once, and resumes a paused one', async () => {
      const { monitors, userId, sites } = await setup(6)
      const results = await Promise.all(
        sites.map((site) => monitors.enable(userId, site.id, input(), 2)),
      )
      expect(results.filter((r) => r.kind === 'enabled')).toHaveLength(2)
      expect(results.filter((r) => r.kind === 'limit')).toHaveLength(4)
      const first = sites.find(
        (_, index) => results[index]?.kind === 'enabled',
      ) as (typeof sites)[number]
      expect((await monitors.enable(userId, first.id, input(), 2)).kind).toBe('existing')
      expect(await monitors.pauseExtras(userId, 1)).toBe(1)
      const paused = (await monitors.monitors(userId)).find((m) => m.paused)
      expect(paused).toBeDefined()
      // One active, one paused, limit 1: resuming would make two.
      expect((await monitors.enable(userId, paused?.siteId ?? '', input(), 1)).kind).toBe('limit')
      expect((await monitors.enable(userId, paused?.siteId ?? '', input(), 2)).kind).toBe('enabled')
      expect((await monitors.monitor(userId, paused?.siteId ?? ''))?.paused).toBe(false)
    })

    it('keeps people apart, and disabling removes only the person’s own', async () => {
      const { monitors, accounts, user, userId, sites } = await setup(1)
      const other = id('u')
      await user(other)
      await accounts.addSite(
        other,
        { id: id('s'), url: 'https://other.example/', createdAt: NOW },
        5,
      )
      const site = sites[0] as (typeof sites)[number]
      await monitors.enable(userId, site.id, input(), 1)
      expect(await monitors.monitor(other, site.id)).toBeNull()
      expect(await monitors.disable(other, site.id)).toBe(false)
      expect(await monitors.disable(userId, site.id)).toBe(true)
      expect(await monitors.monitors(userId)).toEqual([])
    })

    it('pauses the extras and keeps the oldest', async () => {
      const { monitors, userId, sites } = await setup(3)
      for (const [n, site] of sites.entries()) {
        await monitors.enable(userId, site.id, { ...input(), createdAt: at(n) }, 5)
      }
      expect(await monitors.pauseExtras(userId, 1)).toBe(2)
      const state = await monitors.monitors(userId)
      expect(state.map((m) => m.paused)).toEqual([false, true, true])
      expect(await monitors.pauseExtras(userId, 1)).toBe(0)
    })
  })

  describe('claiming and recording runs', () => {
    it('leases a due monitor to one claimer, skips paused and future ones, and honours the cap', async () => {
      const { monitors, userId, sites } = await setup(3)
      await monitors.enable(userId, sites[0]?.id ?? '', input(7, at(-2)), 5)
      await monitors.enable(userId, sites[1]?.id ?? '', input(7, at(-1)), 5)
      await monitors.enable(userId, sites[2]?.id ?? '', input(7, at(3)), 5)
      const lease = new Date(NOW.getTime() + 600_000)
      const mine = new Set(sites.map((site) => site.id))
      // The store may hold other people's monitors (PostgreSQL's tests share a database): only these count.
      const ofMine = (due: DueMonitor[]) =>
        due.filter((c) => mine.has(c.monitor.siteId))
      const [a, b] = await Promise.all([
        monitors.claimDue(NOW, 1000, lease),
        monitors.claimDue(NOW, 1000, lease),
      ])
      const claimed = [...ofMine(a ?? []), ...ofMine(b ?? [])]
      expect(claimed.map((c) => c.monitor.siteId).sort()).toEqual(
        [sites[0]?.id, sites[1]?.id].sort(),
      )
      const first = claimed.find((c) => c.monitor.siteId === sites[0]?.id)
      expect(first?.url).toBe(sites[0]?.url)
      expect(first?.scheduledFor).toEqual(at(-2))
      // Leased: nothing of theirs is due until the lease ends.
      expect(ofMine(await monitors.claimDue(NOW, 1000, lease))).toEqual([])
      const again = await monitors.claimDue(new Date(lease.getTime() + 1), 1000, lease)
      expect(ofMine(again)).toHaveLength(2)
      await monitors.defer(sites[0]?.id ?? '', at(2))
      expect((await monitors.monitor(userId, sites[0]?.id ?? ''))?.nextRunAt).toEqual(at(2))
      expect(await monitors.claimDue(at(40), 1, at(41))).toHaveLength(1)
    })

    it('records a run once per slot: the scan becomes the account’s, the next date is set', async () => {
      const { monitors, accounts, scans, userId, sites } = await setup(1)
      const site = sites[0] as (typeof sites)[number]
      await monitors.enable(userId, site.id, input(7, at(-1)), 1)
      const scanId = id('r')
      await scans.create({ id: scanId, url: site.url, createdAt: NOW })
      const run = {
        userId,
        siteId: site.id,
        scanId,
        url: site.url,
        scheduledFor: at(-1),
        at: NOW,
        everyDays: 7,
        nextRunAt: at(7),
      }
      await monitors.recordRun(run)
      expect((await monitors.monitor(userId, site.id))?.nextRunAt).toEqual(at(7))
      expect((await accounts.history(userId, 5)).map((h) => [h.scanId, h.siteId])).toEqual([
        [scanId, site.id],
      ])
      const other = id('r')
      await scans.create({ id: other, url: site.url, createdAt: NOW })
      await expect(monitors.recordRun({ ...run, scanId: other })).rejects.toThrow()
      expect((await accounts.history(userId, 5)).map((h) => h.scanId)).toEqual([scanId])
    })
  })

  describe('results', () => {
    it('lists the trend oldest first, the runs waiting for a decision, and the scan before one', async () => {
      const { monitors, scans, userId, sites } = await setup(1)
      const site = sites[0] as (typeof sites)[number]
      await monitors.enable(userId, site.id, input(7, at(-30)), 1)
      const ids: string[] = []
      for (const [n, score] of [90, 80, null].entries()) {
        const scanId = id('t')
        ids.push(scanId)
        await scans.create({ id: scanId, url: site.url, createdAt: at(-20 + n * 7) })
        await monitors.recordRun({
          userId,
          siteId: site.id,
          scanId,
          url: site.url,
          scheduledFor: at(-20 + n * 7),
          at: at(-20 + n * 7),
          everyDays: 7,
          nextRunAt: at(100),
        })
        await scans.start(scanId, at(-20 + n * 7))
        if (score === null) await scans.fail(scanId, at(-20 + n * 7))
        else await scans.finish(scanId, finished(score), at(-20 + n * 7))
      }
      const trend = (await monitors.trend(userId, 2)).get(site.id) ?? []
      expect(trend.map((p) => [p.scanId, p.score, p.state])).toEqual([
        [ids[1], 80, 'complete'],
        [ids[2], null, 'failed'],
      ])
      const pending = await monitors.pending(at(0), 10)
      expect(pending.filter((p) => p.siteId === site.id).map((p) => p.scanId)).toEqual(ids)
      expect(await monitors.previousScan(site.id, at(-6))).toBe(ids[1])
      expect(await monitors.previousScan(site.id, at(-20))).toBeNull()
      // Failed scans are not "the previous result".
      expect(await monitors.previousScan(site.id, at(30))).toBe(ids[1])
      await monitors.settle(ids[0] ?? '', NOW)
      await monitors.retryLater(ids[1] ?? '', at(1), 2)
      const later = (await monitors.pending(at(0), 10)).filter((p) => p.siteId === site.id)
      expect(later.map((p) => p.scanId)).toEqual([ids[2]])
      const retry = (await monitors.pending(at(2), 10)).find((p) => p.scanId === ids[1])
      expect(retry?.attempts).toBe(2)
    })

    it('sets a monitor’s health', async () => {
      const { monitors, userId, sites } = await setup(1)
      const site = sites[0] as (typeof sites)[number]
      await monitors.enable(userId, site.id, input(), 1)
      await monitors.setHealth(site.id, { failures: 4, paused: true })
      expect(await monitors.monitor(userId, site.id)).toMatchObject({ failures: 4, paused: true })
    })
  })

  describe('alerts', () => {
    it('starts with defaults, changes only what is sent, and counts failed deliveries to a disable', async () => {
      const { monitors, userId } = await setup(0)
      expect(await monitors.alerts(userId)).toMatchObject({
        webhook: null,
        dropThreshold: 10,
        onCritical: true,
        onDown: true,
        weeklySummary: false,
        email: false,
      })
      const saved = await monitors.saveAlerts(userId, {
        webhook: { url: 'https://hooks.example/x', secret: 's3cret', kind: 'generic' },
        dropThreshold: 5,
      })
      expect(saved.webhook).toMatchObject({ url: 'https://hooks.example/x', failures: 0 })
      const kept = await monitors.saveAlerts(userId, { weeklySummary: true })
      expect(kept).toMatchObject({ dropThreshold: 5, weeklySummary: true })
      expect(kept.webhook?.secret).toBe('s3cret')
      for (let n = 1; n <= 2; n++) {
        expect((await monitors.delivered(userId, false, NOW, 3)).webhook?.disabledAt).toBeNull()
      }
      expect((await monitors.delivered(userId, false, NOW, 3)).webhook?.disabledAt).toEqual(NOW)
      // A success resets the count but does not turn it back on.
      const ok = await monitors.delivered(userId, true, at(1), 3)
      expect(ok.webhook).toMatchObject({ failures: 0, disabledAt: NOW })
      await monitors.reenable(userId)
      expect((await monitors.alerts(userId)).webhook?.disabledAt).toBeNull()
      await monitors.summarized(userId, at(1))
      expect((await monitors.alerts(userId)).lastSummaryAt).toEqual(at(1))
      expect((await monitors.saveAlerts(userId, { webhook: null })).webhook).toBeNull()
    })

    it('erases everything of a person', async () => {
      const { monitors, userId, sites } = await setup(1)
      await monitors.enable(userId, sites[0]?.id ?? '', input(), 1)
      await monitors.saveAlerts(userId, { weeklySummary: true })
      await monitors.eraseUser(userId)
      expect(await monitors.monitors(userId)).toEqual([])
      expect((await monitors.alerts(userId)).weeklySummary).toBe(false)
    })
  })
}
