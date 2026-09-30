/** A time limit and what ends the work sooner. */
export interface Budget {
  /** Aborts when the time runs out, or when any of the signals it was given does. */
  readonly signal: AbortSignal
  /** Clears the timer: called when the work ends before the time does. */
  readonly stop: () => void
}

/**
 * A time limit of `ms`, joined to the signals that end the work sooner (a scan cancelled). Its
 * timer is a setTimeout, not AbortSignal.timeout, so a test that fakes the clock drives it with
 * the constant the code uses, and the timer is cleared when the work ends.
 */
export function budget(ms: number, ...others: readonly (AbortSignal | undefined)[]): Budget {
  const limit = new AbortController()
  const timer = setTimeout(() => {
    limit.abort(new DOMException(`The time limit of ${String(ms)} ms ran out`, 'TimeoutError'))
  }, ms)
  // A limit alone never keeps the process alive.
  if (typeof timer === 'object' && 'unref' in timer) timer.unref()
  return {
    signal: AbortSignal.any([
      limit.signal,
      ...others.filter((signal): signal is AbortSignal => signal !== undefined),
    ]),
    stop: () => {
      clearTimeout(timer)
    },
  }
}
