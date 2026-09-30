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

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * One scan, from the queue to its stored report (M2.1 plan §4): started, each step the engine
 * reports, then done with the report's state. A scan that throws is failed, with no report, and
 * its page is told. Events keep their order, each waiting for the one before it; one that cannot
 * be sent is logged and the scan goes on. A scan that is no longer queued (its job run again
 * after its worker died) is never run twice: it is failed instead.
 */
export async function runScan(job: ScanJob, deps: WorkerDeps): Promise<void> {
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? (() => undefined)
  if (!(await deps.store.start(job.id, now()))) {
    log(`Scan ${job.id} is not queued, so it is not run again`)
    await failScan(job.id, deps)
    return
  }
  let published: Promise<void> = Promise.resolve()
  const publish = (event: ScanEvent) => {
    published = published
      .then(() => deps.events.publish(job.id, event))
      .then(
        () => undefined,
        (error: unknown) => {
          log(`Scan ${job.id} lost its ${event.type} event: ${message(error)}`)
        },
      )
  }
  publish({ type: 'started', engines: deps.options.render?.engines ?? [] })
  let report: Report
  try {
    report = await deps.scanner(job.url, {
      ...deps.options,
      onProgress: (progress) => {
        publish(eventOf(progress))
      },
    })
  } catch (error) {
    log(`Scan ${job.id} could not run: ${message(error)}`)
    await published
    await failScan(job.id, deps)
    return
  }
  await published
  // The report is kept before the page is told: a page that misses `done` reads the state.
  if (await deps.store.finish(job.id, report, now())) {
    publish({ type: 'done', state: report.scan.status })
    await published
  }
}

/**
 * Fails a scan that is queued or running, and tells its page: a scan that could not run, or one
 * whose job failed outside runScan (main.ts). A scan that has ended is left as it is.
 */
export async function failScan(
  id: string,
  deps: Pick<WorkerDeps, 'store' | 'events' | 'now' | 'log'>,
): Promise<void> {
  const now = deps.now ?? (() => new Date())
  if (!(await deps.store.fail(id, now()))) return
  try {
    await deps.events.publish(id, { type: 'error' })
  } catch (error) {
    deps.log?.(`Scan ${id} lost its error event: ${message(error)}`)
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
