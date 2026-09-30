import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DOH_URL,
  DOH_URL_VARIABLE,
  decodeTxtAnswer,
  dohQueryUrl,
  dohUrlFrom,
  encodeTxtQuery,
} from '../../src/doh'
import { createPolicy, DEFAULT_POLICY } from '../../src/policy'

// M2.3c review: TXT lookups go as DNS over HTTPS (RFC 8484) through safeFetch, so through the
// egress proxy like all scan traffic. The wire format is written here byte for byte, and read
// back, against messages fixed in hex (RFC 1035 §4.1: a header of twelve bytes, then the sections).

const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex.replaceAll(/\s/g, ''), 'hex'))
const hex = (data: Uint8Array) => Buffer.from(data).toString('hex')

describe('encodeTxtQuery', () => {
  it('writes a header, one question, TXT (16) in class IN (1), and an ID of 0', () => {
    expect(hex(encodeTxtQuery('example.com'))).toBe(
      [
        '0000', // ID 0: RFC 8484 §4.1, for a message HTTP caches can share
        '0100', // flags: a query (QR 0), OPCODE 0, recursion desired (RD 1)
        '0001', // QDCOUNT: one question
        '0000', // ANCOUNT
        '0000', // NSCOUNT
        '0000', // ARCOUNT
        '07',
        '6578616d706c65', // "example"
        '03',
        '636f6d', // "com"
        '00', // the root
        '0010', // QTYPE TXT
        '0001', // QCLASS IN
      ].join(''),
    )
  })

  it('writes a name in lower case, with underscores, and without the dot that ends it', () => {
    expect(hex(encodeTxtQuery('_DMARC.Example.com.'))).toBe(
      '000001000001000000000000065f646d617263076578616d706c6503636f6d0000100001',
    )
  })

  it('refuses a name the resolver must not send', () => {
    for (const name of ['', 'exa mple.com', 'example..com', 'a'.repeat(64), 'مثال.com']) {
      expect(() => encodeTxtQuery(name), name).toThrow(TypeError)
    }
  })
})

describe('dohQueryUrl', () => {
  it('puts the query in the dns variable, in base64url without padding (RFC 8484 §4.1)', () => {
    expect(dohQueryUrl('https://cloudflare-dns.com/dns-query', 'example.com')).toBe(
      'https://cloudflare-dns.com/dns-query?dns=AAABAAABAAAAAAAAB2V4YW1wbGUDY29tAAAQAAE',
    )
    expect(dohQueryUrl('https://dns.example.net/dns-query', 'www.example.com')).toBe(
      'https://dns.example.net/dns-query?dns=AAABAAABAAAAAAAAA3d3dwdleGFtcGxlA2NvbQAAEAAB',
    )
    expect(dohQueryUrl('https://dns.example.net/dns-query', '_dmarc.example.com')).toBe(
      'https://dns.example.net/dns-query?dns=AAABAAABAAAAAAAABl9kbWFyYwdleGFtcGxlA2NvbQAAEAAB',
    )
  })

  it('keeps the resolver’s own query, and replaces a dns variable of its own', () => {
    expect(dohQueryUrl('https://dns.example.net/q?key=1', 'example.com')).toBe(
      'https://dns.example.net/q?key=1&dns=AAABAAABAAAAAAAAB2V4YW1wbGUDY29tAAAQAAE',
    )
    expect(dohQueryUrl('https://dns.example.net/q?dns=x', 'example.com')).toBe(
      'https://dns.example.net/q?dns=AAABAAABAAAAAAAAB2V4YW1wbGUDY29tAAAQAAE',
    )
  })
})

/** example.com's TXT answer: two records, the second of two strings (RFC 7208 §3.3). */
const TWO_RECORDS = [
  '0000', // ID
  '8180', // a response (QR 1), recursion desired and available, RCODE 0
  '0001', // QDCOUNT
  '0002', // ANCOUNT
  '0000', // NSCOUNT
  '0000', // ARCOUNT
  '076578616d706c6503636f6d00', // the question: example.com,
  '0010', // TXT,
  '0001', // IN
  'c00c', // record 1: its name is at offset 12 (the question's)
  '0010',
  '0001',
  '0000003c', // TTL 60
  '000c', // 12 bytes of data
  '0b',
  '763d73706631202d616c6c', // "v=spf1 -all"
  'c00c', // record 2
  '0010',
  '0001',
  '0000003c',
  '0021', // 33 bytes: two strings
  '19',
  '676f6f676c652d736974652d766572696669636174696f6e3d', // "google-site-verification="
  '06',
  '616263313233', // "abc123"
].join('')

