import type { Report } from '@arablyzer/report-schema'
import { useEffect, useState } from 'preact/hooks'
import type { Progress } from './report-model'

/**
 * Where a tool's check stands. The box that starts it (ToolApp, in the aside of a tool page) and
 * the result it leads to (ToolResult, at the head of the main column) are two islands of one page:
 * they cannot share a parent, since the aside sticks beside the text on a wide screen and the
 * result is read in the text. This module is the one thing they share: both islands of a page
 * import it, so the bundler gives them the same copy of `current`.
 */
export type Run =
  | { readonly phase: 'running'; readonly id: string; readonly progress: Progress }
  | { readonly phase: 'done'; readonly id: string; readonly report: Report }
  | { readonly phase: 'failed'; readonly id: string | null }
  | { readonly phase: 'offline'; readonly id: string }

let current: Run | null = null
const listeners = new Set<() => void>()

/** Replaces the run, or derives the next from the current one, and tells every island that reads it. */
export function setRun(next: Run | null | ((run: Run | null) => Run | null)): void {
  const value = typeof next === 'function' ? next(current) : next
  if (value === current) return
  current = value
  for (const listener of listeners) listener()
}

/** The run now: null before a check has started. */
export function getRun(): Run | null {
  return current
}

/** Calls `listener` each time the run changes; the function it returns stops it. */
export function subscribeRun(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The run now, and again each time it changes. */
export function useRun(): Run | null {
  const [run, setLocal] = useState(current)
  useEffect(() => {
    // The other island may have started a check before this one hydrated.
    setLocal(getRun())
    return subscribeRun(() => {
      setLocal(getRun())
    })
  }, [])
  return run
}
