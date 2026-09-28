import type { Report } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { MemoryScanEvents, MemoryScanStore } from '../src/index'

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
    expect(await store.get('a')).toMatchObject({ state: 'partial', report })
    expect(await store.start('unknown', NOW)).toBe(false)
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