/** www.example.com: a CNAME to example.com, that name's TXT, and a TXT of another name. */
const CNAME_CHAIN = [
  '0000',
  '8180',
  '0001',
  '0003',
  '0000',
  '0000',
  '03777777076578616d706c6503636f6d00', // the question: www.example.com,
  '0010',
  '0001',
  'c00c', // www.example.com
  '0005', // CNAME
  '0001',
  '0000003c',
  '0002',
  'c010', // to example.com, at offset 16
  'c010', // example.com
  '0010',
  '0001',
  '0000003c',
  '000c',
  '0b',
  '763d73706631202d616c6c', // "v=spf1 -all"
  '056f74686572076578616d706c6500', // other.example, which the question did not ask
  '0010',
  '0001',
  '0000003c',
  '000a',
  '09',
  '756e72656c61746564', // "unrelated"
].join('')

const NXDOMAIN = '000081830001000000000000076e6f7768657265076578616d706c6503636f6d0000100001'
const NO_RECORDS = '000081800001000000000000076578616d706c6503636f6d0000100001'

const FAILED = { outcome: 'failed', records: [] }
const NONE = { outcome: 'none', records: [] }

/** A message with one byte or more written over it, at an offset. */
function edited(message: string, offset: number, replacement: string): Uint8Array {
  const data = bytes(message)
  data.set(bytes(replacement), offset)
  return data
}

describe('decodeTxtAnswer', () => {
  it('joins the strings of each record without spaces (RFC 7208 §3.3)', () => {
    expect(decodeTxtAnswer(bytes(TWO_RECORDS), 'example.com')).toEqual({
      outcome: 'found',
      records: ['v=spf1 -all', 'google-site-verification=abc123'],
    })
  })

  it('reads the name the question asked in any case, and with the dot that ends it', () => {
    expect(decodeTxtAnswer(bytes(TWO_RECORDS), 'Example.COM.')).toMatchObject({ outcome: 'found' })
  })

  it('follows a CNAME to the name that holds the records, and reads no other name’s', () => {
    expect(decodeTxtAnswer(bytes(CNAME_CHAIN), 'www.example.com')).toEqual({
      outcome: 'found',
      records: ['v=spf1 -all'],
    })
  })

  it('reads a name that does not exist, and a name without TXT records, as no records', () => {
    expect(decodeTxtAnswer(bytes(NXDOMAIN), 'nowhere.example.com')).toEqual(NONE)
    expect(decodeTxtAnswer(bytes(NO_RECORDS), 'example.com')).toEqual(NONE)
  })

  it('reads the TXT records of the message and no other type', () => {
    // The first record's type changed from TXT (0010) to A (0001): only the second is read.
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 31, '0001'), 'example.com')).toEqual({
      outcome: 'found',
      records: ['google-site-verification=abc123'],
    })
    // Both changed: the answer holds no TXT record.
    const onlyA = edited(TWO_RECORDS, 31, '0001')
    onlyA.set(bytes('0001'), 55)
    expect(decodeTxtAnswer(onlyA, 'example.com')).toEqual(NONE)
  })

  it('fails, rather than answering none, when the server fails, refuses or is not asked', () => {
    // RCODE 2 (SERVFAIL), 4 (NOTIMP), 5 (REFUSED): the low four bits of the flags.
    for (const rcode of ['8182', '8184', '8185']) {
      expect(decodeTxtAnswer(edited(NO_RECORDS, 2, rcode), 'example.com'), rcode).toEqual(FAILED)
    }
    // Not a response (QR 0), or a response cut short (TC 1): what it holds is not the answer.
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 2, '0180'), 'example.com')).toEqual(FAILED)
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 2, '8380'), 'example.com')).toEqual(FAILED)
  })

  it('fails on an answer to another question', () => {
    expect(decodeTxtAnswer(bytes(TWO_RECORDS), 'other.example')).toEqual(FAILED)
    // TXT changed to A in the question, or the class changed from IN.
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 25, '0001'), 'example.com')).toEqual(FAILED)
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 27, '0003'), 'example.com')).toEqual(FAILED)
    // Two questions, or none.
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 4, '0002'), 'example.com')).toEqual(FAILED)
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 4, '0000'), 'example.com')).toEqual(FAILED)
  })

  it('fails on a message that is cut short, or whose lengths lie', () => {
    const whole = bytes(TWO_RECORDS)
    for (const length of [0, 5, 11, 12, 20, 33, 40, whole.length - 1]) {
      expect(decodeTxtAnswer(whole.subarray(0, length), 'example.com'), String(length)).toEqual(
        FAILED,
      )
    }
    // The first record says 13 bytes of data where its string fills 12.
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 39, '000d'), 'example.com')).toEqual(FAILED)
    // Its string says 12 bytes where 11 are left in the record.
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 41, '0c'), 'example.com')).toEqual(FAILED)
    // More records are announced than the message holds.
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 6, '0003'), 'example.com')).toEqual(FAILED)
  })

  it('fails on a name whose pointer loops, points ahead or uses a label type it does not know', () => {
    // The first record's name points to itself, and to the end of the message.
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 29, 'c01d'), 'example.com')).toEqual(FAILED)
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 29, 'c0ff'), 'example.com')).toEqual(FAILED)
    // A label type of 01 or 10, which RFC 1035 §4.1.4 leaves unused.
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 29, '4000'), 'example.com')).toEqual(FAILED)
    expect(decodeTxtAnswer(edited(TWO_RECORDS, 29, '8000'), 'example.com')).toEqual(FAILED)
  })

  it('fails on a CNAME that leads back to itself', () => {
    // www.example.com is an alias of itself: the CNAME's data points at the question's name.
    expect(decodeTxtAnswer(edited(CNAME_CHAIN, 45, 'c00c'), 'www.example.com')).toEqual(FAILED)
  })
})

