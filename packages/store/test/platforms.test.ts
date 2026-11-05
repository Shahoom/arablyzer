import { describe } from 'vitest'
import { MemoryPlatformData, MemoryScanStore } from '../src/index'
import { platformContract } from './platform-contract'

describe('MemoryPlatformData', () => {
  platformContract(() => {
    const scans = new MemoryScanStore()
    return { platforms: new MemoryPlatformData(scans), scans }
  })
})
