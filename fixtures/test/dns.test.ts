import { describe, expect, it } from 'vitest'
import { fixtureTxt, SiteConfig } from '../src/index'

describe('fixtureTxt', () => {
  const quiet = SiteConfig.parse({ host: 'www.shop.example', aliases: ['shop.example'] })

  it('answers a site without txt as a domain that sends no mail, for its own names', () => {
    expect(fixtureTxt(quiet, 'shop.example')).toEqual({
      outcome: 'found',
      records: ['v=spf1 -all'],
    })
    expect(fixtureTxt(quiet, '_dmarc.shop.example')).toEqual({
      outcome: 'found',
      records: ['v=DMARC1; p=reject'],
    })
    expect(fixtureTxt(quiet, 'www.shop.example.')).toEqual({
      outcome: 'found',
      records: ['v=spf1 -all'],
    })
    expect(fixtureTxt(quiet, 'other.example')).toEqual({ outcome: 'none', records: [] })
    expect(fixtureTxt(SiteConfig.parse({}), 'shop.example')).toEqual({
      outcome: 'none',
      records: [],
    })
  })

  it('gives the records site.json names, and none for a name it leaves out', () => {
    const site = SiteConfig.parse({
      host: 'shop.example',
      txt: { 'shop.example': ['google-site-verification=abc123'] },
    })
    expect(fixtureTxt(site, 'shop.example')).toEqual({
      outcome: 'found',
      records: ['google-site-verification=abc123'],
    })
    expect(fixtureTxt(site, '_dmarc.shop.example')).toEqual({ outcome: 'none', records: [] })
  })

  it('takes .example names alone', () => {
    expect(() => SiteConfig.parse({ txt: { 'example.com': ['v=spf1 -all'] } })).toThrow()
  })
})
