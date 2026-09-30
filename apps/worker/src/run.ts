import type { ScanEvent } from '@arablyzer/api-contract'
import type { Report } from '@arablyzer/report-schema'
import type { Scanner } from '@arablyzer/scanner-client'
import type { ScanEvents, ScanJob, ScanStore } from '@arablyzer/store'

export interface WorkerDeps {
  readonly store: ScanStore
  readonly events: ScanEvents
  /** The engine: the scanner container in Compose (M2.1 plan §5b), or in this process in dev. */
  readonly scanner: Scanner
  readonly now?: () => Date
  /** Where a scan that could not run is told; the report is never where it goes. */
  readonly log?: (message: string) => void
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * A queued job's data as a scan: its ID and page, and the tool a tool page asked for (M2.2).
 * Anything else is not a scan, and throws.
 */
export function scanJobOf(data: unknown): ScanJob {
  const { id, url, tool } = (typeof data === 'object' && data !== null ? data : {}) as Record<
    string,
    unknown
  >
  if (typeof id !== 'string' || typeof url !== 'string') throw new Error('Not a scan')
  if (tool !== undefined && typeof tool !== 'string') throw new Error('Not a scan')
  return { id, url, ...(tool === undefined ? {} : { tool }) }
}

/**
 * One scan, from the queue to its stored report (M2.1 plan §4): each step the scan reports, from
 * `started`, then done with the report's state. A scan that throws is failed, with no report,
 * and its page is told. Events keep their order, each waiting for the one before it; one that
 * cannot be sent is logged and the scan goes on. A scan that is no longer queued (its job run
 * again after its worker died) is never run twice: it is failed instead.
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
  let report: Report
  try {
    report = await deps.scanner(
      { url: job.url, ...(job.tool === undefined ? {} : { tool: job.tool }) },
      publish,
    )
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
