/**
 * A service's errors, told at most once every `everyMs`: while Valkey or PostgreSQL is down,
 * their clients retry and fail many times a second, and the log needs one line, not thousands.
 */
export function quietly(
  name: string,
  log: (message: string) => void = console.error,
  everyMs = 30_000,
): (error: Error) => void {
  let last = Number.NEGATIVE_INFINITY
  return (error) => {
    const now = Date.now()
    if (now - last < everyMs) return
    last = now
    log(`${name}: ${error.message}`)
  }
}
