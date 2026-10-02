/**
 * The scans a visitor has queued or running, so no one visitor fills the queue (security review,
 * issue #30). The store keeps the visitor's key, never the visitor (§14), and scan IDs, never
 * their pages; the scans' own state stays in the scan store, which is asked when a place is taken.
 */

/** A place a visitor holds for one of their scans, and when it was taken (ms). */
export interface Place {
  readonly scanId: string
  readonly at: number
}

/**
 * How long a place is kept at most: as long as a scan's events are (a day), which no scan is
 * queued or running for. A visitor who never comes back leaves nothing after it.
 */
export const IN_FLIGHT_TTL_MS = 24 * 60 * 60 * 1000

export interface InFlight {
  /** The places the visitor holds, the oldest first. */
  held(visitor: string): Promise<readonly Place[]>
  /** Gives places back; a scan that holds none is ignored. */
  release(visitor: string, scanIds: readonly string[]): Promise<void>
  /**
   * Holds a place for the scan, unless the visitor holds `cap` already: false then. It is one
   * step, so two requests at once cannot both take the last place. A place held for the same scan
   * again is the same place, and a place older than IN_FLIGHT_TTL_MS is forgotten first.
   */
  hold(visitor: string, scanId: string, cap: number, at: number): Promise<boolean>
}

/** In memory, for tests and local development; one process only. */
export class MemoryInFlight implements InFlight {
  readonly #places = new Map<string, Map<string, number>>()

  held(visitor: string): Promise<readonly Place[]> {
    const places = [...(this.#places.get(visitor) ?? [])].map(([scanId, at]) => ({ scanId, at }))
    return Promise.resolve(places.sort((a, b) => a.at - b.at))
  }

  release(visitor: string, scanIds: readonly string[]): Promise<void> {
    const places = this.#places.get(visitor)
    if (places === undefined) return Promise.resolve()
    for (const scanId of scanIds) places.delete(scanId)
    if (places.size === 0) this.#places.delete(visitor)
    return Promise.resolve()
  }

  hold(visitor: string, scanId: string, cap: number, at: number): Promise<boolean> {
    const places = this.#places.get(visitor) ?? new Map<string, number>()
    for (const [held, heldAt] of places) if (heldAt < at - IN_FLIGHT_TTL_MS) places.delete(held)
    if (!places.has(scanId)) {
      if (places.size >= cap) {
        if (places.size === 0) this.#places.delete(visitor)
        return Promise.resolve(false)
      }
      places.set(scanId, at)
    }
    this.#places.set(visitor, places)
    return Promise.resolve(true)
  }

  /** Visitors holding a place. */
  get size(): number {
    return this.#places.size
  }
}
