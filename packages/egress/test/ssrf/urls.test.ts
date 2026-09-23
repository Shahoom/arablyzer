import { describe, expect, it } from 'vitest'
import type { EgressErrorCode } from '../../src/errors'
import { DEFAULT_POLICY, createPolicy } from '../../src/policy'
import { resolveEndpoint } from '../../src/resolve'
import { checkUrl } from '../../src/url'
import { stubResolver } from '../helpers'

/** Rejected before any DNS lookup. */
const REJECTED: readonly [string, EgressErrorCode][] = [
  ['file:///etc/passwd', 'unsupported-scheme'],
  ['ftp://example.com/', 'unsupported-scheme'],
  ['gopher://127.0.0.1:6379/_INFO', 'unsupported-scheme'],
  ['data:text/html,<h1>x</h1>', 'unsupported-scheme'],
  ['javascript:alert(1)', 'unsupported-scheme'],
  ['ws://example.com/', 'unsupported-scheme'],
  ['example.com', 'invalid-url'],
  ['//example.com/', 'invalid-url'],
  ['http://', 'invalid-url'],
  ['http://[fe80::1%25eth0]/', 'invalid-url'],
  [`https://example.com/${'a'.repeat(2048)}`, 'url-too-long'],
  ['https://user:secret@example.com/', 'credentials-in-url'],
  ['http://example.com@127.0.0.1/', 'credentials-in-url'],
  ['http://example.com:8080/', 'port-not-allowed'],
  ['https://example.com:22/', 'port-not-allowed'],
  ['http://localhost/', 'blocked-host'],
  ['http://LOCALHOST./', 'blocked-host'],
  ['http://api.localhost/', 'blocked-host'],
  ['http://postgres/', 'blocked-host'],
  ['http://intranet./', 'blocked-host'],
]

describe('URL rules (no DNS)', () => {
  it.each(REJECTED)('rejects %s → %s', (input, code) => {
    const result = checkUrl(input, DEFAULT_POLICY)
    expect(result.ok ? 'accepted' : result.error.code).toBe(code)
  })

  it('never echoes credentials back', () => {
    const result = checkUrl('https://admin:hunter2@example.com/', DEFAULT_POLICY)
    expect(JSON.stringify(result)).not.toContain('hunter2')
  })

  it('accepts ordinary http(s) URLs, including Arabic host names and paths', () => {
    for (const input of [
      'https://example.com/',
      'http://example.com/',
      'https://example.com:443/a?b=1',
      'https://مثال.example/منتجات',
    ]) {
      expect(checkUrl(input, DEFAULT_POLICY)).toMatchObject({ ok: true })
    }
  })

  it('opens local builds on any port with --allow-private', () => {
    expect(checkUrl('http://localhost:4321/', createPolicy({ allowPrivate: true }))).toMatchObject({
      ok: true,
      host: 'localhost',
      port: 4321,
    })
  })
})

/** [url, range] — IP literals in every disguise; the URL parser normalises, then the address is vetted. */
const DISGUISED: readonly [string, string][] = [
  ['http://127.0.0.1/', 'loopback'],
  ['http://127.1/', 'loopback'],
  ['http://0x7f.1/', 'loopback'],
  ['http://0x7f000001/', 'loopback'],
  ['http://2130706433/', 'loopback'],
  ['http://0177.0.0.1/', 'loopback'],
  ['http://017700000001/', 'loopback'],
  ['http://①②⑦.⓪.⓪.①/', 'loopback'],
  ['http://127。0。0。1/', 'loopback'],
  ['http://127.0.0.1#@example.com/', 'loopback'],
  ['http://127.0.0.1\\@example.com/', 'loopback'],
  ['http://0/', 'this-network'],
  ['http://0.0.0.0/', 'this-network'],
  ['http://10.0.0.1/', 'private-10'],
  ['http://169.254.169.254/latest/meta-data/', 'link-local'],
  ['http://[::1]/', 'loopback'],
  ['http://[::]/', 'unspecified'],
  ['http://[::ffff:127.0.0.1]/', 'loopback'],
  ['http://[0:0:0:0:0:ffff:a9fe:a9fe]/', 'link-local'],
  ['http://[64:ff9b::a9fe:a9fe]/', 'link-local'],
  ['http://[2002:7f00:1::]/', 'loopback'],
  ['http://[fd00:ec2::254]/', 'metadata-aws'],
]

describe('IP literals are vetted without DNS', () => {
  const resolver = stubResolver({})

  it.each(DISGUISED)('blocks %s (%s)', async (input, range) => {
    const checked = checkUrl(input, DEFAULT_POLICY)
    if (!checked.ok) throw new Error(`checkUrl rejected ${input}: ${checked.error.code}`)
    const result = await resolveEndpoint(
      checked.url,
      checked.host,
      checked.port,
      DEFAULT_POLICY,
      resolver,
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'blocked-address', range } })
    expect(resolver.calls).toEqual([])
  })
})
