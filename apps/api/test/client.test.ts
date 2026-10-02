import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  clientAddress,
  connectionKey,
  limitSubject,
  networkKey,
  networkSubject,
  trustProxyFrom,
  type TrustProxy,
} from '../src/client'
import { PROXY_SECRET_HEADER } from '../src/proxy-secret'

/** The secret the site's server holds, as the tests give it to the API. */
const SECRET = 'a-proxy-secret-of-more-than-thirty-two-characters'

async function addressFor(
  trust: TrustProxy,
  headers: Record<string, string>,
  proxySecret?: string,
) {
  const app = new Hono()
  app.get('/', (c) => c.text(clientAddress(c, trust, proxySecret) ?? 'none'))
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
    const headers = {
      'x-forwarded-for': '198.51.100.1, 203.0.113.8',
      [PROXY_SECRET_HEADER]: SECRET,
    }
    expect(await addressFor('proxy', headers, SECRET)).toBe('203.0.113.8')
  })

  it('believes X-Forwarded-For only from the proxy that holds the secret', async () => {
    const forwarded = { 'x-forwarded-for': '198.51.100.1, 203.0.113.8' }
    // Anything else that reaches the API can write any address in the header.
    expect(await addressFor('proxy', forwarded, SECRET)).toBe('none')
    expect(await addressFor('proxy', { ...forwarded, [PROXY_SECRET_HEADER]: '' }, SECRET)).toBe(
      'none',
    )
    expect(
      await addressFor('proxy', { ...forwarded, [PROXY_SECRET_HEADER]: `${SECRET}x` }, SECRET),
    ).toBe('none')
    expect(
      await addressFor('proxy', { ...forwarded, [PROXY_SECRET_HEADER]: SECRET.slice(1) }, SECRET),
    ).toBe('none')
    // The secret alone names no visitor.
    expect(await addressFor('proxy', { [PROXY_SECRET_HEADER]: SECRET }, SECRET)).toBe('none')
  })

  it('has no address from a proxy when it was given no secret to check', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.8', [PROXY_SECRET_HEADER]: SECRET }
    expect(await addressFor('proxy', headers)).toBe('none')
    expect(await addressFor('proxy', { ...headers, [PROXY_SECRET_HEADER]: '' }, '')).toBe('none')
  })

  it("keeps Cloudflare's header as it was, whatever the secret", async () => {
    expect(await addressFor('cloudflare', { 'cf-connecting-ip': '203.0.113.7' }, SECRET)).toBe(
      '203.0.113.7',
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
  it('counts an IPv6 visitor by their /48, and one address by one name', () => {
    expect(limitSubject('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1::/48')
    expect(limitSubject('2001:db8:1:2:ffff::9')).toBe('2001:db8:1::/48')
    expect(limitSubject('2001:DB8:1:3::1')).toBe('2001:db8:1::/48')
    expect(limitSubject('2001:db8:2::1')).toBe('2001:db8:2::/48')
    expect(limitSubject('::ffff:203.0.113.9')).toBe('203.0.113.9')
    expect(limitSubject('203.0.113.9')).toBe('203.0.113.9')
  })

  // The security review (issue #30): a /48 is routed to one customer, who has 65,536 /64s in it,
  // and each of them was a visitor of its own.
  it('gives every /64 of a routed /48 the same visitor', () => {
    const subjects = new Set(
      Array.from({ length: 300 }, (_, i) => limitSubject(`2001:db8:abcd:${i.toString(16)}::1`)),
    )
    expect([...subjects]).toEqual(['2001:db8:abcd::/48'])
  })

  it('gives the addresses of one /48 one key, and the addresses of two /48s two', () => {
    const day = new Date('2026-09-28T12:00:00Z')
    const key = (address: string) => connectionKey(address, 'secret', day)
    expect(key('2001:db8:1:2::a')).toBe(key('2001:db8:1:ffff:ffff:ffff:ffff:ffff'))
    expect(key('2001:db8:1:2::a')).toBe(key('2001:db8:1:3::a'))
    expect(key('2001:db8:1:2::a')).not.toBe(key('2001:db8:2:2::a'))
    expect(key('::ffff:203.0.113.9')).toBe(key('203.0.113.9'))
  })
})

describe('networkSubject', () => {
  it('names the /32 an IPv6 visitor is in, and none for IPv4', () => {
    expect(networkSubject('2001:db8:1:2:3:4:5:6')).toBe('2001:db8::/32')
    expect(networkSubject('2001:db8:ffff:ffff::1')).toBe('2001:db8::/32')
    expect(networkSubject('2001:DB9::1')).toBe('2001:db9::/32')
    expect(networkSubject('203.0.113.9')).toBeNull()
    expect(networkSubject('::ffff:203.0.113.9')).toBeNull()
  })
})

describe('networkKey', () => {
  const day = new Date('2026-09-28T23:59:59Z')

  it('is one key for the /48s of a /32, another for another /32, and none for IPv4', () => {
    const key = networkKey('2001:db8:1::1', 'secret', day)
    expect(key).toHaveLength(32)
    expect(networkKey('2001:db8:2::1', 'secret', day)).toBe(key)
    expect(networkKey('2001:db8:ffff:ffff:ffff:ffff:ffff:ffff', 'secret', day)).toBe(key)
    expect(networkKey('2001:db9::1', 'secret', day)).not.toBe(key)
    expect(networkKey('203.0.113.9', 'secret', day)).toBeNull()
  })

  it('is not the network, and changes with the day and the secret, as the visitor’s does', () => {
    const key = networkKey('2001:db8::1', 'secret', day) ?? ''
    expect(key).not.toContain('2001')
    expect(networkKey('2001:db8::1', 'secret', new Date('2026-09-29T00:00:00Z'))).not.toBe(key)
    expect(networkKey('2001:db8::1', 'other', day)).not.toBe(key)
  })

  it('never equals a visitor’s key, whatever the two are', () => {
    expect(networkKey('2001:db8::1', 'secret', day)).not.toBe(
      connectionKey('2001:db8::1', 'secret', day),
    )
  })
})
