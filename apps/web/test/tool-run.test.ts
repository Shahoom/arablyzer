import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRun, setRun, subscribeRun, type Run } from '../src/islands/tool-run'

// The one thing a tool page's two islands share (M2.6 R7): the box that starts a check and the
// result at the head of the text both read the run from here.
const failed: Run = { phase: 'failed', id: 'ToolToolToolToolTool_3' }
const offline: Run = { phase: 'offline', id: 'ToolToolToolToolTool_3' }

afterEach(() => {
  setRun(null)
})

describe('the run of a tool page', () => {
  it('is none before a check has started', () => {
    expect(getRun()).toBeNull()
  })

  it('tells every island that reads it when it changes, once for each change', () => {
    const box = vi.fn()
    const result = vi.fn()
    const stopBox = subscribeRun(box)
    const stopResult = subscribeRun(result)
    setRun(failed)
    expect(getRun()).toBe(failed)
    expect(box).toHaveBeenCalledTimes(1)
    expect(result).toHaveBeenCalledTimes(1)
    setRun(offline)
    expect(box).toHaveBeenCalledTimes(2)
    stopBox()
    stopResult()
  })

  it('says nothing when the run is the same one', () => {
    const listener = vi.fn()
    const stop = subscribeRun(listener)
    setRun(failed)
    setRun(failed)
    setRun((run) => run)
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })

  it('derives the next run from the one it has', () => {
    setRun(failed)
    setRun((run) => (run?.phase === 'failed' ? offline : run))
    expect(getRun()).toBe(offline)
    // A function that gives the same run back leaves it as it was.
    setRun((run) => (run?.phase === 'running' ? failed : run))
    expect(getRun()).toBe(offline)
  })

  it('stops telling an island that has gone', () => {
    const listener = vi.fn()
    const stop = subscribeRun(listener)
    stop()
    setRun(failed)
    expect(listener).not.toHaveBeenCalled()
  })
})
