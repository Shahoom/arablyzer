import { describe, expect, it } from 'vitest'
import {
  chooseTarget,
  inCi,
  isLoopback,
  percentile,
  reportOn,
  sseData,
  summarize,
  visitorAddresses,
  wholeNumber,
} from './measure'

describe('the numbers', () => {
  it('takes a percentile by the nearest rank', () => {
    const hundred = Array.from({ length: 100 }, (_, index) => index + 1)
    expect(percentile(hundred, 50)).toBe(50)
    expect(percentile(hundred, 95)).toBe(95)
    expect(percentile(hundred, 100)).toBe(100)
    // Ten samples: the 95th percentile is the tenth, not one between the ninth and the tenth.
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10)
    expect(percentile([7], 95)).toBe(7)
    expect(percentile([], 95)).toBe(0)
  })

  it('summarizes samples in any order', () => {
    expect(summarize([9, 1, 5, 3, 7])).toEqual({ n: 5, p50: 5, p95: 9, max: 9 })
    expect(summarize([])).toEqual({ n: 0, p50: 0, p95: 0, max: 0 })
  })

  it('counts a request with no answer, or a status that is not expected, as an error', () => {
    const report = reportOn({
      name: 'GET /',
      expected: [200],
      wallMs: 1000,
      outcomes: [
        { ms: 10, status: 200 },
        { ms: 20, status: 200 },
        { ms: 30, status: 500 },
        { ms: 30_000, status: 0, failure: 'TimeoutError' },
      ],
    })
    expect(report.errors).toBe(2)
    expect(report.failures).toEqual({ TimeoutError: 1 })
    expect(report.statuses).toEqual({ '200': 2, '500': 1, '0': 1 })
    // The request that had no answer has no time to count: three answers in a second.
    expect(report.n).toBe(3)
    expect(report.max).toBe(30)
    expect(report.perSecond).toBe(3)
  })

  it('takes a refusal named in expected for what it is, not an error', () => {
    const report = reportOn({
      name: 'POST',
      expected: [202, 429],
      wallMs: 0,
      outcomes: [
        { ms: 1, status: 202 },
        { ms: 1, status: 429 },
      ],
    })
    expect(report.errors).toBe(0)
    expect(report.perSecond).toBe(0)
  })
})

describe('the numbers on the command line', () => {
  it('reads a whole number, the fallback where there is none, and refuses anything else', () => {
    expect(wholeNumber('pages', undefined, 300)).toBe(300)
    expect(wholeNumber('pages', '25', 300)).toBe(25)
    expect(wholeNumber('pages', '0', 300)).toBe(0)
    expect(() => wholeNumber('pages', '-1', 300)).toThrow('--pages')
    expect(() => wholeNumber('pages', '1.5', 300)).toThrow('--pages')
    expect(() => wholeNumber('pages', '1e3', 300)).toThrow('--pages')
    expect(() => wholeNumber('concurrency', '0', 8, 1)).toThrow('at least 1')
  })
})

