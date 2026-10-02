/**
 * How long the scanner's process lives at the least, in ms. Docker restarts a container that ends
 * by itself (compose.yaml: `restart: unless-stopped`) after a pause that starts at 100 ms and
 * doubles, up to a minute, for as long as the container has lived under ten seconds; one that
 * lived ten or more starts again at once. A scanner that ends its process after a scan that started
 * a browser would otherwise wait longer for each of those that end quickly, as a page that does not
 * load does, and the worker's wait for it (apps/worker, run.ts) is a minute in all. The uptime
 * counts from the process, a moment after the container.
 */
export const MIN_UPTIME_MS = 11_000

/** How long the answer of the scan has to leave, in ms, before the process ends without it. */
export const RETIRE_GRACE_MS = 5_000

/** What a server offers to stop with: `close` stops it taking connections, and calls back at the last. */
interface Closable {
  close(callback?: (error?: Error) => void): unknown
}

export interface RetireOptions {
  /** Ends the process: `process.exit`. */
  readonly exit: (code: number) => void
  /** How long the process has lived, in ms; the process's own clock by default. */
  readonly uptimeMs?: () => number
  /** MIN_UPTIME_MS by default. */
  readonly minUptimeMs?: number
  /** RETIRE_GRACE_MS by default. */
  readonly graceMs?: number
}

const retiring = new WeakSet<object>()

/**
 * Ends the scanner's process after a scan that started a browser (M3 of the pre-launch review),
 * so that Compose starts it again, clean: no browser, no file and no memory of a page is left in
 * it. The
 * server stops taking connections at once, and the process ends when the last one has gone, that
 * of the scan's answer (which asked for its connection to close, app.ts) being the last, and when
 * MIN_UPTIME_MS has passed. A connection that will not go is waited for a grace, and no longer.
 */
export function retireAfterAnswer(server: Closable, options: RetireOptions): void {
  if (retiring.has(server)) return
  retiring.add(server)
  const uptime = options.uptimeMs ?? (() => process.uptime() * 1000)
  const lived = after(Math.max(0, (options.minUptimeMs ?? MIN_UPTIME_MS) - uptime()))
  const closed = new Promise<void>((resolve) => {
    // An error here is a server that was not listening: there is no connection left to wait for.
    server.close(() => {
      resolve()
    })
  })
  const gone = Promise.race([closed, after(options.graceMs ?? RETIRE_GRACE_MS)])
  void Promise.all([lived, gone]).then(() => {
    options.exit(0)
  })
}

function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
