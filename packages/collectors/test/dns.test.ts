import { describe, expect, it } from 'vitest'
import { organizationalDomain, txtLookup } from '../src/index'

// RFC 7489 §3.2: the Public Suffix List's longest match for the name, and one label more.
describe('organizationalDomain', () => {
  it.each([
    ['example.com', 'example.com'],
    ['www.example.com', 'example.com'],
    ['shop.example.com.sa', 'example.com.sa'],
    ['a.b.example.co.uk', 'example.co.uk'],
    ['WWW.Example.COM.', 'example.com'],
    // An Arabic name, as a URL gives it: in its ASCII form.
    ['www.xn--mgbh0fb.xn--mgberp4a5d4ar', 'xn--mgbh0fb.xn--mgberp4a5d4ar'],
    // A name under no known suffix is under its last label, as the list's default rule says.
    ['www.shop.example', 'shop.example'],
  ])('%s is under %s', (host, domain) => {
    expect(organizationalDomain(host)).toBe(domain)
  })

  it.each(['127.0.0.1', '[::1]', 'com', 'com.sa', 'github.io', ''])(
    '%s has none: an address, or a public suffix itself',
    (host) => {
      expect(organizationalDomain(host)).toBeNull()
    },
  )

  // M2.3c review: the list's private section names the suffixes a platform gives its customers'
  // sites. The owner of a site there cannot change the zone's DNS, so it has no domain of its own
  // to read the mail records of: the name is not judged.
  it.each([
    'user.github.io',
    'shop.myshopify.com',
    'foo.blogspot.com',
    'x.vercel.app',
    'a.b.pages.dev',
    'www.foo.netlify.app',
    'foo.web.app',
    'foo.herokuapp.com',
    'foo.wixsite.com',
  ])('%s is a site a platform gives: it has no domain of its own', (host) => {
    expect(organizationalDomain(host)).toBeNull()
  })

  it('reads a site on the ICANN part of the list alone, with a platform’s name in it', () => {
    expect(organizationalDomain('github.io.example.com')).toBe('example.com')
    expect(organizationalDomain('www.vercel.app.example.com.sa')).toBe('example.com.sa')
  })
})

// M2.3c review: the rules see a name's records in an order of their own, not the resolver's.
describe('txtLookup', () => {
  it('sorts the records by code unit, so the same records read the same in any order', () => {
    const one = txtLookup('example.com', 'found', ['v=spf1 include:b -all', 'v=spf1 -all', 'a=b'])
    const other = txtLookup('example.com', 'found', ['a=b', 'v=spf1 -all', 'v=spf1 include:b -all'])
    expect(one).toEqual(other)
    expect(one.records).toEqual(['a=b', 'v=spf1 -all', 'v=spf1 include:b -all'])
  })

  it('keeps the name and the outcome, and does not change the records it is given', () => {
    const given = ['b', 'a']
    expect(txtLookup('_dmarc.example.com', 'found', given)).toEqual({
      name: '_dmarc.example.com',
      outcome: 'found',
      records: ['a', 'b'],
    })
    expect(given).toEqual(['b', 'a'])
    expect(txtLookup('example.com', 'none', [])).toEqual({
      name: 'example.com',
      outcome: 'none',
      records: [],
    })
  })
})