describe('dohUrlFrom', () => {
  const proxied = createPolicy({ upstream: 'http://egress:4750' })

  it('is the environment’s ARABLYZER_DOH_URL, whatever the policy', () => {
    expect(DOH_URL_VARIABLE).toBe('ARABLYZER_DOH_URL')
    expect(dohUrlFrom({ ARABLYZER_DOH_URL: ' https://dns.example.net/dns-query ' }, proxied)).toBe(
      'https://dns.example.net/dns-query',
    )
    expect(
      dohUrlFrom({ ARABLYZER_DOH_URL: 'https://dns.example.net/dns-query' }, DEFAULT_POLICY),
    ).toBe('https://dns.example.net/dns-query')
  })

  it('is Cloudflare’s behind an egress proxy, and none for a process that asks DNS itself', () => {
    expect(DEFAULT_DOH_URL).toBe('https://cloudflare-dns.com/dns-query')
    expect(dohUrlFrom({}, proxied)).toBe(DEFAULT_DOH_URL)
    expect(dohUrlFrom({ ARABLYZER_DOH_URL: '  ' }, proxied)).toBe(DEFAULT_DOH_URL)
    expect(dohUrlFrom({}, DEFAULT_POLICY)).toBeUndefined()
  })

  it('is https, except outside production, and has no user, password or fragment', () => {
    const http = { ARABLYZER_DOH_URL: 'http://127.0.0.1:8053/dns-query' }
    expect(dohUrlFrom(http, proxied)).toBe('http://127.0.0.1:8053/dns-query')
    expect(() => dohUrlFrom({ ...http, NODE_ENV: 'production' }, proxied)).toThrow(TypeError)
    for (const bad of [
      'dns.example.net/dns-query',
      'ftp://dns.example.net/dns-query',
      'https://user:pass@dns.example.net/dns-query',
      'https://dns.example.net/dns-query#fragment',
      'not a url',
    ]) {
      expect(() => dohUrlFrom({ ARABLYZER_DOH_URL: bad }, proxied), bad).toThrow(TypeError)
    }
  })
})
