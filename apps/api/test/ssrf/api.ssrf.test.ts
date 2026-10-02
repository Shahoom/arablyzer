import { serverPolicy, type Resolver } from '@arablyzer/egress'
import { trap } from '@arablyzer/fixtures'
import { DEVELOPMENT_LIMITS } from '@arablyzer/plans'
import {
  MemoryInFlight,
  MemoryRateLimiter,
  MemoryScanEvents,
  MemoryScanQueue,
  MemoryScanStore,
} from '@arablyzer/store'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { apiDeps } from '../../src/config'

// The API refuses every address the egress package refuses, before anything is stored or
// queued (M2.1 plan §4, BUILD-PLAN §13). The worker's scan checks again at connect time.

/** One address of each range the egress policy blocks, and the server's own public address. */
const BLOCKED: readonly string[] = [
  '0.0.0.0',
  '10.1.2.3',
  '100.64.0.1',
  '100.100.100.200',
  '127.0.0.1',
  '169.254.169.254',
  '172.16.0.1',
  '192.0.0.192',
  '192.0.2.10',
  '192.168.1.1',
  '198.18.0.1',
  '224.0.0.1',
  '240.0.0.1',
  '168.63.129.16',
  '::1',
  '::ffff:127.0.0.1',
  '::ffff:a9fe:a9fe',
  '64:ff9b::a9fe:a9fe',
  '2002:7f00:1::',
  'fc00::1',
  'fd00:ec2::254',
  'fd20:ce::254',
  'fe80::1',
  'ff02::1',
  '::127.0.0.1',
  // The server's own public address, which it cannot see behind NAT.
  '93.184.215.99',
]

/** Other spellings of loopback that URL parsing turns into 127.0.0.1. */
const LOOPBACK_SPELLINGS = [
  'http://2130706433/',
  'http://0x7f.0.0.1/',
  'http://0177.0.0.1/',
  'http://127.1/',
  'http://0x7f000001/',
]

/** The visitor `setup` gives every request: the key is the address itself. */
const VISITOR = '198.51.100.200'

const literal = (address: string) => (address.includes(':') ? `[${address}]` : address)

function setup(names: Readonly<Record<string, readonly string[]>> = {}) {
  const store = new MemoryScanStore()
  const queue = new MemoryScanQueue()
  const inFlight = new MemoryInFlight()
  const resolver: Resolver = (host) =>
    Promise.resolve(
      (names[host] ?? []).map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
    )
  const app = createApp({
    limits: {
      ...DEVELOPMENT_LIMITS,
      perConnection: { scans: 1000, seconds: 3600 },
      attempts: { scans: 1000, seconds: 3600 },
      perHost: { scans: 1000, seconds: 3600 },
    },
    // The servers' own rules, with this machine's addresses and the one behind NAT.
    policy: serverPolicy({ ARABLYZER_DENY_CIDRS: '93.184.215.99/32' }),
    resolver,
    turnstile: () => Promise.resolve(true),
    limiter: new MemoryRateLimiter(),
    store,
    queue,
    events: new MemoryScanEvents(),
    inFlight,
    address: () => '198.51.100.200',
    connectionKey: (address) => address,
    newId: () => 'AbCdEfGhIjKlMnOpQrSt_-',
  })
  const scanOf = async (url: string) => {
    const response = await app.request('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, turnstileToken: 'human' }),
    })
    const body: unknown = await response.json()
    return { status: response.status, body }
  }
  return { scanOf, store, queue, inFlight }
}

