import { describe, expect, it } from 'vitest'
import { classifyAddress, vetEndpoint } from '../../src/classify'
import { DEFAULT_POLICY, createPolicy } from '../../src/policy'

/** [address, range name] — blocked under the default (hosted and CLI) policy. */
const BLOCKED_BY_DEFAULT: readonly [string, string][] = [
  ['0.0.0.0', 'this-network'],
  ['10.1.2.3', 'private-10'],
  ['100.64.0.1', 'shared-cgnat'],
  ['100.100.100.200', 'metadata-alibaba'],
  ['127.0.0.1', 'loopback'],
  ['127.255.255.254', 'loopback'],
  ['169.254.169.254', 'link-local'],
  ['169.254.170.2', 'link-local'],
  ['172.16.0.1', 'private-172'],
  ['172.31.255.255', 'private-172'],
  ['192.0.0.192', 'ietf-protocol-assignments'],
  ['192.0.2.10', 'documentation'],
  ['192.88.99.1', 'deprecated-6to4-relay'],
  ['192.168.1.1', 'private-192'],
  ['198.18.0.1', 'benchmarking'],
  ['198.51.100.7', 'documentation'],
  ['203.0.113.9', 'documentation'],
  ['224.0.0.1', 'multicast'],
  ['240.0.0.1', 'reserved'],
  ['255.255.255.255', 'reserved'],
  ['::', 'unspecified'],
  ['::1', 'loopback'],
  ['::ffff:127.0.0.1', 'loopback'],
  ['::ffff:a9fe:a9fe', 'link-local'],
  ['64:ff9b::a9fe:a9fe', 'link-local'],
  ['64:ff9b::a00:1', 'private-10'],
  ['64:ff9b:1::1', 'nat64-local-use'],
  ['2002:7f00:1::', 'loopback'],
  ['2002:a9fe:a9fe::1', 'link-local'],
  ['100::1', 'discard-only'],
  ['2001::1', 'ietf-protocol-assignments'],
  ['2001:db8::1', 'documentation'],
  ['3fff::1', 'documentation'],
  ['fc00::1', 'unique-local'],
  ['fd12:3456::1', 'unique-local'],
  ['fd00:ec2::254', 'metadata-aws'],
  ['fe80::1', 'link-local'],
  ['fec0::1', 'deprecated-site-local'],
  ['ff02::1', 'multicast'],
  ['::7f00:1', 'not-global-unicast'],
  ['4000::1', 'not-global-unicast'],
]

const PUBLIC: readonly string[] = [
  '1.1.1.1',
  '8.8.8.8',
  '93.184.215.14',
  '2001:4860:4860::8888',
  '2606:4700:4700::1111',
  '::ffff:8.8.8.8',
  '64:ff9b::808:808',
  '2002:808:808::1',
]

describe('address classification — default policy', () => {
  it.each(BLOCKED_BY_DEFAULT)('blocks %s (%s)', (address, range) => {
    expect(classifyAddress(address, DEFAULT_POLICY)).toEqual({ allowed: false, address, range })
  })

  it.each(PUBLIC)('allows public %s', (address) => {
    expect(classifyAddress(address, DEFAULT_POLICY)).toEqual({
      allowed: true,
      address,
      kind: 'public',
    })
  })

  it('treats unparseable input as blocked', () => {
    expect(classifyAddress('not-an-ip', DEFAULT_POLICY)).toEqual({
      allowed: false,
      address: 'not-an-ip',
      range: 'invalid-address',
    })
  })
})

describe('address classification — --allow-private (local builds)', () => {
  const policy = createPolicy({ allowPrivate: true })

  it.each([
    '10.0.0.1',
    '127.0.0.1',
    '172.20.0.5',
    '192.168.0.10',
    '100.64.1.1',
    '::1',
    'fd12::1',
    '::ffff:192.168.1.1',
  ])('opens private %s', (address) => {
    expect(classifyAddress(address, policy)).toEqual({ allowed: true, address, kind: 'private' })
  })

  it.each([
    ['169.254.169.254', 'link-local'],
    ['fe80::1', 'link-local'],
    ['fd00:ec2::254', 'metadata-aws'],
    ['100.100.100.200', 'metadata-alibaba'],
    ['64:ff9b::a9fe:a9fe', 'link-local'],
    ['0.0.0.0', 'this-network'],
    ['224.0.0.1', 'multicast'],
  ])('still blocks %s (%s)', (address, range) => {
    expect(classifyAddress(address, policy)).toEqual({ allowed: false, address, range })
  })
})

describe('configured deny ranges (the host server’s own IP)', () => {
  const policy = createPolicy({
    denyCidrs: ['203.0.114.7/32', '2a01:4f8::/32'],
    allowPrivate: true,
  })

  it('blocks them in every mode, including through IPv4-mapped IPv6', () => {
    for (const address of ['203.0.114.7', '::ffff:203.0.114.7', '2a01:4f8::1']) {
      expect(classifyAddress(address, policy)).toEqual({
        allowed: false,
        address,
        range: 'configured-deny',
      })
    }
  })

  it('rejects invalid CIDRs when the policy is created', () => {
    expect(() => createPolicy({ denyCidrs: ['10.0.0.0/33'] })).toThrow(/Invalid deny CIDR/)
  })
})

describe('endpoint vetting (address + port)', () => {
  it('allows only ports 80 and 443 on public addresses', () => {
    expect(vetEndpoint('8.8.8.8', 443, DEFAULT_POLICY)).toEqual({ allowed: true, kind: 'public' })
    expect(vetEndpoint('8.8.8.8', 80, DEFAULT_POLICY)).toEqual({ allowed: true, kind: 'public' })
    expect(vetEndpoint('8.8.8.8', 8080, DEFAULT_POLICY)).toEqual({
      allowed: false,
      code: 'port-not-allowed',
      range: 'port-8080',
    })
    expect(vetEndpoint('8.8.8.8', 22, createPolicy({ allowPrivate: true }))).toEqual({
      allowed: false,
      code: 'port-not-allowed',
      range: 'port-22',
    })
  })

  it('opens any port on private addresses with --allow-private', () => {
    expect(vetEndpoint('127.0.0.1', 4321, createPolicy({ allowPrivate: true }))).toEqual({
      allowed: true,
      kind: 'private',
    })
  })

  it('opens exact test targets only', () => {
    const policy = createPolicy({ allowTargets: [{ address: '127.0.0.1', port: 5555 }] })
    expect(vetEndpoint('127.0.0.1', 5555, policy)).toEqual({ allowed: true, kind: 'test-target' })
    expect(vetEndpoint('127.0.0.1', 5556, policy)).toEqual({
      allowed: false,
      code: 'blocked-address',
      range: 'loopback',
    })
  })
})
