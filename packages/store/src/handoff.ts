/**
 * Short-lived values a visitor's browser comes back for once: the Search Console connection's PKCE
 * verifier, between the redirect to Google and the redirect back, and its result, between that
 * and the report page's read. Each is read once and gone, and expires on its own: nothing of it
 * is ever kept (and Valkey keeps nothing across a restart: infra/compose.yaml).
 */
export interface Handoff {
  /** Keeps `value` under `key` for `ttlSeconds`; an existing value is replaced. */
  put(key: string, value: string, ttlSeconds: number): Promise<void>
  /** The value, which is deleted by the read: null when there is none, or it has expired. */
  take(key: string): Promise<string | null>
}

/** In memory, for tests and local development; one process only. */
export class MemoryHandoff implements Handoff {
  readonly #values = new Map<string, { readonly value: string; readonly expires: number }>()
  readonly #now: () => number

  constructor(now: () => number = Date.now) {
    this.#now = now
  }

  put(key: string, value: string, ttlSeconds: number): Promise<void> {
    const now = this.#now()
    for (const [other, held] of this.#values) if (held.expires <= now) this.#values.delete(other)
    this.#values.set(key, { value, expires: now + ttlSeconds * 1000 })
    return Promise.resolve()
  }

  take(key: string): Promise<string | null> {
    const held = this.#values.get(key)
    this.#values.delete(key)
    return Promise.resolve(held === undefined || held.expires <= this.#now() ? null : held.value)
  }

  get size(): number {
    return this.#values.size
  }
}
