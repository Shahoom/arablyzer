import { describe, expect, it } from 'vitest'
import { MIN_SECRET_LENGTH, requireSecret } from '../src/index'

describe('requireSecret', () => {
  it('gives the secret trimmed when it has the length', () => {
    const secret = 'ab12'.repeat(8)
    expect(secret).toHaveLength(MIN_SECRET_LENGTH)
    expect(requireSecret('ARABLYZER_SCANNER_TOKEN', `  ${secret}\n`)).toBe(secret)
  })

  it('refuses one that is not set, or is blank', () => {
    expect(() => requireSecret('VALKEY_PASSWORD', undefined)).toThrow('VALKEY_PASSWORD must be set')
    expect(() => requireSecret('VALKEY_PASSWORD', '  ')).toThrow('VALKEY_PASSWORD must be set')
  })

  it('refuses one that is short, by the variable and the length, never the value', () => {
    const short = 'ab12'.repeat(7) + 'abc'
    expect(short).toHaveLength(MIN_SECRET_LENGTH - 1)
    let message = ''
    try {
      requireSecret('POSTGRES_PASSWORD', short)
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }
    expect(message).toBe(
      'POSTGRES_PASSWORD must be 32 characters or more (openssl rand -hex 32 makes one)',
    )
    expect(message).not.toContain(short)
  })

  it('counts a shorter minimum where the caller has one', () => {
    expect(requireSecret('X', 'abcd', 4)).toBe('abcd')
    expect(() => requireSecret('X', 'abc', 4)).toThrow(/4 characters/)
  })
})
