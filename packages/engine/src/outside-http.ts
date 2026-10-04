import { safeFetch, type SafeFetchOptions } from '@arablyzer/egress'

/** One request to a service that is not the scanned site (docs/design/plans/arabic-native.md §9). */
export interface AskRequest {
  readonly url: string
  /** A JSON body makes it a POST. */
  readonly json?: unknown
  readonly headers?: Readonly<Record<string, string>>
  readonly accept?: string
  readonly maxBytes?: number
  /** Keep the first `maxBytes` of a longer body instead of failing; the caller sees it is full. */
  readonly truncate?: boolean
  readonly timeoutMs?: number
  /** Ends this request with the work that asked (a budget). */
  readonly signal?: AbortSignal
}

export interface AskResponse {
  readonly status: number
  readonly body: Uint8Array
}

/**
 * How the tools reach other services. In a scan it is `askVia`: safeFetch under the scan's egress
 * policy, as ArablyzerBot. Tests give a stand-in that answers from memory, so no provider is ever
 * called by a test. Null when there was no answer at all (a timeout, a refused connection).
 */
export type Ask = (request: AskRequest) => Promise<AskResponse | null>

export function askVia(base: SafeFetchOptions): Ask {
  return async (request) => {
    try {
      const fetched = await safeFetch(request.url, {
        ...base,
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        ...(request.maxBytes === undefined ? {} : { maxBytes: request.maxBytes }),
        ...(request.truncate === true ? { onTooLarge: 'truncate' as const } : {}),
        ...(request.accept === undefined ? {} : { accept: request.accept }),
        ...(request.json === undefined ? {} : { json: request.json }),
        ...(request.headers === undefined ? {} : { headers: request.headers }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      })
      const response = fetched.response
      return response === null ? null : { status: response.status, body: response.body }
    } catch {
      return null
    }
  }
}

export const text = (response: AskResponse): string => new TextDecoder().decode(response.body)

export function json(response: AskResponse | null): unknown {
  if (response === null) return null
  try {
    return JSON.parse(text(response))
  } catch {
    return null
  }
}

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

/** A cache of answers in this process, each kept for `ttlMs` (the process is the scanner's). */
export class TtlCache<T> {
  private readonly entries = new Map<string, { readonly at: number; readonly value: T }>()
  private readonly ttlMs: number
  private readonly max: number
  private readonly now: () => number

  constructor(ttlMs: number, max = 500, now: () => number = Date.now) {
    this.ttlMs = ttlMs
    this.max = max
    this.now = now
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    if (this.now() - entry.at > this.ttlMs) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  clear(): void {
    this.entries.clear()
  }

  set(key: string, value: T): void {
    if (this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(key, { at: this.now(), value })
  }
}

/** Runs `work` over `items`, `limit` at a time, with `gapMs` between starts; stops when aborted. */
export async function pooled<T, R>(
  items: readonly T[],
  limit: number,
  gapMs: number,
  signal: AbortSignal | undefined,
  work: (item: T) => Promise<R>,
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = Array.from({ length: items.length }, () => undefined)
  let next = 0
  const run = async () => {
    for (;;) {
      if (signal?.aborted === true) return
      const index = next++
      const item = items[index]
      if (index >= items.length || item === undefined) return
      results[index] = await work(item)
      if (gapMs > 0) await sleep(gapMs, signal)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}