describe('the API against SSRF', () => {
  it.each(BLOCKED)('refuses %s written as an address, and queues nothing', async (address) => {
    const { scanOf, queue, store } = setup()
    expect(await scanOf(`http://${literal(address)}/`)).toEqual({
      status: 422,
      body: { error: 'blocked-address' },
    })
    expect(await queue.waiting()).toBe(0)
    expect(await store.get('AbCdEfGhIjKlMnOpQrSt_-')).toBeNull()
  })

  it.each(BLOCKED)('refuses a name that resolves to %s', async (address) => {
    const { scanOf, queue, inFlight } = setup({ 'inside.example.com': [address] })
    expect(await scanOf('https://inside.example.com/')).toEqual({
      status: 422,
      body: { error: 'blocked-address' },
    })
    expect(await queue.waiting()).toBe(0)
    // The refusal took the visitor's place for it, and gave it back: nothing is held for it.
    expect(await inFlight.held(VISITOR)).toEqual([])
  })

  it('does not let a visitor hold places with requests for addresses it refuses', async () => {
    const { scanOf, inFlight } = setup({
      'inside.example.com': ['10.0.0.5'],
      'example.com': ['93.184.215.14'],
    })
    for (let i = 0; i < 10; i++) {
      expect((await scanOf('https://inside.example.com/')).status).toBe(422)
    }
    expect(await inFlight.held(VISITOR)).toEqual([])
    // Their real scan is not turned away for the ten that were.
    expect((await scanOf('https://example.com/')).status).toBe(202)
  })

  it('refuses a name with one bad answer among good ones', async () => {
    const { scanOf } = setup({ 'mixed.example.com': ['93.184.215.14', '169.254.169.254'] })
    expect((await scanOf('https://mixed.example.com/')).body).toEqual({ error: 'blocked-address' })
  })

  it.each(LOOPBACK_SPELLINGS)('refuses loopback spelled %s', async (url) => {
    const { scanOf } = setup()
    expect((await scanOf(url)).body).toEqual({ error: 'blocked-address' })
  })

  it('refuses internal names, credentials that hide the host, and other ports', async () => {
    const { scanOf } = setup()
    expect((await scanOf('http://localhost./')).body).toEqual({ error: 'blocked-host' })
    expect((await scanOf('http://api.localhost/')).body).toEqual({ error: 'blocked-host' })
    expect((await scanOf('http://valkey:6379/')).body).toEqual({ error: 'port-not-allowed' })
    expect((await scanOf('http://postgres/')).body).toEqual({ error: 'blocked-host' })
    expect((await scanOf('http://example.com@127.0.0.1/')).body).toEqual({
      error: 'credentials-in-url',
    })
    expect((await scanOf('http://93.184.215.14:22/')).body).toEqual({ error: 'port-not-allowed' })
    expect((await scanOf('file:///etc/passwd')).body).toEqual({ error: 'unsupported-scheme' })
    expect((await scanOf('gopher://127.0.0.1:6379/_FLUSHALL')).body).toEqual({
      error: 'unsupported-scheme',
    })
  })

  it('lets a public page through', async () => {
    const { scanOf, queue } = setup({ 'example.com': ['93.184.215.14'] })
    expect((await scanOf('https://example.com/')).status).toBe(202)
    expect(await queue.waiting()).toBe(1)
  })
})

describe("the API's own requests", () => {
  it('ask Turnstile through the egress proxy, never around it', async () => {
    // A stand-in for the egress proxy, which records what reaches it.
    const proxy = await trap()
    try {
      const deps = apiDeps(
        {
          TURNSTILE_SECRET: 'turnstile-secret',
          ARABLYZER_EGRESS_PROXY: `http://127.0.0.1:${String(proxy.port)}`,
        },
        {
          store: new MemoryScanStore(),
          queue: new MemoryScanQueue(),
          events: new MemoryScanEvents(),
          limiter: new MemoryRateLimiter(),
          inFlight: new MemoryInFlight(),
        },
        () => undefined,
      )
      // It answers no CONNECT as Smokescreen does, so the check fails, closed.
      expect(await deps.turnstile('token')).toBe(false)
      expect(proxy.hits).toEqual(['tcp 127.0.0.1 "CONNECT challenges.cloudflare.com:443 HTTP/1.1"'])
    } finally {
      await proxy.close()
    }
  })
})
