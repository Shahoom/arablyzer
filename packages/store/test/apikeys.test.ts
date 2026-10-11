import { describe } from 'vitest'
import { MemoryApiKeyData } from '../src/index'
import { apiKeyContract } from './apikey-contract'

describe('MemoryApiKeyData', () => {
  apiKeyContract(() => ({ keys: new MemoryApiKeyData(), user: () => Promise.resolve() }))
})
