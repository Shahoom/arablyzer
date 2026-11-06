import { newScanId } from '../ids'
import { startLoop, type Loop } from '../monitor/loop'
import type { ApiDeps } from '../app'
import { createPlatformScheduler } from './audit'

/**
 * Starts the audits and refreshes of the Salla and Zid apps, in the API's own process and on its
 * stores (there is no second service to run): the same scheduler, one tick a minute. Null when
 * both apps are off. A second API process ticks too; the stores' leases keep them from repeating
 * each other.
 */
export function startPlatformLoop(
  deps: ApiDeps,
  log: (message: string) => void,
  options: { readonly intervalMs?: number } = {},
): Loop | null {
  const { platforms } = deps
  if (platforms === undefined) return null
  const apps = {
    ...(platforms.salla === undefined ? {} : { salla: platforms.salla.app }),
    ...(platforms.zid === undefined ? {} : { zid: platforms.zid.app }),
  }
  return startLoop(
    createPlatformScheduler({
      data: platforms.context.data,
      store: deps.store,
      queue: deps.queue,
      events: deps.events,
      limiter: deps.limiter,
      inFlight: deps.inFlight,
      limits: deps.limits,
      policy: deps.policy,
      resolver: deps.resolver,
      apps,
      newId: newScanId,
      log,
    }),
    {
      log,
      name: 'Platforms',
      ...(options.intervalMs === undefined ? {} : { intervalMs: options.intervalMs }),
    },
  )
}
