import { describe, expect, it } from 'vitest'
import type { PlatformData, ScanStore } from '../src/index'

export const NOW = new Date('2026-11-06T12:00:00.000Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

export interface Harness {
  readonly platforms: PlatformData
  readonly scans: ScanStore
}

let counter = 0
const id = (prefix: string) => `${prefix}${String(++counter)}`.padEnd(22, '_')

/** The Salla and Zid apps' data contract, run over the memory store and PostgreSQL alike. */
export function platformContract(make: () => Harness | Promise<Harness>): void {
  const tokens = (sealed: string, expiresInMinutes: number) => ({
    sealed,
    expiresAt: at(expiresInMinutes),
    at: NOW,
    refreshDueAt: at(expiresInMinutes - 10),
  })

  describe('Salla and Zid installs', () => {
    it('creates a store once and teaches it afterwards', async () => {
      const { platforms } = await make()
      const key = id('m')
      const first = await platforms.upsert({
        id: id('i'),
        platform: 'salla',
        storeKey: key,
        patch: { storeName: 'متجر' },
        at: NOW,
      })
      expect(first.created).toBe(true)
      const second = await platforms.upsert({
        id: id('i'),
        platform: 'salla',
        storeKey: key,
        patch: { storeUrl: 'https://shop.example/ar' },
        at: at(5),
      })
      expect(second.created).toBe(false)
      expect(second.install.id).toBe(first.install.id)
      expect(second.install.storeName).toBe('متجر')
      expect(second.install.storeUrl).toBe('https://shop.example/ar')
      expect(second.install.installedAt).toEqual(NOW)
      expect(second.install.updatedAt).toEqual(at(5))
      // The same key on the other platform is another store.
      const zid = await platforms.upsert({
        id: id('i'),
        platform: 'zid',
        storeKey: key,
        patch: {},
        at: NOW,
      })
      expect(zid.created).toBe(true)
      expect(zid.install.id).not.toBe(first.install.id)
    })

    it('keeps the newer tokens when an older set arrives later', async () => {
      const { platforms } = await make()
      const key = id('m')
      const base = { id: id('i'), platform: 'salla' as const, storeKey: key, at: NOW }
      await platforms.upsert({ ...base, patch: { tokens: tokens('new', 60) } })
      const replay = await platforms.upsert({ ...base, patch: { tokens: tokens('old', 30) } })
      expect(replay.install.sealedTokens).toBe('new')
      expect(replay.install.tokensExpireAt).toEqual(at(60))
      const newer = await platforms.upsert({ ...base, patch: { tokens: tokens('newest', 90) } })
      expect(newer.install.sealedTokens).toBe('newest')
    })

    it('finds a store by the hash of its panel token, and by nothing else', async () => {
      const { platforms } = await make()
      const hash = `hash-${String(++counter)}`.padEnd(64, '0')
      const made = await platforms.upsert({
        id: id('i'),
        platform: 'zid',
        storeKey: id('s'),
        patch: { embedTokenHash: hash },
        at: NOW,
      })
      expect((await platforms.byEmbedHash(hash))?.id).toBe(made.install.id)
      expect(await platforms.byEmbedHash('0'.repeat(64))).toBeNull()
    })

    it('claims a due audit once, defers it, and records it', async () => {
      const { platforms, scans } = await make()
      const made = await platforms.upsert({
        id: id('i'),
        platform: 'salla',
        storeKey: id('m'),
        patch: { storeUrl: 'https://shop.example' },
        at: NOW,
      })
      const install = made.install
      await platforms.scheduleAudit(install.id, at(10))
      // An earlier time wins over a later one.
      await platforms.scheduleAudit(install.id, at(20))
      expect(await platforms.claimAudits(at(5), 5, at(15))).toEqual([])
      const claimed = await platforms.claimAudits(at(10), 5, at(25))
      expect(claimed.map((c) => c.id)).toEqual([install.id])
      // Leased: a second scheduler gets nothing until the lease ends.
      expect(await platforms.claimAudits(at(11), 5, at(25))).toEqual([])
      await platforms.deferAudit(install.id, at(40))
      expect(await platforms.claimAudits(at(30), 5, at(50))).toEqual([])
      expect((await platforms.claimAudits(at(40), 5, at(50))).map((c) => c.id)).toEqual([
        install.id,
      ])
      const scanId = id('s')
      await scans.create({ id: scanId, url: 'https://shop.example/', createdAt: at(41) })
      await platforms.recordAudit({ installId: install.id, scanId, at: at(41) })
      expect(await platforms.claimAudits(at(100), 5, at(110))).toEqual([])
      expect((await platforms.get('salla', install.storeKey))?.lastAuditAt).toEqual(at(41))
      expect(await platforms.latestAudit(install.id)).toEqual({ scanId, at: at(41) })
    })

    it('forgets an audit whose scan was deleted', async () => {
      const { platforms, scans } = await make()
      const { install } = await platforms.upsert({
        id: id('i'),
        platform: 'salla',
        storeKey: id('m'),
        patch: {},
        at: NOW,
      })
      const scanId = id('s')
      await scans.create({ id: scanId, url: 'https://shop.example/', createdAt: NOW })
      await platforms.recordAudit({ installId: install.id, scanId, at: NOW })
      await scans.deleteOlderThan(at(1))
      expect(await platforms.latestAudit(install.id)).toBeNull()
    })

    it('claims a refresh once, and drops tokens the platform refused', async () => {
      const { platforms } = await make()
      const { install } = await platforms.upsert({
        id: id('i'),
        platform: 'zid',
        storeKey: id('s'),
        patch: { tokens: tokens('sealed', 60) },
        at: NOW,
      })
      expect(await platforms.claimRefreshes(at(40), 5, at(45))).toEqual([])
      const claimed = await platforms.claimRefreshes(at(50), 5, at(55))
      expect(claimed.map((c) => c.id)).toContain(install.id)
      expect((await platforms.claimRefreshes(at(51), 5, at(55))).map((c) => c.id)).not.toContain(
        install.id,
      )
      await platforms.dropTokens(install.id)
      const dropped = await platforms.get('zid', install.storeKey)
      expect(dropped?.sealedTokens).toBeNull()
      expect(dropped?.status).toBe('reauth')
      // New tokens bring the store back, even older than the ones that were dropped.
      const back = await platforms.upsert({
        id: id('i'),
        platform: 'zid',
        storeKey: install.storeKey,
        patch: { tokens: tokens('fresh', 20) },
        at: at(60),
      })
      expect(back.install.sealedTokens).toBe('fresh')
      expect(back.install.status).toBe('active')
    })

    it('erases a store with its tokens and its audits’ scans, and no other store’s', async () => {
      const { platforms, scans } = await make()
      const mine = await platforms.upsert({
        id: id('i'),
        platform: 'salla',
        storeKey: id('m'),
        patch: { tokens: tokens('secret', 60), embedTokenHash: 'e'.repeat(64) },
        at: NOW,
      })
      const other = await platforms.upsert({
        id: id('i'),
        platform: 'salla',
        storeKey: id('m'),
        patch: {},
        at: NOW,
      })
      const [mineScan, otherScan] = [id('s'), id('s')]
      for (const scanId of [mineScan, otherScan]) {
        await scans.create({ id: scanId, url: 'https://shop.example/', createdAt: NOW })
      }
      await platforms.recordAudit({ installId: mine.install.id, scanId: mineScan, at: NOW })
      await platforms.recordAudit({ installId: other.install.id, scanId: otherScan, at: NOW })

      expect(await platforms.erase('salla', mine.install.storeKey)).toBe(true)
      expect(await platforms.get('salla', mine.install.storeKey)).toBeNull()
      expect(await platforms.byEmbedHash('e'.repeat(64))).toBeNull()
      expect(await scans.get(mineScan)).toBeNull()
      expect(await scans.get(otherScan)).not.toBeNull()
      expect(await platforms.get('salla', other.install.storeKey)).not.toBeNull()
      expect(await platforms.erase('salla', mine.install.storeKey)).toBe(false)
    })
  })
}
