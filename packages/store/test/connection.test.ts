import { randomBytes } from 'node:crypto'
import { Redis } from 'ioredis'
import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { connectionUrl, POSTGRES_PROTOCOLS, productionUrl, VALKEY_PROTOCOLS } from '../src/index'

const HEX = randomBytes(32).toString('hex')

/** What a call throws, as its whole text: the message, and every property a log would print. */
function shown(call: () => unknown): string {
  try {
    call()
  } catch (error) {
    return error instanceof Error
      ? `${error.name}: ${error.message} ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`
      : String(error)
  }
  return ''
}

describe('connectionUrl', () => {
  const options = { protocols: VALKEY_PROTOCOLS }

  it('gives back a URL that has the form, trimmed', () => {
    expect(connectionUrl('VALKEY_URL', ` redis://:${HEX}@valkey:6379\n`, options)).toBe(
      `redis://:${HEX}@valkey:6379`,
    )
    expect(connectionUrl('VALKEY_URL', 'rediss://valkey.example:6380/2', options)).toBe(
      'rediss://valkey.example:6380/2',
    )
    expect(
      connectionUrl('DATABASE_URL', 'postgresql://u:p@db/x', { protocols: POSTGRES_PROTOCOLS }),
    ).toBe('postgresql://u:p@db/x')
  })

  it('refuses one that is not set', () => {
    expect(() => connectionUrl('VALKEY_URL', undefined, options)).toThrow('VALKEY_URL must be set')
    expect(() => connectionUrl('VALKEY_URL', '  ', options)).toThrow('VALKEY_URL must be set')
  })

  // `openssl rand -base64` makes a password with a `/` in it in one of three; ioredis then
  // throws an error whose `input` is the URL, and Node prints it when nothing catches it.
  it('says a URL it cannot read by its name, and never prints its text', () => {
    const password = `${HEX.slice(0, 20)}/${HEX.slice(20)}`
    const url = `redis://:${password}@valkey:6379`
    const own = shown(() => connectionUrl('VALKEY_URL', url, options))
    expect(own).toMatch(
      /^Error: VALKEY_URL is not a URL of the form redis: or rediss:\/\/user:password@host:port/,
    )
    expect(own).not.toContain(HEX.slice(0, 20))
    expect(own).not.toContain(HEX.slice(20))
    // The clients' own errors, for the same URL, hold it.
    expect(shown(() => new Redis(url, { lazyConnect: true }))).toContain(HEX.slice(0, 20))
  })

  it('refuses a URL of another scheme, or with no host, without echoing it', () => {
    const http = shown(() => connectionUrl('VALKEY_URL', `http://:${HEX}@valkey`, options))
    expect(http).toContain('VALKEY_URL must be a URL of the form')
    expect(http).not.toContain(HEX)
    expect(() => connectionUrl('VALKEY_URL', `redis://:${HEX}@:6379`, options)).toThrow(
      /no host|not a URL/,
    )
    expect(() => connectionUrl('VALKEY_URL', 'valkey:6379', options)).toThrow(/VALKEY_URL/)
  })

  it('leaves the password alone unless a minimum is asked for', () => {
    expect(connectionUrl('VALKEY_URL', 'redis://valkey:6379', options)).toBe('redis://valkey:6379')
    expect(connectionUrl('VALKEY_URL', 'redis://:short@valkey', options)).toBe(
      'redis://:short@valkey',
    )
  })

  it('refuses a password shorter than the minimum, or none, and never says what it was', () => {
    const limited = { ...options, passwordMinimum: 32 }
    const short = shown(() =>
      connectionUrl('VALKEY_URL', 'redis://:sixteen-chars-ab@valkey', limited),
    )
    expect(short).toContain("VALKEY_URL's password must be 32 characters or more")
    expect(short).not.toContain('sixteen-chars-ab')
    expect(() => connectionUrl('VALKEY_URL', 'redis://valkey:6379', limited)).toThrow(
      /VALKEY_URL has no password/,
    )
    expect(() => connectionUrl('VALKEY_URL', `redis://:${HEX}@valkey`, limited)).not.toThrow()
  })

  it('counts a percent-encoded password by its characters, and refuses an escape that is not one', () => {
    const limited = { ...options, passwordMinimum: 32 }
    // Thirty-two characters written as ninety-six: the URL's, not the password's, length.
    const encoded = 'a/b+'.repeat(8)
    expect(() =>
      connectionUrl('VALKEY_URL', `redis://:${encodeURIComponent(encoded)}@valkey`, limited),
    ).not.toThrow()
    expect(() =>
      connectionUrl(
        'VALKEY_URL',
        `redis://:${encodeURIComponent(encoded.slice(1))}@valkey`,
        limited,
      ),
    ).toThrow(/32 characters or more/)
    const bad = shown(() => connectionUrl('VALKEY_URL', `redis://:${HEX}%zz@valkey`, limited))
    expect(bad).toContain('percent-escape')
    expect(bad).not.toContain(HEX)
  })
})

describe('productionUrl', () => {
  it('asks for a password of 32 characters at least', () => {
    expect(
      productionUrl(
        'DATABASE_URL',
        `postgres://arablyzer_app:${HEX}@postgres/arablyzer`,
        POSTGRES_PROTOCOLS,
      ),
    ).toContain('arablyzer_app')
    expect(() =>
      productionUrl('DATABASE_URL', 'postgres://a:b@postgres/arablyzer', POSTGRES_PROTOCOLS),
    ).toThrow(/DATABASE_URL's password must be 32 characters or more/)
  })

  it('gives clients a URL they read as the password it holds, whatever a hex secret is', () => {
    const url = productionUrl(
      'DATABASE_URL',
      `postgres://arablyzer_app:${HEX}@postgres:5432/arablyzer`,
      POSTGRES_PROTOCOLS,
    )
    // What pg made of the URL: its client keeps it, though its types do not say so.
    const client = new pg.Client({ connectionString: url }) as unknown as {
      connectionParameters: { user: string; password: string; host: string; port: number }
    }
    const { user, password, host, port } = client.connectionParameters
    expect([user, password, host, port]).toEqual(['arablyzer_app', HEX, 'postgres', 5432])
    const redis = new Redis(
      productionUrl('VALKEY_URL', `redis://arablyzer:${HEX}@valkey:6379`, VALKEY_PROTOCOLS),
      {
        lazyConnect: true,
      },
    )
    expect([redis.options.username, redis.options.password, redis.options.host]).toEqual([
      'arablyzer',
      HEX,
      'valkey',
    ])
    redis.disconnect()
  })
})
