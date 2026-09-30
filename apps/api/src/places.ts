import type { ScanState } from '@arablyzer/api-contract'
import type { InFlight, ScanStore } from '@arablyzer/store'

/**
 * How long a place may be held for a scan with no record before it is dropped. A request takes
 * its place, then looks a name up, then makes the scan's record, each within a timeout of five
 * seconds, so a place must not be dropped in that time; past it, a scan with no record is one
 * that was deleted (or that never was), and its place is nobody's.
 */
export const RECORD_GRACE_MS = 60_000

const ENDED: ReadonlySet<ScanState> = new Set(['complete', 'partial', 'failed'])

/** Whether the scan a place was taken for is over: it ended, or it has no record and should. */
function isOver(state: ScanState | undefined, takenAt: number, now: number): boolean {
  return state === undefined ? now - takenAt > RECORD_GRACE_MS : ENDED.has(state)
}

/**
 * Takes a place for a visitor's new scan, unless they hold their cap of scans still queued or
 * running (security review, issue #30). The places of scans that are over are given back first:
 * the scan store says which, since it is the one that knows, and nothing tells the API when a
 * worker finishes one. False when the visitor is at the cap.
 */
export async function holdPlace(
  deps: { readonly inFlight: InFlight; readonly store: ScanStore },
  visitor: string,
  scanId: string,
  cap: number,
  now: number,
): Promise<boolean> {
  const held = await deps.inFlight.held(visitor)
  if (held.length > 0) {
    const states = await deps.store.states(held.map((place) => place.scanId))
    const over = held
      .filter((place) => isOver(states.get(place.scanId), place.at, now))
      .map((place) => place.scanId)
    if (over.length > 0) await deps.inFlight.release(visitor, over)
  }
  return deps.inFlight.hold(visitor, scanId, cap, now)
}
