import { describe, expect, it } from 'vitest'
import { isApiKeyCreated, isApiKeysResponse, keysProblemOf } from '../src/islands/keys-model'

const key = {
  id: 'AbCdEfGhIjKlMnOpQrSt_-',
  name: 'CI',
  prefix: 'arb_abcd',
  createdAt: '2026-10-11T12:00:00.000Z',
  lastUsedAt: null,
}

describe('the API keys panel’s model', () => {
  it('trusts the list the API gives, and no other shape', () => {
    expect(isApiKeysResponse({ keys: [key], limit: 2, enabled: true })).toBe(true)
    expect(isApiKeysResponse({ keys: [], limit: 2, enabled: false })).toBe(true)
    for (const bad of [
      null,
      {},
      { keys: [{ ...key, id: 1 }], limit: 2, enabled: true },
      { keys: [], limit: '2', enabled: true },
      { keys: [], limit: 2 },
    ]) {
      expect(isApiKeysResponse(bad)).toBe(false)
    }
  })

  it('accepts a created key only with a secret of the right shape', () => {
    expect(isApiKeyCreated({ key, secret: `arb_${'a'.repeat(43)}` })).toBe(true)
    expect(isApiKeyCreated({ key, secret: 'arb_short' })).toBe(false)
    expect(isApiKeyCreated({ key })).toBe(false)
  })

  it('tells the plan’s limits apart from other refusals', () => {
    expect(keysProblemOf(403, { error: 'plan-limit', limit: 'apiKeys' })).toBe('limit')
    expect(keysProblemOf(403, { error: 'plan-limit', limit: 'api' })).toBe('closed')
    expect(keysProblemOf(400, { error: 'bad-request' })).toBe('bad-request')
    expect(keysProblemOf(401, null)).toBe('unauthorized')
    expect(keysProblemOf(404, {})).toBe('not-found')
    expect(keysProblemOf(429, {})).toBe('rate-limited')
    expect(keysProblemOf(502, '<html>')).toBe('unavailable')
  })
})
