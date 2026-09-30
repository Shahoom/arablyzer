import { describe, expect, it } from 'vitest'
import { parseDnsExample, txtOf } from '../src/dns'

describe('parseDnsExample', () => {
  it('reads TXT records one to a line, each string of a record joined', () => {
    const records = parseDnsExample(
      [
        'example.com.         TXT  "v=spf1 include:_spf.google.com ~all"',
        '',
        '_DMARC.example.com.  3600 IN TXT "v=DMARC1; p=none; " "rua=mailto:dmarc@example.com"',
        'example.com  TXT "say \\"hi\\""',
      ].join('\r\n'),
    )
    expect(records).toEqual([
      { name: 'example.com', value: 'v=spf1 include:_spf.google.com ~all' },
      { name: '_dmarc.example.com', value: 'v=DMARC1; p=none; rua=mailto:dmarc@example.com' },
      { name: 'example.com', value: 'say "hi"' },
    ])
    expect(txtOf(records, 'example.com.')).toEqual({
      outcome: 'found',
      records: ['v=spf1 include:_spf.google.com ~all', 'say "hi"'],
    })
    expect(txtOf(records, 'other.example.com')).toEqual({ outcome: 'none', records: [] })
  })

  it.each([
    ['nothing', ''],
    ['another type', 'example.com. A 192.0.2.1'],
    ['a record without its quotes', 'example.com. TXT v=spf1 -all'],
    ['text after the strings', 'example.com. TXT "v=spf1 -all" extra'],
    ['a string left open', 'example.com. TXT "v=spf1 -all'],
  ])('refuses %s', (_name, code) => {
    expect(() => parseDnsExample(code)).toThrow()
  })
})
