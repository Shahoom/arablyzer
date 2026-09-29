import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_POLICY, createPolicy } from '../../src/policy'
import {
  createDnsResolver,
  createTxtResolver,
  defaultResolver,
  dnsResolver,
  resolveEndpoint,
  systemResolver,
} from '../../src/resolve'
import { checkUrl } from '../../src/url'
import { startDnsServer, type DnsServer } from '../dns-server'

// Security review 2026-09-24: getaddrinfo cannot be cancelled and occupies libuv threadpool
// threads, so a nameserver that never answers could stall a hosted worker. Scans use c-ares.

let dns: DnsServer

beforeAll(async () => {
  dns = await startDnsServer({
    'public.test': { A: ['93.184.215.14'], AAAA: ['2001:4860:4860::8888'] },
    'internal.test': { A: ['10.0.0.1'] },
    'v6only.test': { AAAA: ['2001:4860:4860::8844'] },
    'hang.test': { hang: true },
    'mail.test': {
      A: ['93.184.215.14'],
      TXT: ['v=spf1 include:_spf.example.net -all', ['google-site-verification=', 'abc123']],
    },
    '_dmarc.mail.test': { TXT: ['v=DMARC1; p=reject'] },
    'no-txt.test': { A: ['93.184.215.14'] },
    'servfail.test': { rcode: 2 },
    'refused.test': { rcode: 5 },
  })
})

afterAll(async () => {
  await dns.close()
})

const never = new AbortController().signal

describe('c-ares resolver', () => {
  it('returns A and AAAA answers', async () => {
    const resolve = createDnsResolver({ servers: [dns.server], timeoutMs: 1000, tries: 1 })
    expect(await resolve('public.test', never)).toEqual([
      { address: '93.184.215.14', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 },
    ])
  })

  it('answers names that only have one family', async () => {
    const resolve = createDnsResolver({ servers: [dns.server], timeoutMs: 1000, tries: 1 })
    expect(await resolve('v6only.test', never)).toEqual([
      { address: '2001:4860:4860::8844', family: 6 },
    ])
  })

  it('fails for unknown names', async () => {
    const resolve = createDnsResolver({ servers: [dns.server], timeoutMs: 1000, tries: 1 })
    await expect(resolve('nxdomain.test', never)).rejects.toThrow()
  })

  it('gives up at its own timeout', async () => {
    const resolve = createDnsResolver({ servers: [dns.server], timeoutMs: 200, tries: 1 })
    const started = Date.now()
    await expect(resolve('hang.test', never)).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(1500)
  })

  it('is cancelled together with the fetch', async () => {
    const resolve = createDnsResolver({ servers: [dns.server], timeoutMs: 10_000, tries: 1 })
    const controller = new AbortController()
    setTimeout(() => {
      controller.abort()
    }, 50)
    const started = Date.now()
    await expect(resolve('hang.test', controller.signal)).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('feeds resolveEndpoint, which still blocks private answers', async () => {
    const checked = checkUrl('https://internal.test/', DEFAULT_POLICY)
    if (!checked.ok) throw new Error('checkUrl rejected the test URL')
    const resolve = createDnsResolver({ servers: [dns.server], timeoutMs: 1000, tries: 1 })
    const result = await resolveEndpoint(
      checked.url,
      checked.host,
      checked.port,
      DEFAULT_POLICY,
      resolve,
      never,
    )
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'blocked-address', range: 'private-10' },
    })
  })
})

// M2.3c: the DNS rules read TXT records, asked of the same resolver, and nothing else.
describe('c-ares TXT lookups', () => {
  const txt = () => createTxtResolver({ servers: [dns.server], timeoutMs: 1000, tries: 1 })

  it('asks for the one name, TXT alone, and joins the strings of each record', async () => {
    const before = dns.queries.length
    expect(await txt()('mail.test', never)).toEqual({
      outcome: 'found',
      records: ['v=spf1 include:_spf.example.net -all', 'google-site-verification=abc123'],
    })
    expect(dns.queries.slice(before)).toEqual(['mail.test TXT'])
  })

  it('answers none for a name without TXT records, or that does not exist', async () => {
    expect(await txt()('no-txt.test', never)).toEqual({ outcome: 'none', records: [] })
    expect(await txt()('nxdomain.test', never)).toEqual({ outcome: 'none', records: [] })
  })

  it('fails, rather than answering none, when the server fails or refuses', async () => {
    expect(await txt()('servfail.test', never)).toEqual({ outcome: 'failed', records: [] })
    expect(await txt()('refused.test', never)).toEqual({ outcome: 'failed', records: [] })
  })

  it('fails at its own timeout, and when cancelled, without throwing', async () => {
    const quick = createTxtResolver({ servers: [dns.server], timeoutMs: 200, tries: 1 })
    const started = Date.now()
    expect(await quick('hang.test', never)).toEqual({ outcome: 'failed', records: [] })
    expect(Date.now() - started).toBeLessThan(1500)
    const slow = createTxtResolver({ servers: [dns.server], timeoutMs: 10_000, tries: 1 })
    const controller = new AbortController()
    setTimeout(() => {
      controller.abort()
    }, 50)
    const cancelled = Date.now()
    expect(await slow('hang.test', controller.signal)).toEqual({ outcome: 'failed', records: [] })
    expect(Date.now() - cancelled).toBeLessThan(1000)
    expect(await slow('mail.test', AbortSignal.abort())).toEqual({ outcome: 'failed', records: [] })
  })

  it('is the TXT lookup of the resolvers scans use, which asks no other type', async () => {
    const resolve = createDnsResolver({ servers: [dns.server], timeoutMs: 1000, tries: 1 })
    const before = dns.queries.length
    expect(await resolve.txt?.('_dmarc.mail.test', never)).toEqual({
      outcome: 'found',
      records: ['v=DMARC1; p=reject'],
    })
    expect(dns.queries.slice(before)).toEqual(['_dmarc.mail.test TXT'])
    expect(dnsResolver.txt).toBeTypeOf('function')
    expect(systemResolver.txt).toBeTypeOf('function')
  })
})

describe('default resolver', () => {
  it('uses c-ares for scans and getaddrinfo (hosts file) only for --allow-private builds', () => {
    expect(defaultResolver(DEFAULT_POLICY)).toBe(dnsResolver)
    expect(defaultResolver(createPolicy({ allowPrivate: true }))).toBe(systemResolver)
  })
})
