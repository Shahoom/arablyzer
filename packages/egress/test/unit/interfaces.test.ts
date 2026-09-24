import { expect, it } from 'vitest'
import { localInterfaceCidrs, publicInterfaceCidrs } from '../../src/interfaces'
import { createPolicy } from '../../src/policy'

// Security review 2026-09-24: on a machine with a public IP on its interface (a VPS, a
// self-hosted runner), a redirect to that IP reaches local services. The CLI denies them.
it('lists this machine’s own addresses as single-host deny CIDRs', () => {
  const cidrs = localInterfaceCidrs()
  expect(cidrs).toContain('127.0.0.1/32')
  expect(cidrs.every((cidr) => cidr.endsWith('/32') || cidr.endsWith('/128'))).toBe(true)
  expect(() => createPolicy({ denyCidrs: cidrs })).not.toThrow()
})

const FAKE = {
  lo: [
    { address: '127.0.0.1', family: 'IPv4' },
    { address: '::1', family: 'IPv6' },
  ],
  eth0: [
    { address: '8.8.8.8', family: 'IPv4' },
    { address: '2606:4700::1111', family: 'IPv6' },
    { address: 'fe80::1%eth0', family: 'IPv6' },
  ],
  docker0: [{ address: '172.17.0.1', family: 'IPv4' }],
  wg0: [{ address: '100.64.0.1', family: 'IPv4' }],
  down: undefined,
}

it('strips IPv6 zone ids and lists each address once', () => {
  expect(localInterfaceCidrs({ ...FAKE, again: [{ address: '8.8.8.8', family: 'IPv4' }] })).toEqual(
    [
      '100.64.0.1/32',
      '127.0.0.1/32',
      '172.17.0.1/32',
      '2606:4700::1111/128',
      '8.8.8.8/32',
      '::1/128',
      'fe80::1/128',
    ],
  )
})

// Security review 2026-09-24: --allow-private opens private ranges for local builds, but a
// chain that starts on a public site must still not reach this machine through its public IP.
it('picks out the public addresses, which --allow-private still denies', () => {
  expect(publicInterfaceCidrs(FAKE)).toEqual(['2606:4700::1111/128', '8.8.8.8/32'])
  expect(publicInterfaceCidrs(FAKE).every((cidr) => localInterfaceCidrs(FAKE).includes(cidr))).toBe(
    true,
  )
})
