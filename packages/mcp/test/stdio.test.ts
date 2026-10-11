import { describe, expect, it } from 'vitest'
import { settingsFrom } from '../src/stdio'

const KEY = `arb_${'a'.repeat(43)}`

describe('the stdio entry’s settings', () => {
  it('wants a key and the address of the Arablyzer to call', () => {
    expect(
      settingsFrom({ ARABLYZER_API_KEY: KEY, ARABLYZER_API_URL: 'https://arablyzer.example/' }),
    ).toEqual({
      apiKey: KEY,
      baseUrl: 'https://arablyzer.example',
    })
    expect(
      settingsFrom({ ARABLYZER_API_KEY: KEY, ARABLYZER_API_URL: 'http://localhost:8787' }),
    ).toMatchObject({
      baseUrl: 'http://localhost:8787',
    })
  })

  it('says what is wrong without echoing the key', () => {
    for (const env of [
      {},
      { ARABLYZER_API_URL: 'https://arablyzer.example' },
      { ARABLYZER_API_KEY: 'arb_short', ARABLYZER_API_URL: 'https://arablyzer.example' },
      { ARABLYZER_API_KEY: KEY },
      { ARABLYZER_API_KEY: KEY, ARABLYZER_API_URL: 'ftp://arablyzer.example' },
      { ARABLYZER_API_KEY: KEY, ARABLYZER_API_URL: 'not a url' },
    ]) {
      const settings = settingsFrom(env)
      expect('problem' in settings).toBe(true)
      expect(JSON.stringify(settings)).not.toContain(KEY)
    }
  })
})