describe('the target', () => {
  it.each([
    'http://127.0.0.1:8080',
    'http://127.1.2.3/',
    'http://localhost:8080/',
    'http://LOCALHOST/',
    'http://[::1]:8080/',
    'http://[0:0:0:0:0:0:0:1]/',
    // The URL parser writes each of these as 127.0.0.1.
    'http://2130706433/',
    'http://0x7f.1/',
    'http://0177.0.0.1/',
  ])('takes %s for this machine', (address) => {
    expect(isLoopback(new URL(address))).toBe(true)
  })

  it.each([
    'https://example.com/',
    'http://10.0.0.1/',
    'http://192.168.1.10:8080/',
    'http://172.17.0.2/',
    'http://0.0.0.0:8080/',
    'http://[::]/',
    'http://[::ffff:8.8.8.8]/',
    'http://8.8.8.8/',
    // Names that only start like one that is loopback.
    'http://127.0.0.1.example.com/',
    'http://localhost.example.com/',
    'http://notlocalhost/',
    // The host is what follows the @.
    'http://127.0.0.1@example.com/',
    'http://localhost:80@example.com/',
    'http://example.com#@127.0.0.1/',
    'http://example.com\\@127.0.0.1/',
  ])('does not take %s for this machine', (address) => {
    expect(isLoopback(new URL(address))).toBe(false)
  })

  it('chooses the default, and the address of the environment, when they are loopback', () => {
    const chosen = chooseTarget(undefined, undefined, 'http://127.0.0.1:8080')
    expect(chosen).toMatchObject({ ok: true, remote: false })
    const named = chooseTarget(undefined, 'http://127.0.0.1:18080', 'http://127.0.0.1:8080')
    expect(named.ok && named.url.origin).toBe('http://127.0.0.1:18080')
  })

  it('refuses a default or an environment address that is not loopback, and says why', () => {
    const fromEnvironment = chooseTarget(undefined, 'http://10.0.0.5:8080', 'http://127.0.0.1:8080')
    expect(fromEnvironment).toMatchObject({ ok: false })
    expect(!fromEnvironment.ok && fromEnvironment.reason).toContain('--target')
    // Even a default that is not loopback: only the flag names another machine.
    expect(chooseTarget(undefined, undefined, 'https://example.com')).toMatchObject({ ok: false })
  })

  it('takes an address that is not loopback only from --target, and says it is not on this machine', () => {
    const chosen = chooseTarget('https://staging.example.com', undefined, 'http://127.0.0.1:8080')
    expect(chosen).toMatchObject({ ok: true, remote: true })
    // --target beats the environment, loopback or not.
    const both = chooseTarget(
      'http://localhost:9000',
      'https://example.com',
      'http://127.0.0.1:8080',
    )
    expect(both).toMatchObject({ ok: true, remote: false })
  })

  it('refuses what is not a URL, not http, or has a password in it', () => {
    for (const bad of [
      'not a url',
      'ftp://127.0.0.1/',
      'file:///etc/passwd',
      'http://u:p@127.0.0.1/',
    ]) {
      expect(chooseTarget(bad, undefined, 'http://127.0.0.1:8080'), bad).toMatchObject({
        ok: false,
      })
    }
  })
})

describe('CI', () => {
  it('is any value of CI but an empty one, 0 and false', () => {
    expect(inCi({ CI: 'true' })).toBe(true)
    expect(inCi({ CI: '1' })).toBe(true)
    expect(inCi({ CI: 'yes' })).toBe(true)
    expect(inCi({})).toBe(false)
    expect(inCi({ CI: '' })).toBe(false)
    expect(inCi({ CI: '0' })).toBe(false)
    expect(inCi({ CI: 'FALSE' })).toBe(false)
  })
})

describe('the visitors', () => {
  it('are distinct addresses of the benchmarking range, which is not a private one', () => {
    const addresses = visitorAddresses(200)
    expect(new Set(addresses).size).toBe(200)
    for (const address of addresses) {
      expect(address).toMatch(/^198\.(?:18|19)\.\d{1,3}\.\d{1,3}$/)
      const last = Number(address.split('.')[3])
      expect(last).toBeGreaterThanOrEqual(1)
      expect(last).toBeLessThanOrEqual(254)
    }
  })
})

describe('the events of a scan', () => {
  it('are read whole, and what is left of one that is not complete is kept', () => {
    const text = 'id: 1\ndata: {"type":"queued"}\n\nevent: ping\ndata: \n\nid: 2\ndata: {"type":"do'
    expect(sseData(text)).toEqual({
      data: ['{"type":"queued"}', ''],
      rest: 'id: 2\ndata: {"type":"do',
    })
    expect(sseData(`${text}ne"}\n\n`).data.at(-1)).toBe('{"type":"done"}')
  })

  it('may end their lines with a carriage return, and hold no data', () => {
    expect(sseData('data: a\r\n\r\n: comment\n\n')).toEqual({ data: ['a'], rest: '' })
  })
})
