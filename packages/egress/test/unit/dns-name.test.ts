import { describe, expect, it } from 'vitest'
import { dnsName, MAX_DNS_NAME_LENGTH } from '../../src/dns-name'

// M2.3c review: a name a TXT lookup sends is checked by the resolver itself, whoever asks: at most
// 253 characters, in labels of at most 63 characters made of letters, digits, hyphens and
// underscores (_dmarc, _domainkey).
describe('dnsName', () => {
  it('gives a name in lower case, without the dot that ends it', () => {
    expect(dnsName('Example.COM')).toBe('example.com')
    expect(dnsName('example.com.')).toBe('example.com')
    expect(dnsName('_dmarc.shop.example.com.sa')).toBe('_dmarc.shop.example.com.sa')
    // An Arabic name goes as its ASCII form, which is letters, digits and hyphens.
    expect(dnsName('xn--mgbh0fb.xn--mgberp4a5d4ar')).toBe('xn--mgbh0fb.xn--mgberp4a5d4ar')
    expect(dnsName('a-b_c.example')).toBe('a-b_c.example')
  })

  it('takes a name of 253 characters and a label of 63, and no more', () => {
    const label = 'a'.repeat(63)
    const name = [label, label, label, 'a'.repeat(61)].join('.')
    expect(name).toHaveLength(MAX_DNS_NAME_LENGTH)
    expect(dnsName(name)).toBe(name)
    expect(dnsName(`${name}a`)).toBeNull()
    expect(dnsName(`${'a'.repeat(64)}.example`)).toBeNull()
    expect(dnsName(`${name}.`)).toBe(name)
  })

  it.each([
    '',
    '.',
    'example..com',
    '.example.com',
    'exa mple.com',
    'example.com/path',
    'example.com:53',
    'exämple.com',
    'مثال.السعودية',
    'example.com\u0000',
    'example.com\n',
    'exam*ple.com',
    'user@example.com',
    '[::1]',
    '127.0.0.1 ',
    'example.com..',
  ])('refuses %j', (name) => {
    expect(dnsName(name)).toBeNull()
  })
})
