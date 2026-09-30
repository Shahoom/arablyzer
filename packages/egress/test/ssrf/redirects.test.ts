import { serveSite, sitePath, type FixtureSite } from '@arablyzer/fixtures'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { EgressErrorCode } from '../../src/errors'
import { safeFetch } from '../../src/fetch'
import { createPolicy } from '../../src/policy'
import { onlyServer, startServer, stubResolver, UA } from '../helpers'

let site: FixtureSite

beforeAll(async () => {
  site = await serveSite(sitePath('ssrf-redirects'))
})

afterAll(async () => {
  await site.close()
})

const dns = stubResolver({ 'internal.example': ['10.0.0.7'] })

function fetchFromSite(path: string, maxRedirects?: number) {
  return safeFetch(site.url(path), {
    userAgent: UA,
    policy: onlyServer(site.port),
    resolver: dns,
    ...(maxRedirects === undefined ? {} : { maxRedirects }),
  })
}

describe('redirects are vetted hop by hop', () => {
  it('follows a relative redirect on the same site', async () => {
    const result = await fetchFromSite('/start')
    expect(result.error).toBeNull()
    expect(result.redirects).toEqual([
      { url: site.url('/start'), status: 302, location: site.url('/final') },
    ])
    expect(result.response?.url).toBe(site.url('/final'))
  })

  it.each([
    ['/to-metadata', 'blocked-address', 'link-local'],
    ['/to-metadata-mapped', 'blocked-address', 'link-local'],
    ['/to-ipv6-loopback', 'blocked-address', 'loopback'],
    ['/to-decimal-ip', 'blocked-address', 'loopback'],
    ['/to-internal-name', 'blocked-address', 'private-10'],
    ['/to-loopback-port', 'port-not-allowed', undefined],
    ['/to-localhost', 'blocked-host', undefined],
    ['/to-file', 'unsupported-scheme', undefined],
    ['/to-gopher', 'unsupported-scheme', undefined],
    ['/to-credentials', 'credentials-in-url', undefined],
  ] as const)('stops %s → %s', async (path, code: EgressErrorCode, range?: string) => {
    const result = await fetchFromSite(path)
    expect(result.response).toBeNull()
    expect(result.error).toMatchObject(range === undefined ? { code } : { code, range })
    expect(result.redirects).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('admin:admin')
  })

  it('stops redirect loops', async () => {
    const result = await fetchFromSite('/loop')
    expect(result.error?.code).toBe('too-many-redirects')
    expect(result.redirects).toHaveLength(10)
  })

  it('follows at most 10 redirects by default (BUILD-PLAN §11)', async () => {
    expect((await fetchFromSite('/hop/2')).response?.url).toBe(site.url('/hop/12'))
    expect((await fetchFromSite('/hop/1')).error?.code).toBe('too-many-redirects')
  })

  it('honours a lower limit, e.g. 5 for robots.txt (RFC 9309)', async () => {
    expect((await fetchFromSite('/hop/7', 5)).error).toBeNull()
    expect((await fetchFromSite('/hop/6', 5)).error?.code).toBe('too-many-redirects')
  })
})

// Security review 2026-09-24: --allow-private is for local builds. A chain that starts on a
// non-private address (a public site) must not be able to redirect into local services.
describe('--allow-private only for chains that start on a private address', () => {
  it('drops private access when the first hop is not private', async () => {
    // The fixture site is an exact test target, standing in for a public site here.
    const result = await safeFetch(site.url('/to-loopback-port'), {
      userAgent: UA,
      policy: onlyServer(site.port, { allowPrivate: true }),
      resolver: dns,
    })
    expect(result.response).toBeNull()
    expect(result.error?.code).toBe('port-not-allowed')
  })

  it('keeps private access when the chain starts on a private address', async () => {
    const target = await startServer((_req, res) => {
      res.end('local target')
    })
    const start = await startServer((_req, res) => {
      res.writeHead(302, { location: `http://127.0.0.1:${target.port}/` })
      res.end()
    })
    try {
      const result = await safeFetch(`http://127.0.0.1:${start.port}/`, {
        userAgent: UA,
        policy: createPolicy({ allowPrivate: true }),
      })
      expect(result.error).toBeNull()
      expect(Buffer.from(result.response?.body ?? new Uint8Array()).toString('utf8')).toBe(
        'local target',
      )
    } finally {
      await Promise.all([target.close(), start.close()])
    }
  })
})
