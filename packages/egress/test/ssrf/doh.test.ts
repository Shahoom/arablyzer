import { serveDoh, trap, type DohFailure, type DohStandIn, type DohZone } from '@arablyzer/fixtures'
import { afterEach, describe, expect, it } from 'vitest'
import { createDohTxtResolver, DOH_TIMEOUT_MS, MAX_DNS_MESSAGE_BYTES } from '../../src/doh'
import { createPolicy, DEFAULT_POLICY } from '../../src/policy'
import { onlyServer, stubResolver, UA } from '../helpers'

// M2.3c review: the DNS rules cannot ask a resolver of their own behind the egress proxy, so their
// TXT lookups go as DNS over HTTPS (RFC 8484) through safeFetch. Here the resolver is a local
// stand-in that answers as application/dns-message and logs everything it is asked; a real
// resolver is never called. The lookups are vetted like any other request: the resolver's own URL
// included.

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function resolverAt(zone: DohZone, failure: DohFailure = {}): Promise<DohStandIn> {
  const doh = await serveDoh(zone, failure)
  cleanup.push(() => doh.close())
  return doh
}

const never = new AbortController().signal
const FAILED = { outcome: 'failed', records: [] }

const ZONE: DohZone = {
  'mail.test': {
    txt: ['v=spf1 include:_spf.example.net -all', ['google-site-verification=', 'abc123']],
  },
  '_dmarc.mail.test': { txt: ['v=DMARC1; p=reject'] },
  'quiet.test': { txt: [] },
  'servfail.test': { rcode: 2 },
  'refused.test': { rcode: 5 },
  'hang.test': { hang: true },
}

describe('a TXT lookup over DoH', () => {
  const lookup = (doh: DohStandIn, timeoutMs?: number) =>
    createDohTxtResolver({
      url: doh.url,
      userAgent: UA,
      policy: onlyServer(doh.port),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    })

  it('asks for the one name, TXT alone, with a GET, and joins the strings of each record', async () => {
    const doh = await resolverAt(ZONE)
    expect(await lookup(doh)('mail.test', never)).toEqual({
      outcome: 'found',
      records: ['v=spf1 include:_spf.example.net -all', 'google-site-verification=abc123'],
    })
    expect(await lookup(doh)('_dmarc.mail.test', never)).toEqual({
      outcome: 'found',
      records: ['v=DMARC1; p=reject'],
    })
    expect(doh.questions).toEqual(['mail.test TXT', '_dmarc.mail.test TXT'])
    expect(doh.requests).toHaveLength(2)
    for (const request of doh.requests) {
      expect(request.method).toBe('GET')
      expect(request.url).toMatch(/^\/dns-query\?dns=[A-Za-z0-9_-]+$/)
      expect(request.accept).toBe('application/dns-message')
      // Arablyzer names itself here as it does everywhere.
      expect(request.userAgent).toBe(UA)
    }
  })

  it('answers none for a name without TXT records, or that does not exist', async () => {
    const doh = await resolverAt(ZONE)
    expect(await lookup(doh)('quiet.test', never)).toEqual({ outcome: 'none', records: [] })
    expect(await lookup(doh)('nxdomain.test', never)).toEqual({ outcome: 'none', records: [] })
  })

  it('fails, rather than answering none, when the resolver fails, refuses or says nothing', async () => {
    const doh = await resolverAt(ZONE)
    expect(await lookup(doh)('servfail.test', never)).toEqual(FAILED)
    expect(await lookup(doh)('refused.test', never)).toEqual(FAILED)
    const started = Date.now()
    expect(await lookup(doh, 300)('hang.test', never)).toEqual(FAILED)
    expect(Date.now() - started).toBeLessThan(3_000)
  })

  it('has ten seconds for a lookup unless it is told another number', () => {
    expect(DOH_TIMEOUT_MS).toBe(10_000)
  })

  it('fails on a status other than 200, a content type other than application/dns-message, or garbage', async () => {
    for (const failure of [
      { status: 500 },
      { status: 404 },
      { status: 204 },
      { contentType: 'text/html; charset=utf-8' },
      { contentType: 'application/json' },
      { body: new Uint8Array([1, 2, 3]) },
      { body: new Uint8Array() },
    ] satisfies DohFailure[]) {
      const doh = await resolverAt(ZONE, failure)
      expect(await lookup(doh)('mail.test', never), JSON.stringify(failure)).toEqual(FAILED)
      expect(doh.requests).toHaveLength(1)
    }
  })

  it('accepts the content type with a parameter, in any case', async () => {
    const doh = await resolverAt(ZONE, { contentType: 'Application/DNS-Message; charset=binary' })
    expect(await lookup(doh)('mail.test', never)).toMatchObject({ outcome: 'found' })
  })

  it('reads no more than a DNS message', async () => {
    const doh = await resolverAt(ZONE, { body: new Uint8Array(MAX_DNS_MESSAGE_BYTES + 1) })
    expect(await lookup(doh)('mail.test', never)).toEqual(FAILED)
  })

  it('fails when it is cancelled, without asking or while it waits', async () => {
    const doh = await resolverAt(ZONE)
    expect(await lookup(doh)('mail.test', AbortSignal.abort())).toEqual(FAILED)
    expect(doh.requests).toEqual([])
    const controller = new AbortController()
    setTimeout(() => {
      controller.abort()
    }, 50)
    const started = Date.now()
    expect(await lookup(doh)('hang.test', controller.signal)).toEqual(FAILED)
    expect(Date.now() - started).toBeLessThan(3_000)
  })

  it('sends nothing for a name it must not send, whoever asks', async () => {
    const doh = await resolverAt(ZONE)
    const resolve = lookup(doh)
    for (const name of [
      '',
      'mail test',
      'mail.test/x',
      'mail..test',
      `${'a'.repeat(64)}.test`,
      `${'a.'.repeat(130)}test`,
      'مثال.test',
      'mail.test\r\nHost: evil.test',
    ]) {
      expect(await resolve(name, never), JSON.stringify(name)).toEqual(FAILED)
    }
    expect(doh.requests).toEqual([])
  })

  it('takes a resolver’s URL that is http or https, and no other', () => {
    for (const url of ['ftp://dns.example.net/dns-query', 'dns.example.net', 'not a url', '']) {
      expect(() => createDohTxtResolver({ url, userAgent: UA }), url).toThrow(TypeError)
    }
    expect(() =>
      createDohTxtResolver({ url: 'https://user:pass@dns.example.net/dns-query', userAgent: UA }),
    ).toThrow(TypeError)
  })
})

