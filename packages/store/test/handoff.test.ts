import { describe, expect, it } from 'vitest'
import { MemoryHandoff } from '../src/index'

describe('MemoryHandoff', () => {
  it('gives a value once, and then it is gone', async () => {
    const handoff = new MemoryHandoff()
    await handoff.put('a', 'one', 60)
    expect(await handoff.take('a')).toBe('one')
    expect(await handoff.take('a')).toBeNull()
    expect(handoff.size).toBe(0)
  })

  it('forgets a value after its time, and keys do not share', async () => {
    let now = 1_000
    const handoff = new MemoryHandoff(() => now)
    await handoff.put('a', 'one', 300)
    await handoff.put('b', 'two', 300)
    now += 299_000
    expect(await handoff.take('a')).toBe('one')
    now += 2_000
    expect(await handoff.take('b')).toBeNull()
  })

  it('drops the expired when another is put, so nothing piles up', async () => {
    let now = 0
    const handoff = new MemoryHandoff(() => now)
    await handoff.put('a', '1', 10)
    now += 11_000
    await handoff.put('b', '2', 10)
    expect(handoff.size).toBe(1)
  })
})
