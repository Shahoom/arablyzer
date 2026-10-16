import { createHash } from 'node:crypto'
import type { CrawlClient } from '@arablyzer/scanner-client'
import { ScannerUnavailable } from '@arablyzer/scanner-client'
import type { ScanJob, ScanRecord, ScanStore } from '@arablyzer/store'
import type { EngineName, RunnerConfig } from './config'
import { isOptedOut } from './frame'
import { compact } from './outcome'
import { unitHash } from './rng'
import type { ResultRow, SotawStore } from './store'

/** What the crawl asks of the scan queue: whether a visitor is in it, and to add a scan behind them. */
export interface CrawlQueue {
  /** Scans waiting or running that are not prioritised: the visitors', and ours that are running. */
  busy(): Promise<number>
  add(job: ScanJob, options: { readonly priority: number }): Promise<void>
}

export interface RunnerDeps {
  readonly store: SotawStore
  readonly scans: Pick<ScanStore, 'create' | 'get' | 'delete'>
  readonly queue: CrawlQueue
  readonly crawler: Pick<CrawlClient, 'page'>
  /** The host's one-minute load average per core. */
  readonly load: () => number
  /** Milliseconds, from any clock that does not go back. */
  readonly now: () => number
  /** Waits; ends early when the signal is aborted. */
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>
  readonly newId: () => string
  readonly log: (line: string) => void
}

/** Why a site was not judged, as the aggregates count them. */
export type SkipReason =
  | 'opt-out'
  | 'robots'
  | 'robots-unreachable'
  | 'bot-challenge'
  | 'blocked'
  | 'unreachable'
  | 'http-error'
  | 'not-html'
  | 'off-domain'
  | 'no-page'

type Verdict =
  { readonly go: true; readonly url: string } | { readonly go: false; readonly reason: SkipReason }

interface Flight {
  readonly row: ResultRow
  readonly scanId: string
  readonly launchedAt: number
  /** The worker has taken it: it counts as the crawl's own in the queue's busy count. */
  running: boolean
}

export interface RunSummary {
  readonly runId: string
  readonly taken: number
  readonly stopped: 'finished' | 'aborted' | 'limit'
  readonly counts: Readonly<Record<string, number>>
}

/** Waits for the next launch when the previous one was too near. */
const unavailableMs = 15_000

/**
 * The crawl of the sample frame, one site at a time (docs/design/plans/m9-state-of-arabic-web.md §3).
 * For each site, in the seeded order: its robots.txt and front page are read through the scanner
 * (the crawler's way, RFC 9309: a group for `*` counts, and a file that cannot be read keeps the
 * crawler out); a site that allows it is scanned by the ordinary worker, as a job with the lowest
 * priority, in the browsers asked for; its report is made compact, the scan is deleted, and the
 * outcome kept. It starts nothing while a visitor's scan waits or runs or the host is busy, and
 * never faster than the rate cap, so it adds to the visitors' wait by at most the scan it has begun.
 */
