import {
  scanEventsPath,
  TERMINAL_EVENTS,
  type ScanEvent,
  type ScanSummary,
} from '@arablyzer/api-contract/codes'
import { fetchSummary, type Loaded } from './api'

/** Event types a scan's stream carries; anything else is ignored. */
const TYPES = new Set<string>([
  'queued',
  'started',
  'page',
  'robots',
  'crux',
  'render-start',
  'render',
  'lab-start',
  'lab',
  'rules',
  'done',
  'error',
])

/** The API pings every 15 s (apps/api); three missed, and the stream is taken for dead. */
export const SILENCE_MS = 45_000
/** Reconnections the browser makes on its own before the page asks how the scan is. */
export const MAX_RECONNECTS = 3
/** Tries in a row that fail before the page says it cannot reach the service; it keeps trying. */
export const OFFLINE_AFTER = 3
/** The longest wait between two tries: a service that refuses a stream asks for 30 s. */
export const MAX_BACKOFF_MS = 30_000

export interface FollowHandlers {
  /** The scan is queued or running: its summary; its events follow from its start. */
  onFollowing(summary: ScanSummary): void
  /** One of the scan's events, in order. */
  onEvent(event: ScanEvent): void
  /** The scan ended while no stream was open to say so. */
  onEnded(summary: ScanSummary): void
  /** There is no such scan. */
  onMissing(): void
  /** Whether the service answers: false after OFFLINE_AFTER failed tries, true again once it does. */
  onReachable(reachable: boolean): void
}

type Timer = ReturnType<typeof setTimeout>

export interface FollowDeps {
  readonly EventSource: typeof EventSource
  readonly fetchSummary: (id: string) => Promise<Loaded<ScanSummary>>
  readonly setTimeout: (run: () => void, ms: number) => Timer
  readonly clearTimeout: (timer: Timer) => void
}

const browser = (): FollowDeps => ({
  EventSource,
  fetchSummary: (id) => fetchSummary(id),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (timer) => {
    clearTimeout(timer)
  },
})

const finished = (state: ScanSummary['state']) => state !== 'queued' && state !== 'running'

/**
 * Follows a scan until it ends (M2.1 plan §5). It reads the scan first, then its events (SSE).
 * The browser reconnects a dropped stream by itself, resuming after the last event it saw. A
 * stream that closes, keeps failing or falls silent is followed by a fresh read of the scan:
 * ended, it is reported as ended; running, a new stream replays it from the start. Reads and
 * streams that fail are tried again, less and less often, and never given up on. Returns the
 * function that stops following.
 */
export function followScan(
  id: string,
  handlers: FollowHandlers,
  deps: FollowDeps = browser(),
): () => void {
  let stopped = false
  let source: EventSource | null = null
  let silence: Timer | null = null
  let retry: Timer | null = null
  let reconnects = 0
  /** Streams in a row that broke before they opened: a proxy's 502, the API's 429. */
  let brokenStreams = 0
  /** Reads of the scan in a row that failed. */
  let failedReads = 0
  let reachable = true

  const setReachable = (now: boolean) => {
    if (now === reachable) return
    reachable = now
    handlers.onReachable(now)
  }
  const quiet = () => {
    if (silence !== null) deps.clearTimeout(silence)
    silence = null
  }
  const close = () => {
    quiet()
    source?.close()
    source = null
  }
  const stop = () => {
    stopped = true
    close()
    if (retry !== null) deps.clearTimeout(retry)
    retry = null
  }
  /** Runs a try after a wait that doubles with each failure, up to MAX_BACKOFF_MS. */
  const later = (attempt: () => void, failures: number) => {
    const wait = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(failures, 5))
    retry = deps.setTimeout(() => {
      retry = null
      if (!stopped) attempt()
    }, wait)
  }

  const read = () => {
    void deps.fetchSummary(id).then((summary) => {
      if (stopped) return
      if (!summary.ok) {
        if (summary.reason === 'missing') {
          stop()
          handlers.onMissing()
          return
        }
        failedReads++
        if (failedReads >= OFFLINE_AFTER) setReachable(false)
        later(read, failedReads)
        return
      }
      failedReads = 0
      setReachable(true)
      if (finished(summary.value.state)) {
        stop()
        handlers.onEnded(summary.value)
        return
      }
      handlers.onFollowing(summary.value)
      open()
    })
  }

  /** The stream is gone: after a wait, the scan is read again. */
  const broken = () => {
    close()
    brokenStreams++
    later(read, brokenStreams)
  }

  /** Any sign of life on the stream puts off the silence that would end it. */
  const alive = () => {
    quiet()
    silence = deps.setTimeout(() => {
      silence = null
      broken()
    }, SILENCE_MS)
  }

  const open = () => {
    const current = new deps.EventSource(scanEventsPath(id))
    source = current
    reconnects = 0
    alive()
    current.onopen = () => {
      brokenStreams = 0
      reconnects = 0
      alive()
    }
    current.addEventListener('ping', alive)
    current.onmessage = (message: MessageEvent<string>) => {
      alive()
      let event: unknown
      try {
        event = JSON.parse(message.data)
      } catch {
        return
      }
      const type = (event as { type?: unknown } | null)?.type
      if (typeof type !== 'string' || !TYPES.has(type)) return
      const known = event as ScanEvent
      if (TERMINAL_EVENTS.includes(known.type)) stop()
      handlers.onEvent(known)
    }
    current.onerror = () => {
      if (current !== source) return
      // Closed for good (an answer that is not a stream), or reconnecting too often: read the
      // scan again rather than trust the stream.
      if (current.readyState === deps.EventSource.CLOSED || ++reconnects > MAX_RECONNECTS) {
        broken()
      }
    }
  }

  read()
  return stop
}
