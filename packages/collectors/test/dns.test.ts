import { describe, expect, it } from 'vitest'
import { organizationalDomain } from '../src/index'

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
    // The list's private part: each site a platform gives is its own.
    ['user.github.io', 'user.github.io'],
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
})
