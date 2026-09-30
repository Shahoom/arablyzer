import type { Report } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { MemoryInFlight, MemoryScanEvents, MemoryScanStore } from '../src/index'

const NOW = new Date('2026-09-28T12:00:00.000Z')
const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000)

describe('MemoryScanStore', () => {
  it('moves a scan one way only, as PostgreSQL does', async () => {
    const store = new MemoryScanStore()
    const report = { scan: { status: 'partial' } } as unknown as Report
    await store.create({ id: 'a', url: 'https://example.com/', createdAt: NOW })
    expect(await store.finish('a', report, NOW)).toBe(false)
    expect(await store.start('a', NOW)).toBe(true)
    expect(await store.start('a', NOW)).toBe(false)
    expect(await store.finish('a', report, NOW)).toBe(true)
    expect(await store.fail('a', NOW)).toBe(false)
    expect(await store.get('a')).toMatchObject({ state: 'partial', report, tool: null })
    expect(await store.start('unknown', NOW)).toBe(false)
  })

  it("keeps the tool a tool page's scan ran", async () => {
    const store = new MemoryScanStore()
    await store.create({ id: 't', url: 'https://example.com/', createdAt: NOW, tool: 'rtl-check' })
    expect((await store.get('t'))?.tool).toBe('rtl-check')
  })

  it('fails the scans left running since before a time', async () => {
    const store = new MemoryScanStore()
    for (const id of ['old', 'recent', 'queued']) {
      await store.create({ id, url: 'https://example.com/', createdAt: NOW })
    }
    await store.start('old', minutes(-20))
    await store.start('recent', NOW)
    expect(await store.failStale(minutes(-10), NOW)).toEqual(['old'])
    expect((await store.get('old'))?.state).toBe('failed')
    expect((await store.get('recent'))?.state).toBe('running')
    expect((await store.get('queued'))?.state).toBe('queued')
  })
})

describe('MemoryScanStore.states', () => {
  it('says where each scan it has is, and knows none it has not', async () => {
    const store = new MemoryScanStore()
    for (const id of ['a', 'b', 'c']) {
      await store.create({ id, url: 'https://example.com/', createdAt: NOW })
    }
    await store.start('b', NOW)
    await store.fail('c', NOW)
    expect(await store.states(['a', 'b', 'c', 'unknown'])).toEqual(
      new Map([
        ['a', 'queued'],
        ['b', 'running'],
        ['c', 'failed'],
      ]),
    )
    expect(await store.states([])).toEqual(new Map())
  })
})

describe('MemoryInFlight', () => {
  const at = NOW.getTime()

  it('holds a visitor to their cap, and gives places back', async () => {
    const places = new MemoryInFlight()
    expect(await places.hold('v', 'one', 2, at)).toBe(true)
    expect(await places.hold('v', 'two', 2, at + 1)).toBe(true)
    expect(await places.hold('v', 'three', 2, at + 2)).toBe(false)
    expect(await places.held('v')).toEqual([
      { scanId: 'one', at },
      { scanId: 'two', at: at + 1 },
    ])
    await places.release('v', ['one', 'never-held'])
    expect(await places.hold('v', 'three', 2, at + 3)).toBe(true)
    expect((await places.held('v')).map((place) => place.scanId)).toEqual(['two', 'three'])
  })

  it('keeps visitors apart, and counts one scan once', async () => {
    const places = new MemoryInFlight()
    expect(await places.hold('a', 'one', 1, at)).toBe(true)
    expect(await places.hold('a', 'one', 1, at)).toBe(true)
    expect(await places.hold('a', 'two', 1, at)).toBe(false)
    expect(await places.hold('b', 'two', 1, at)).toBe(true)
    expect(await places.held('nobody')).toEqual([])
  })

  it('forgets a place held longer than a scan can take, and a visitor with none', async () => {
    const places = new MemoryInFlight()
    const day = 24 * 60 * 60 * 1000
    expect(await places.hold('v', 'old', 1, at)).toBe(true)
    expect(await places.hold('v', 'new', 1, at + 1000)).toBe(false)
    expect(await places.hold('v', 'new', 1, at + day + 1)).toBe(true)
    await places.release('v', ['new'])
    expect(places.size).toBe(0)
  })
})

describe('MemoryScanEvents', () => {
  it('reads the events there are without waiting, after any of them', async () => {
    const events = new MemoryScanEvents()
    await events.publish('a', { type: 'queued', ahead: 0 })
    await events.publish('a', { type: 'error' })
    expect(await events.since('a', null)).toHaveLength(2)
    expect(await events.since('a', '1')).toEqual([{ id: '2', event: { type: 'error' } }])
    expect(await events.since('a', '2')).toEqual([])
    expect(await events.since('a', 'nonsense')).toHaveLength(2)
    expect(await events.since('b', null)).toEqual([])
  })
})
