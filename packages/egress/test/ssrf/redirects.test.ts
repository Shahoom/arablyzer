import { serveSite, sitePath, type FixtureSite } from '@arablyzer/fixtures'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { EgressErrorCode } from '../../src/errors'
import { safeFetch } from '../../src/fetch'
import { onlyServer, stubResolver, UA } from '../helpers'

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
