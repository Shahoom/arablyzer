import { describe } from 'vitest'
import { MemoryAccountData, MemoryAdminData, MemoryScanStore } from '../src/index'
import { adminContract } from './admin-contract'

describe('MemoryAdminData', () => {
  adminContract(() => {
    const scans = new MemoryScanStore()
    const accounts = new MemoryAccountData(scans)
    const users: Record<string, unknown>[] = []
    return {
      admin: new MemoryAdminData({
        users: () => users,
        sessions: () => [],
        scans,
        accounts,
      }),
      user: (input) => {
        users.push({ ...input })
        return Promise.resolve()
      },
      scan: async (input) => {
        await scans.create({ id: input.id, url: input.url, createdAt: input.createdAt })
        if (input.state === 'failed') await scans.fail(input.id, input.createdAt)
        if (input.userId !== undefined) {
          await accounts.link({
            userId: input.userId,
            scanId: input.id,
            url: input.url,
            source: 'manual',
            createdAt: input.createdAt,
          })
        }
      },
    }
  })
})
