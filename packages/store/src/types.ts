import type { ScanEvent, ScanState } from '@arablyzer/api-contract'
import type { Report } from '@arablyzer/report-schema'

/** A scan as the API keeps it: the page asked for, never anything about who asked (§14). */
export interface ScanRecord {
  readonly id: string
  readonly url: string
  /** The tool the scan ran (M2.2), or null for a whole scan. */
  readonly tool: string | null
  readonly state: ScanState
  readonly createdAt: Date
  readonly startedAt: Date | null
  readonly finishedAt: Date | null
  readonly report: Report | null
}

/**
 * Scans and their reports. A scan moves one way, queued → running → finished, and each move is
 * made only from the state before it: a move that does not apply answers false and changes
 * nothing, so a job run twice never scans twice or overwrites a report.
 */
/** A scan as the API records it, before it is queued. */
export interface NewScan {
  readonly id: string
  readonly url: string
  readonly createdAt: Date
  /** A tool's slug: the scan runs that tool's rules alone. */
  readonly tool?: string
}

export interface ScanStore {
  create(scan: NewScan): Promise<void>
  get(id: string): Promise<ScanRecord | null>
  /** Queued → running. */
  start(id: string, at: Date): Promise<boolean>
  /** Running → the report's state, with the report. */
  finish(id: string, report: Report, at: Date): Promise<boolean>
  /** Queued or running → failed, with no report: the scan could not run. */
  fail(id: string, at: Date): Promise<boolean>
  /** Fails the scans still running that started before the time, and names them. */
  failStale(startedBefore: Date, at: Date): Promise<string[]>
}

/** What the worker is given: the scan and its page, and nothing else. */
export interface ScanJob {
  readonly id: string
  readonly url: string
  /** A tool's slug, when a tool page asked: its rules alone. */
  readonly tool?: string
}

export interface ScanQueue {
  /** Scans waiting, not yet started. */
  waiting(): Promise<number>
  /** Queues the scan, once: a second add of the same ID does nothing. */
  add(job: ScanJob): Promise<void>
}

export interface StoredEvent {
  /** Increasing within a scan: what `Last-Event-ID` resumes after. */
  readonly id: string
  readonly event: ScanEvent
}

export interface ScanEvents {
  publish(scanId: string, event: ScanEvent): Promise<string>
  /** The events after `after` (all of them for null) that are there now, without waiting. */
  since(scanId: string, after: string | null): Promise<StoredEvent[]>
  /** Events after `after` (all of them for null), and those still to come, until the signal. */
  follow(
    scanId: string,
    after: string | null,
    signal: AbortSignal,
  ): AsyncIterable<StoredEvent | null>
}
