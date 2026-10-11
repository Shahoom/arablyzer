import { describe, expect, it } from 'vitest'
import { KEY_TOUCH_MS, type ApiKeyData, type NewApiKey } from '../src/index'

export const NOW = new Date('2026-10-11T12:00:00.000Z')

export interface Harness {
  readonly keys: ApiKeyData
  /** Makes the person exist (PostgreSQL needs the row) and empties the keys. */
  user(id: string): Promise<void>
}

let counter = 0
const id = (prefix: string) => `${prefix}${String(++counter)}`.padEnd(22, '_')

/** The API key contract, run over the memory store and PostgreSQL alike. */
export function apiKeyContract(make: () => Harness | Promise<Harness>): void {
  const key = (userId: string, overrides: Partial<NewApiKey> = {}): NewApiKey => ({
    id: id('k'),
    userId,
    name: 'CI',
    prefix: 'arb_abcd',
    hash: `hash-${String(++counter)}`.padEnd(64, '0'),
    createdAt: NOW,
    ...overrides,
  })

  describe('API keys', () => {
    it('makes keys up to the limit, even when the requests arrive together', async () => {
      const h = await make()
      const userId = id('u')
      await h.user(userId)
      const made = await Promise.all(Array.from({ length: 5 }, () => h.keys.create(key(userId), 2)))
      expect(made.filter((result) => result.kind === 'created')).toHaveLength(2)
      expect(made.filter((result) => result.kind === 'limit')).toHaveLength(3)
      expect(await h.keys.list(userId)).toHaveLength(2)
    })

    it('finds a key by its hash alone, and nobody else’s', async () => {
      const h = await make()
      const [a, b] = [id('u'), id('u')]
      await h.user(a)
      await h.user(b)
      const mine = key(a)
      await h.keys.create(mine, 2)
      await h.keys.create(key(b), 2)
      expect(await h.keys.authenticate(mine.hash)).toEqual({ keyId: mine.id, userId: a })
      expect(await h.keys.authenticate('0'.repeat(64))).toBeNull()
      expect(await h.keys.authenticate(mine.id)).toBeNull()
      expect((await h.keys.list(a)).map((k) => k.id)).toEqual([mine.id])
    })

    it('keeps no secret and no hash in what it lists', async () => {
      const h = await make()
      const userId = id('u')
      await h.user(userId)
      const made = key(userId)
      const created = await h.keys.create(made, 2)
      expect(JSON.stringify(created)).not.toContain(made.hash)
      expect(JSON.stringify(await h.keys.list(userId))).not.toContain(made.hash)
    })

    it('revokes a key for its owner alone, and a revoked key opens nothing', async () => {
      const h = await make()
      const [a, b] = [id('u'), id('u')]
      await h.user(a)
      await h.user(b)
      const mine = key(a)
      await h.keys.create(mine, 2)
      expect(await h.keys.revoke(b, mine.id)).toBe(false)
      expect(await h.keys.authenticate(mine.hash)).not.toBeNull()
      expect(await h.keys.revoke(a, mine.id)).toBe(true)
      expect(await h.keys.revoke(a, mine.id)).toBe(false)
      expect(await h.keys.authenticate(mine.hash)).toBeNull()
      // A revoked key frees its place.
      expect((await h.keys.create(key(a), 1)).kind).toBe('created')
    })

    it('notes a use at most once an hour', async () => {
      const h = await make()
      const userId = id('u')
      await h.user(userId)
      const made = key(userId)
      await h.keys.create(made, 2)
      const seen = async () => (await h.keys.list(userId))[0]?.lastUsedAt?.getTime() ?? null
      expect(await seen()).toBeNull()
      await h.keys.touch(made.id, NOW)
      expect(await seen()).toBe(NOW.getTime())
      await h.keys.touch(made.id, new Date(NOW.getTime() + KEY_TOUCH_MS / 2))
      expect(await seen()).toBe(NOW.getTime())
      const later = new Date(NOW.getTime() + KEY_TOUCH_MS)
      await h.keys.touch(made.id, later)
      expect(await seen()).toBe(later.getTime())
    })

    it('erases a person’s keys with them and leaves the others', async () => {
      const h = await make()
      const [a, b] = [id('u'), id('u')]
      await h.user(a)
      await h.user(b)
      const gone = key(a)
      const kept = key(b)
      await h.keys.create(gone, 2)
      await h.keys.create(kept, 2)
      await h.keys.eraseUser(a)
      expect(await h.keys.list(a)).toEqual([])
      expect(await h.keys.authenticate(gone.hash)).toBeNull()
      expect(await h.keys.authenticate(kept.hash)).not.toBeNull()
    })
  })
}
