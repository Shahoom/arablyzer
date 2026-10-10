import type { Report } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { MemoryAccountData, MemoryScanStore } from '../src/index'

const NOW = new Date('2026-10-09T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const AGO = (days: number) => new Date(NOW.getTime() - days * DAY)
const URL1 = 'https://example.com/'

function setup() {
  const scans = new MemoryScanStore()
  return { scans, data: new MemoryAccountData(scans) }
}

describe('MemoryAccountData', () => {
  it('holds a person to the limit, saves a URL once, and keeps people apart', async () => {
    const { data } = setup()
    const add = (user: string, n: number) =>
      data.addSite(user, { id: `s${n}`, url: `https://e.com/${n}`, createdAt: NOW }, 2)
    expect((await add('a', 1)).kind).toBe('added')
    expect((await add('a', 2)).kind).toBe('added')
    expect((await add('a', 3)).kind).toBe('limit')
    expect((await add('a', 1)).kind).toBe('existing')
    expect((await add('b', 3)).kind).toBe('added')
    expect(await data.site('b', 's1')).toBeNull()
    expect(await data.removeSite('b', 's1')).toBe(false)
  })

  it('lists the history newest first with the site found by URL, and keeps it past the site', async () => {
    const { data, scans } = setup()
    await data.addSite('a', { id: 's1', url: URL1, createdAt: NOW }, 2)
    for (const [id, at] of [
      ['one', AGO(2)],
      ['two', AGO(1)],
    ] as const) {
      await scans.create({ id, url: URL1, createdAt: at })
      await data.link({ userId: 'a', scanId: id, url: URL1, source: 'manual', createdAt: at })
    }
    expect((await data.history('a', 10)).map((h) => [h.scanId, h.siteId])).toEqual([
      ['two', 's1'],
      ['one', 's1'],
    ])
    expect((await data.latestPerSite('a')).get('s1')?.scanId).toBe('two')
    expect(await data.history('a', 1)).toHaveLength(1)
    await data.removeSite('a', 's1')
    expect((await data.history('a', 10)).map((h) => h.siteId)).toEqual([null, null])
  })

  it('leaves the scans an account keeps to the linked sweep, and erases them with the person', async () => {
    const { data, scans } = setup()
    await scans.create({ id: 'anon', url: URL1, createdAt: AGO(40) })
    await scans.create({ id: 'kept', url: URL1, createdAt: AGO(40) })
    await data.link({
      userId: 'a',
      scanId: 'kept',
      url: URL1,
      source: 'manual',
      createdAt: AGO(40),
    })
    expect(await scans.deleteOlderThan(AGO(30))).toBe(1)
    expect(await scans.get('anon')).toBeNull()
    expect(await scans.get('kept')).not.toBeNull()
    expect(await scans.deleteOlderThan(AGO(30))).toBe(0)
    await data.eraseUser('a')
    expect(await scans.get('kept')).toBeNull()
    expect(await data.history('a', 10)).toEqual([])
  })

  it('has the linked sweep delete only what an account keeps', async () => {
    const { data, scans } = setup()
    await scans.create({ id: 'anon', url: URL1, createdAt: AGO(40) })
    await scans.create({ id: 'kept', url: URL1, createdAt: AGO(40) })
    await data.link({
      userId: 'a',
      scanId: 'kept',
      url: URL1,
      source: 'manual',
      createdAt: AGO(40),
    })
    expect(await scans.deleteOlderThan(AGO(30), 'linked')).toBe(1)
    expect(await scans.get('anon')).not.toBeNull()
    expect(await scans.get('kept')).toBeNull()
  })

  it("tells which scans a person keeps, and lists a site's whole-page scans oldest first inside the window", async () => {
    const { data, scans } = setup()
    await data.addSite('a', { id: 's1', url: URL1, createdAt: NOW }, 2)
    const report = (overall: number, categories: Report['score']['categories']) =>
      ({
        scan: { status: 'complete' },
        score: { overall, categories },
        findings: [
          { severity: 'critical', fingerprint: 'aaaaaaaaaaaaaaaa' },
          { severity: 'minor', fingerprint: 'bbbbbbbbbbbbbbbb' },
        ],
      }) as unknown as Report
    for (const [id, days, source, score] of [
      ['old', 40, 'manual', 50],
      ['one', 3, 'monitor', 70],
      ['two', 1, 'manual', 80],
    ] as const) {
      await scans.create({ id, url: URL1, createdAt: AGO(days) })
      await scans.start(id, AGO(days))
      await scans.finish(id, report(score, { speed: score - 10 }), AGO(days))
      await data.link({ userId: 'a', scanId: id, url: URL1, source, createdAt: AGO(days) })
    }
    await scans.create({ id: 'tool', url: URL1, createdAt: AGO(2), tool: 'hreflang' })
    await data.link({ userId: 'a', scanId: 'tool', url: URL1, source: 'manual', createdAt: AGO(2) })
    await scans.create({ id: 'other', url: URL1, createdAt: AGO(2) })
    await data.link({
      userId: 'b',
      scanId: 'other',
      url: URL1,
      source: 'manual',
      createdAt: AGO(2),
    })

    const points = await data.scorePoints('a', 's1', AGO(30), 10)
    expect(points.map((p) => [p.scanId, p.source, p.score])).toEqual([
      ['one', 'monitor', 70],
      ['two', 'manual', 80],
    ])
    expect(points[0]).toMatchObject({ categories: { speed: 60 }, criticals: ['aaaaaaaaaaaaaaaa'] })
    expect((await data.scorePoints('a', 's1', AGO(30), 1)).map((p) => p.scanId)).toEqual(['two'])
    expect(await data.scorePoints('b', 's1', AGO(30), 10)).toEqual([])

    const kept = await data.linkedScans('a', ['one', 'other', 'nope'])
    expect([...kept.keys()]).toEqual(['one'])
    expect(kept.get('one')).toEqual({ siteId: 's1', source: 'monitor' })
  })
})
