import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  clientAddress,
  connectionKey,
  limitSubject,
  trustProxyFrom,
  type TrustProxy,
} from '../src/client'

async function addressFor(trust: TrustProxy, headers: Record<string, string>) {
  const app = new Hono()
  app.get('/', (c) => c.text(clientAddress(c, trust) ?? 'none'))
  const response = await app.request('/', { headers })
  return response.text()
}

describe('clientAddress', () => {
  it("reads Cloudflare's header only when Cloudflare is trusted", async () => {
    expect(await addressFor('cloudflare', { 'cf-connecting-ip': '203.0.113.7' })).toBe(
      '203.0.113.7',
    )
    expect(await addressFor('cloudflare', { 'cf-connecting-ip': 'not an address' })).toBe('none')
    expect(await addressFor('cloudflare', {})).toBe('none')
  })

  it('takes the last forwarded address, the one the proxy in front appended', async () => {
    expect(await addressFor('proxy', { 'x-forwarded-for': '198.51.100.1, 203.0.113.8' })).toBe(
      '203.0.113.8',
    )
  })

  it('reads the setting, and refuses one it does not know', () => {
    expect(trustProxyFrom(undefined)).toBe('none')
    expect(trustProxyFrom(' cloudflare ')).toBe('cloudflare')
    expect(() => trustProxyFrom('everyone')).toThrow(/none, cloudflare or proxy/)
  })
})

describe('connectionKey', () => {
  it('is not the address, and changes with the day and the secret', () => {
    const day = new Date('2026-09-28T23:59:59Z')
    const key = connectionKey('203.0.113.9', 'secret', day)
    expect(key).toHaveLength(32)
    expect(key).not.toContain('203')
    expect(connectionKey('203.0.113.9', 'secret', new Date('2026-09-28T00:00:00Z'))).toBe(key)
    expect(connectionKey('203.0.113.9', 'secret', new Date('2026-09-29T00:00:00Z'))).not.toBe(key)
    expect(connectionKey('203.0.113.9', 'other', day)).not.toBe(key)
    expect(connectionKey('203.0.113.10', 'secret', day)).not.toBe(key)
  })
})

describe('limitSubject', () => {
  it('counts an IPv6 visitor by their /64, and one address by one name', () => {
    expect(limitSubject('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64')
    expect(limitSubject('2001:db8:1:2:ffff::9')).toBe('2001:db8:1:2::/64')
    expect(limitSubject('2001:DB8:1:3::1')).toBe('2001:db8:1:3::/64')
    expect(limitSubject('::ffff:203.0.113.9')).toBe('203.0.113.9')
    expect(limitSubject('203.0.113.9')).toBe('203.0.113.9')
  })

  it('gives one key to the addresses of one /64, and to two spellings of one address', () => {
    const day = new Date('2026-09-28T12:00:00Z')
    const key = (address: string) => connectionKey(address, 'secret', day)
    expect(key('2001:db8:1:2::a')).toBe(key('2001:db8:1:2:ffff:ffff:ffff:ffff'))
    expect(key('2001:db8:1:2::a')).not.toBe(key('2001:db8:1:3::a'))
    expect(key('::ffff:203.0.113.9')).toBe(key('203.0.113.9'))
  })
})
