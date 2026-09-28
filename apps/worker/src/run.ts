import type { ScanEvent } from '@arablyzer/api-contract'
import type { ScanOptions, ScanProgress } from '@arablyzer/engine'
import type { Report } from '@arablyzer/report-schema'
import type { ScanEvents, ScanJob, ScanStore } from '@arablyzer/store'

export type Scanner = (url: string, options: ScanOptions) => Promise<Report>

export interface WorkerDeps {
  readonly store: ScanStore
  readonly events: ScanEvents
  readonly scanner: Scanner
  /** The scan's options: its address rules, engines and keys (options.ts). */
  readonly options: ScanOptions
  readonly now?: () => Date
  /** Where a scan that could not run is told; the report is never where it goes. */
  readonly log?: (message: string) => void
}

/**
 * One scan, from the queue to its stored report (M2.1 plan §4): started, each step the engine
 * reports, then done with the report's state. A scan that throws is failed, with no report, and
 * its page is told. Events keep their order: each waits for the one before it.
 */
export async function runScan(job: ScanJob, deps: WorkerDeps): Promise<void> {
  const now = deps.now ?? (() => new Date())
  await deps.store.start(job.id, now())
  let published: Promise<unknown> = deps.events.publish(job.id, {
    type: 'started',
    engines: deps.options.render?.engines ?? [],
  })
  const publish = (event: ScanEvent) => {
    published = published.then(
      () => deps.events.publish(job.id, event),
      () => deps.events.publish(job.id, event),
    )
  }
  try {
    const report = await deps.scanner(job.url, {
      ...deps.options,
      onProgress: (progress) => {
        publish(eventOf(progress))
      },
    })
    await published.catch(() => undefined)
    await deps.store.finish(job.id, report, now())
    await deps.events.publish(job.id, { type: 'done', state: report.scan.status })
  } catch (error) {
    deps.log?.(
      `Scan ${job.id} could not run: ${error instanceof Error ? error.message : String(error)}`,
    )
    await published.catch(() => undefined)
    await deps.store.fail(job.id, now())
    await deps.events.publish(job.id, { type: 'error' })
  }
}

/** The engine's step as the page reads it. */
export function eventOf(progress: ScanProgress): ScanEvent {
  switch (progress.step) {
    case 'page':
      return {
        type: 'page',
        status: progress.status,
        contentType: progress.contentType,
        error: progress.error,
      }
    case 'robots':
      return { type: 'robots', outcome: progress.outcome, status: progress.status }
    case 'crux':
      return { type: 'crux', outcome: progress.outcome }
    case 'render-start':
      return { type: 'render-start', engine: progress.engine }
    case 'render':
      return {
        type: 'render',
        engine: progress.run.engine,
        version: progress.run.version,
        status: progress.run.status,
        requests: progress.run.requests,
      }
    case 'lab-start':
      return { type: 'lab-start' }
    case 'lab':
      return { type: 'lab', status: progress.status }
    case 'rules':
      return { type: 'rules', rules: progress.rules }
  }
}
