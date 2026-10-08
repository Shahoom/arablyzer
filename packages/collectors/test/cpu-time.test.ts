import { describe, expect, it } from 'vitest'
import { cpuTimed } from './helpers'

// The sitemap and forms tests bound CPU time instead of the clock's: those bounds hold for any
// code if CPU time reads as nothing, and fail on a busy machine if it reads as the clock does.
describe('cpuTimed', () => {
  it('counts the CPU time of work, and returns what the work returns', () => {
    const { result, ms } = cpuTimed(() => {
      let sum = 0
      for (let index = 0; index < 20_000_000; index++) sum += index % 7
      return sum
    })
    expect(result).toBeGreaterThan(0)
    expect(ms).toBeGreaterThan(0)
  })

  it('does not count the time a thread waits, as it does when the machine is busy', () => {
    const { ms } = cpuTimed(() => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250))
    expect(ms).toBeLessThan(125)
  })
})
