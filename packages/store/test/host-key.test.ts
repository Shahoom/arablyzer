import { describe, expect, it } from 'vitest'
import { hostKey, hostLimitKey } from '../src/index'

describe('hostKey', () => {
  it('counts a site by its registrable domain, whatever name or trailing dot is used', () => {
    expect(hostKey('example.com')).toBe('domain:example.com')
    expect(hostKey('example.com.')).toBe('domain:example.com')
    expect(hostKey('Shop.Example.com')).toBe('domain:example.com')
    expect(hostKey('a.b.example.co.uk')).toBe('domain:example.co.uk')
    expect(hostKey('store.example.com.sa')).toBe('domain:example.com.sa')
  })

  it('keeps sites on a shared suffix apart', () => {
    expect(hostKey('one.github.io')).toBe('domain:one.github.io')
    expect(hostKey('two.github.io')).toBe('domain:two.github.io')
  })

  it('counts an address as itself, however it is written', () => {
    expect(hostKey('93.184.215.14')).toBe('ip:93.184.215.14')
    expect(hostKey('2606:2800:21F:CB07:6820:80DA:AF6B:8B2C')).toBe(
      'ip:2606:2800:21f:cb07:6820:80da:af6b:8b2c',
    )
    expect(hostKey('::ffff:93.184.215.14')).toBe('ip:93.184.215.14')
  })

  // A scan's page reports its host as a URL writes it, and the API's is written without them.
  it('reads an IPv6 address in brackets as the address', () => {
    expect(hostKey('[2606:2800:21f:cb07:6820:80da:af6b:8b2c]')).toBe(
      hostKey('2606:2800:21f:cb07:6820:80da:af6b:8b2c'),
    )
    expect(hostKey('[::ffff:93.184.215.14]')).toBe('ip:93.184.215.14')
  })
})

describe('hostLimitKey', () => {
  // The API counts the site a scan is asked for, and the worker the site it ends at, in one bucket.
  it('is one key for one site, whichever of its names and whoever counts', () => {
    expect(hostLimitKey('shop.example.com')).toBe('host:domain:example.com')
    expect(hostLimitKey('EXAMPLE.com.')).toBe(hostLimitKey('www.example.com'))
    expect(hostLimitKey('93.184.215.14')).toBe('host:ip:93.184.215.14')
    expect(hostLimitKey('example.com')).not.toBe(hostLimitKey('example.org'))
  })
})