describe('the resolver’s URL, vetted like any other request', () => {
  it('is refused when it is a local service the policy does not open', async () => {
    const doh = await resolverAt(ZONE)
    // The default policy: no loopback, no port but 80 and 443.
    const resolve = createDohTxtResolver({ url: doh.url, userAgent: UA, policy: DEFAULT_POLICY })
    expect(await resolve('mail.test', never)).toEqual(FAILED)
    // The port opened, the address not: loopback is refused all the same.
    const portOnly = createPolicy({ allowedPorts: [80, 443, doh.port] })
    const opened = createDohTxtResolver({ url: doh.url, userAgent: UA, policy: portOnly })
    expect(await opened('mail.test', never)).toEqual(FAILED)
    expect(doh.requests).toEqual([])
    // Only a policy that names this server opens it, as for any test server.
    const named = createDohTxtResolver({
      url: doh.url,
      userAgent: UA,
      policy: onlyServer(doh.port),
    })
    expect(await named('mail.test', never)).toMatchObject({ outcome: 'found' })
  })

  it('is refused at an address no scan may reach, and at an internal name', async () => {
    for (const url of [
      'http://169.254.169.254/latest/meta-data/',
      'https://10.0.0.5/dns-query',
      'https://[::1]/dns-query',
      'https://[::ffff:127.0.0.1]/dns-query',
      'https://localhost/dns-query',
      'https://intranet/dns-query',
      'https://dns.example.net:8443/dns-query',
    ]) {
      const resolve = createDohTxtResolver({ url, userAgent: UA, policy: DEFAULT_POLICY })
      const started = Date.now()
      expect(await resolve('mail.test', never), url).toEqual(FAILED)
      expect(Date.now() - started, url).toBeLessThan(3_000)
    }
  })

  it('is refused when its name moves to a private address', async () => {
    const doh = await resolverAt(ZONE)
    // The name of a public resolver whose DNS gives a private address: refused before any connect.
    const resolver = stubResolver({ 'dns.example.net': ['10.0.0.5'] })
    const resolve = createDohTxtResolver({
      url: 'https://dns.example.net/dns-query',
      userAgent: UA,
      policy: onlyServer(doh.port),
      resolver,
    })
    expect(await resolve('mail.test', never)).toEqual(FAILED)
    expect(resolver.calls).toEqual(['dns.example.net'])
    expect(doh.requests).toEqual([])
  })

  it('is not followed to another address when the resolver redirects', async () => {
    const service = await trap()
    cleanup.push(() => service.close())
    const doh = await resolverAt(ZONE, {
      location: `http://127.0.0.1:${String(service.port)}/steal`,
    })
    const policy = createPolicy({
      allowTargets: [
        { address: '127.0.0.1', port: doh.port },
        { address: '127.0.0.1', port: service.port },
      ],
    })
    const resolve = createDohTxtResolver({ url: doh.url, userAgent: UA, policy })
    expect(await resolve('mail.test', never)).toEqual(FAILED)
    expect(doh.requests).toHaveLength(1)
    expect(service.hits).toEqual([])
  })
})
