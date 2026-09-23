import { describe, expect, it } from 'vitest'
import { DEFAULT_POLICY } from '../../src/policy'
import { resolveEndpoint, type Resolver } from '../../src/resolve'
import { checkUrl } from '../../src/url'
import { stubResolver } from '../helpers'

async function vet(input: string, resolver: Resolver) {
  const checked = checkUrl(input, DEFAULT_POLICY)
  if (!checked.ok) throw new Error(`checkUrl rejected ${input}`)
  return resolveEndpoint(checked.url, checked.host, checked.port, DEFAULT_POLICY, resolver)
}

const dns = stubResolver({
  'internal.example': ['10.0.0.5'],
  'mixed.example': ['93.184.215.14', '127.0.0.1'],
  'v6-loopback.example': ['::1'],
  'metadata.example': ['169.254.169.254'],
  'mapped.example': ['::ffff:10.0.0.1'],
  'nat64-metadata.example': ['64:ff9b::a9fe:a9fe'],
  'empty.example': [],
  'public.example': ['93.184.215.14', '2001:4860:4860::8888'],
})

describe('every DNS answer is vetted before connecting', () => {
  it.each([
    ['internal.example', 'private-10'],
    ['mixed.example', 'loopback'],
    ['v6-loopback.example', 'loopback'],
    ['metadata.example', 'link-local'],
    ['mapped.example', 'private-10'],
    ['nat64-metadata.example', 'link-local'],
  ])('blocks %s (%s)', async (host, range) => {
    expect(await vet(`https://${host}/`, dns)).toMatchObject({
      ok: false,
      error: { code: 'blocked-address', range },
    })
  })

  it('fails closed when DNS has no answer or errors', async () => {
    expect(await vet('https://empty.example/', dns)).toMatchObject({
      ok: false,
      error: { code: 'dns-failed' },
    })
    expect(await vet('https://nxdomain.example/', dns)).toMatchObject({
      ok: false,
      error: { code: 'dns-failed' },
    })
  })

  it('passes every public answer through for the connection to use', async () => {
    expect(await vet('https://public.example/', dns)).toEqual({
      ok: true,
      addresses: [
        { address: '93.184.215.14', family: 4 },
        { address: '2001:4860:4860::8888', family: 6 },
      ],
    })
  })
})