export function createRunner(runId: string, deps: RunnerDeps, config: RunnerConfig) {
  const { store, scans, queue, crawler } = deps
  // What deletes the crawl's own scans: they are made with its hash, and are known to nobody else.
  const deleteTokenHash = createHash('sha256').update(`sotaw:${runId}`).digest('hex')

  const enginesOf = (domain: string): EngineName[] =>
    unitHash(`${config.seed}:engines`, domain) < config.allEnginesShare
      ? ['chromium', 'firefox', 'webkit']
      : [...config.engines]

  /** What the site's own front page says, through the scanner. */
  async function preflight(domain: string): Promise<Verdict> {
    // https first, then http, then www: a site's address is what its owner made it, and a front
    // page that no one answers is a site without a front page, not a site to count as secure.
    for (const url of [`https://${domain}/`, `http://${domain}/`, `https://www.${domain}/`]) {
      const answer = await crawler.page(url, { anyOrigin: true })
      switch (answer.outcome) {
        case 'ok':
          return onDomain(answer.finalUrl ?? url, domain)
            ? { go: true, url }
            : { go: false, reason: 'off-domain' }
        case 'blocked':
          return {
            go: false,
            reason:
              answer.error === 'robots' ||
              answer.error === 'robots-unreachable' ||
              answer.error === 'bot-challenge'
                ? answer.error
                : 'blocked',
          }
        case 'not-html':
          return { go: false, reason: 'not-html' }
        case 'offsite':
          return { go: false, reason: 'off-domain' }
        case 'error':
          // A site that answered, with an error, has no other address to try.
          if (answer.status !== null) return { go: false, reason: 'http-error' }
      }
    }
    return { go: false, reason: 'unreachable' }
  }

  async function run(signal: AbortSignal): Promise<RunSummary> {
    const flights = new Map<string, Flight>()
    let lastLaunch = Number.NEGATIVE_INFINITY
    let lastPreflight = Number.NEGATIVE_INFINITY
    let taken = 0
    let paused: string | null = null
    let ended = 0

    const at = () => new Date(deps.now())
    const progress = async () => {
      if (++ended % 25 !== 0) return
      const counts = await store.counts(runId)
      deps.log(
        `done ${String(counts.done)}, skipped ${String(counts.skipped)}, failed ${String(counts.failed)}, to do ${String(counts.pending + counts.running)}`,
      )
    }

    /** Why the crawl must wait now, or null: a visitor's scan is queued or running, or the host is busy. */
    async function gate(): Promise<'queue' | 'load' | null> {
      const own = [...flights.values()].filter((flight) => flight.running).length
      if ((await queue.busy()) - own > 0) return 'queue'
      return deps.load() > config.maxLoad ? 'load' : null
    }

    /** Waits until the gate is open; false when the crawl was stopped meanwhile. */
    async function open(): Promise<boolean> {
      for (;;) {
        if (signal.aborted) return false
        const why = await gate()
        if (why === null) {
          if (paused !== null) deps.log(`resumed after a pause for ${paused}`)
          paused = null
          return true
        }
        if (paused !== why)
          deps.log(
            `paused: ${why === 'queue' ? "a visitor's scan is waiting or running" : 'the host is busy'}`,
          )
        paused = why
        await deps.sleep(config.pollMs, signal)
      }
    }

    const spaced = async (last: number, ms: number) => {
      const wait = last + ms - deps.now()
      if (wait > 0) await deps.sleep(wait, signal)
    }

    async function dropScan(scanId: string): Promise<void> {
      try {
        await scans.delete(scanId, deleteTokenHash)
      } catch (error) {
        // The retention sweep deletes it in the end.
        deps.log(
          `could not delete scan ${scanId}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    async function retryOrFail(row: ResultRow, reason: string): Promise<void> {
      if (row.attempts < config.maxAttempts) await store.retry(runId, row.domain, reason)
      else await store.fail(runId, row.domain, reason, at())
      await progress()
    }

    async function conclude(flight: Flight, record: ScanRecord): Promise<void> {
      const { row } = flight
      // A scan the worker could not run has no report; one whose page could not be read has one.
      if (record.report === null) {
        await retryOrFail(row, 'scan-failed')
      } else {
        const { outcome, unjudged } = compact(record.report)
        if (unjudged === null) await store.done(runId, row.domain, outcome, at())
        else await store.skip(runId, row.domain, unjudged, at())
        await progress()
      }
      await dropScan(flight.scanId)
    }

    /** One look at every scan in flight; the ones that ended are concluded. */
    async function settle(): Promise<void> {
      for (const [domain, flight] of [...flights]) {
        const record = await scans.get(flight.scanId)
        if (record === null) {
          flights.delete(domain)
          await retryOrFail(flight.row, 'scan-missing')
        } else if (
          record.state === 'complete' ||
          record.state === 'partial' ||
          record.state === 'failed'
        ) {
          flights.delete(domain)
          await conclude(flight, record)
        } else if (deps.now() - flight.launchedAt > config.scanTimeoutMs) {
          flights.delete(domain)
          await store.fail(runId, domain, 'timeout', at())
          await dropScan(flight.scanId)
          await progress()
        } else {
          flight.running = record.state === 'running'
        }
      }
    }

    /** A site a dead crawler left running: its scan is waited for, or it goes back to be tried. */
    async function adopt(row: ResultRow): Promise<void> {
      const record = row.scanId === null ? null : await scans.get(row.scanId)
      if (row.scanId === null || record === null) {
        await store.release(runId, row.domain)
      } else {
        flights.set(row.domain, { row, scanId: row.scanId, launchedAt: deps.now(), running: false })
      }
    }

    async function launch(row: ResultRow, url: string): Promise<void> {
      const scanId = deps.newId()
      try {
        await scans.create({ id: scanId, url, createdAt: at(), deleteTokenHash })
        await store.attach(runId, row.domain, scanId)
        await queue.add(
          { id: scanId, url, engines: enginesOf(row.domain) },
          { priority: config.priority },
        )
      } catch (error) {
        deps.log(
          `could not queue ${row.domain}: ${error instanceof Error ? error.message : String(error)}`,
        )
        await dropScan(scanId)
        await store.release(runId, row.domain)
        await deps.sleep(unavailableMs, signal)
        return
      }
      lastLaunch = deps.now()
      flights.set(row.domain, { row, scanId, launchedAt: lastLaunch, running: false })
    }

    async function visit(row: ResultRow): Promise<void> {
      if (isOptedOut(row.domain, config.optOut)) {
        await store.skip(runId, row.domain, 'opt-out', at())
        return progress()
      }
      await spaced(lastPreflight, config.preflightMs)
      lastPreflight = deps.now()
      let verdict: Verdict
      try {
        verdict = await preflight(row.domain)
      } catch (error) {
        if (error instanceof ScannerUnavailable) {
          await store.release(runId, row.domain)
          deps.log('the scanner is not there; waiting')
          await deps.sleep(unavailableMs, signal)
          return
        }
        return retryOrFail(row, 'preflight-failed')
      }
      if (!verdict.go) {
        await store.skip(runId, row.domain, verdict.reason, at())
        return progress()
      }
      // The rate cap, and the gate once more: waiting for the one may have let a visitor in.
      await spaced(lastLaunch, config.intervalMs)
      if (!(await open())) {
        await store.release(runId, row.domain)
        return
      }
      await launch(row, verdict.url)
    }

    for (const row of await store.running(runId)) await adopt(row)

    while (!signal.aborted) {
      await settle()
      const full = flights.size >= config.concurrency
      const limited = config.limit !== null && taken >= config.limit
      if (full || limited) {
        if (flights.size === 0) break
        await deps.sleep(config.watchMs, signal)
        continue
      }
      if (!(await open())) break
      const row = await store.claim(runId, at())
      if (row === null) {
        if (flights.size === 0) break
        await deps.sleep(config.watchMs, signal)
        continue
      }
      taken++
      await visit(row)
    }
    const counts = await store.counts(runId)
    const finished = counts.pending === 0 && counts.running === 0
    const stopped = signal.aborted ? 'aborted' : finished ? 'finished' : 'limit'
    return { runId, taken, stopped, counts }
  }

  return { run }
}

/** Whether the page the front page led to is still the site's: its own host or a subdomain, `www` included. */
export function onDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '')
    return host === domain || host.endsWith(`.${domain}`)
  } catch {
    return false
  }
}
