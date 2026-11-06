import { describe } from 'vitest'
import { MemoryAiData } from '../src/index'
import { aiContract } from './ai-contract'

describe('MemoryAiData', () => {
  aiContract(() => ({
    ai: new MemoryAiData(),
    user: () => Promise.resolve(),
    reset: () => Promise.resolve(),
  }))
})
