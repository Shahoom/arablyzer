import { describe } from 'vitest'
import { MemoryAccountData, MemoryMonitorData, MemoryScanStore } from '../src/index'
import { monitorContract } from './monitor-contract'

describe('MemoryMonitorData', () => {
  monitorContract(() => {
    const scans = new MemoryScanStore()
    const accounts = new MemoryAccountData(scans)
    return {
      monitors: new MemoryMonitorData(accounts, scans),
      accounts,
      scans,
      user: () => Promise.resolve(),
    }
  })
})
