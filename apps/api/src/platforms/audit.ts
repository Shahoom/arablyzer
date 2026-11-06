import type { EgressPolicy, Resolver } from '@arablyzer/egress'
import type { ScanLimits } from '@arablyzer/plans'
import {
  hostLimitKey,
  quietly,
  type InFlight,
  type Platform,
  type PlatformData,
  type PlatformInstall,
  type RateLimiter,
  type ScanEvents,
  type ScanQueue,
  type ScanStore,
} from '@arablyzer/store'
import { monitorQueueRoom } from '../monitor/scheduler'
import type { Scheduler } from '../monitor/scheduler'
import { holdPlace } from '../places'
import { parseTarget, resolveTarget } from '../target'
import { HOUR_MS, type PlatformApp } from './install'

export interface AuditLoopDeps {
  readonly data: PlatformData
  readonly store: ScanStore
  readonly queue: ScanQueue
  readonly events: ScanEvents
  readonly limiter: RateLimiter
  readonly inFlight: InFlight
  readonly limits: ScanLimits
  readonly policy: EgressPolicy
  readonly resolver: Resolver
  readonly apps: Readonly<Partial<Record<Platform, PlatformApp>>>
  readonly newId: () => string
  readonly now?: () => Date
  readonly random?: () => number
  readonly log?: (message: string) => void
}

/** How many stores one tick starts at most, for audits and for refreshes alike. */
export const BATCH = 5
/** How long a claimed store is held for the scheduler that claimed it. */
export const LEASE_MS = 10 * 60 * 1000
const MINUTE_MS = 60 * 1000

/**
 * The store audits and the token refreshes (M9). A tick claims the stores whose audit is due and
 * starts a scan of each storefront the way a monitored site's starts (monitor/scheduler.ts): the
 * store's place (one at a time), the DNS vetting by the egress rules, the host's bucket, and only
 * into the lower half of the queue, so a visitor is never behind them. What cannot start now is
 * put off a few minutes, spread. It keeps no state of its own: the claim is a lease in the store,
 * so a second scheduler or a restart repeats nothing.
 */
export function createPlatformScheduler(deps: AuditLoopDeps): Scheduler {
  const now = deps.now ?? (() => new Date())
  const random = deps.random ?? Math.random
  const told = quietly('Platforms', deps.log)
  const tell = (error: unknown) => {
    told(new Error(error instanceof Error ? error.message : 'A platform step failed'))
  }
  const later = (at: Date, baseMinutes = 5) =>
    new Date(at.getTime() + Math.floor((baseMinutes + random() * 10) * MINUTE_MS))

  async function launch(claimed: PlatformInstall): Promise<void> {
    const at = now()
    const app = deps.apps[claimed.platform]
    if (app === undefined) {
      // The platform was turned off since: nothing is scanned for it, and nothing is lost.
      await deps.data.deferAudit(claimed.id, new Date(at.getTime() + 6 * HOUR_MS))
      return
    }
    const install = claimed.storeUrl === null ? await app.learn(claimed) : claimed
    if (install.storeUrl === null) {
      await deps.data.deferAudit(install.id, new Date(at.getTime() + 6 * HOUR_MS))
      return
    }
    const url = install.storeUrl
    const holder = `platform:${install.platform}:${install.storeKey}`
    const id = deps.newId()
    // One audit of a store at a time: a place is held while its scan is queued or running.
    if (!(await holdPlace(deps, holder, id, 1, at.getTime()))) {
      await deps.data.deferAudit(install.id, later(at, 15))
      return
    }
    let queued = false
    try {
      const parsed = parseTarget(url, deps.policy)
      const resolved = parsed.ok
        ? await resolveTarget(parsed.value, deps.policy, deps.resolver)
        : parsed
      if (!resolved.ok) {
        // The name does not resolve to a public address: recorded as a scan that failed, which
        // is what the panel tells the merchant.
        await deps.store.create({ id, url, createdAt: at })
        await deps.data.recordAudit({ installId: install.id, scanId: id, at })
        await deps.store.fail(id, at)
        await deps.events.publish(id, { type: 'error' }).catch(() => '')
        return
      }
      if (parsed.ok) {
        const host = await deps.limiter.take(
          hostLimitKey(parsed.value.host),
          deps.limits.perHost,
          at.getTime(),
        )
        if (!host.ok) {
          await deps.data.deferAudit(install.id, later(at, Math.ceil(host.retryAfterSeconds / 60)))
          return
        }
      }
      const ahead = await deps.queue.waiting()
      if (ahead >= monitorQueueRoom(deps.limits)) {
        await deps.data.deferAudit(install.id, later(at))
        return
      }
      // Stored, recorded and announced before it is queued, so the worker never starts a scan
      // whose record is not there yet; a failure after the record fails the scan at once.
      await deps.store.create({ id, url: resolved.value, createdAt: at })
      try {
        await deps.data.recordAudit({ installId: install.id, scanId: id, at })
        await deps.events.publish(id, { type: 'queued', ahead })
        await deps.queue.add({ id, url: resolved.value })
      } catch (error) {
        await deps.store.fail(id, at).catch(() => false)
        await deps.events.publish(id, { type: 'error' }).catch(() => '')
        throw error
      }
      queued = true
    } finally {
      if (!queued) await deps.inFlight.release(holder, [id]).catch(() => undefined)
    }
  }

  return {
    async tick(): Promise<void> {
      const at = now()
      const lease = new Date(at.getTime() + LEASE_MS)
      for (const install of await deps.data.claimRefreshes(at, BATCH, lease)) {
        try {
          await deps.apps[install.platform]?.refresh(install)
        } catch (error) {
          // The lease ends by itself, and the refresh is tried again then.
          tell(error)
        }
      }
      const room = monitorQueueRoom(deps.limits) - (await deps.queue.waiting())
      if (room <= 0) return
      for (const install of await deps.data.claimAudits(at, Math.min(BATCH, room), lease)) {
        try {
          await launch(install)
        } catch (error) {
          tell(error)
        }
      }
    },
  }
}
