import { quietly } from '@arablyzer/store'
import type { Scheduler } from './scheduler'
import type { Random } from './schedule'

/** How often the scheduler looks: a minute, give or take ten seconds so schedulers do not step together. */
export const TICK_MS = 60_000
const JITTER_MS = 10_000

export interface Loop {
  /** Ends the loop; a tick under way finishes. Resolves when it has. */
  stop(): Promise<void>
}

/**
 * Ticks the scheduler for as long as it runs, one tick at a time: the next is timed from the end
 * of the last, so a slow tick is never overlapped. A tick that throws is told, and the next one
 * tries again.
 */
export function startLoop(
  scheduler: Scheduler,
  options: {
    readonly log?: (message: string) => void
    readonly random?: Random
    readonly intervalMs?: number
    /** What a failed tick is called in the log. */
    readonly name?: string
  } = {},
): Loop {
  const told = quietly(options.name ?? 'Monitor', options.log)
  const random = options.random ?? Math.random
  const interval = options.intervalMs ?? TICK_MS
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  let running: Promise<void> = Promise.resolve()
  const schedule = (delay: number) => {
    if (stopped) return
    timer = setTimeout(() => {
      running = scheduler
        .tick()
        .catch((error: unknown) => {
          told(error instanceof Error ? error : new Error('A tick failed'))
        })
        .finally(() => {
          schedule(interval + Math.floor((random() - 0.5) * 2 * JITTER_MS))
        })
    }, delay)
  }
  // The first look comes soon after the start, not at once: a restart of everything is not a stampede.
  schedule(Math.floor(random() * JITTER_MS))
  return {
    async stop() {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
      await running
    },
  }
}
