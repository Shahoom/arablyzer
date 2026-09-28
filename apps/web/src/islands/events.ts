import { scanEventsPath, TERMINAL_EVENTS, type ScanEvent } from '@arablyzer/api-contract/codes'

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

/** How many failed connections in a row before the page says the service is lost. */
const MAX_FAILURES = 5

/**
 * Follows a scan's events (SSE) until it ends. The browser reconnects by itself, resuming after
 * the last event it saw (Last-Event-ID); after a few failures in a row the page is told. Returns
 * a function that stops following.
 */
export function followScan(
  id: string,
  onEvent: (event: ScanEvent) => void,
  onLost: () => void,
): () => void {
  const source = new EventSource(scanEventsPath(id))
  let failures = 0
  source.onmessage = (message: MessageEvent<string>) => {
    failures = 0
    let event: unknown
    try {
      event = JSON.parse(message.data)
    } catch {
      return
    }
    const type = (event as { type?: unknown } | null)?.type
    if (typeof type !== 'string' || !TYPES.has(type)) return
    const known = event as ScanEvent
    onEvent(known)
    if (TERMINAL_EVENTS.includes(known.type)) source.close()
  }
  source.onerror = () => {
    failures++
    if (source.readyState === EventSource.CLOSED || failures >= MAX_FAILURES) {
      source.close()
      onLost()
    }
  }
  return () => {
    source.close()
  }
}
