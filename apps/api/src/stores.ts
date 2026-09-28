import type { ScanEvent, ScanState } from '@arablyzer/api-contract'
import type { Report } from '@arablyzer/report-schema'

/** A scan as the API keeps it: the page asked for, never anything about who asked (§14). */
export interface ScanRecord {
  readonly id: string
  readonly url: string
  readonly state: ScanState
  readonly createdAt: Date
  readonly startedAt: Date | null
  readonly finishedAt: Date | null
  readonly report: Report | null
}

export interface ScanStore {
  create(scan: {
    readonly id: string
    readonly url: string
    readonly createdAt: Date
  }): Promise<void>
  get(id: string): Promise<ScanRecord | null>
  start(id: string, at: Date): Promise<void>
  /** Stores the report; the scan's state is the report's. */
  finish(id: string, report: Report, at: Date): Promise<void>
  /** The scan could not run at all: no report. */
  fail(id: string, at: Date): Promise<void>
}

/** What the worker is given: the scan and its page, and nothing else. */
export interface ScanJob {
  readonly id: string
  readonly url: string
}

export interface ScanQueue {
  /** Scans waiting, not yet started. */
  waiting(): Promise<number>
  /** Queues the scan; returns how many wait ahead of it. */
  add(job: ScanJob): Promise<number>
}

export interface StoredEvent {
  /** Increasing within a scan: what `Last-Event-ID` resumes after. */
  readonly id: string
  readonly event: ScanEvent
}

export interface ScanEvents {
  publish(scanId: string, event: ScanEvent): Promise<string>
  /** Events after `after` (all of them for null), and those still to come, until the signal. */
  follow(
    scanId: string,
    after: string | null,
    signal: AbortSignal,
  ): AsyncIterable<StoredEvent | null>
}
