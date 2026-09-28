import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { clientAddress, connectionKey, trustProxyFrom, type TrustProxy } from '../src/client'

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
