import { expect, it } from 'vitest'
import { localInterfaceCidrs } from '../../src/interfaces'
import { createPolicy } from '../../src/policy'

// Security review 2026-09-24: on a machine with a public IP on its interface (a VPS, a
// self-hosted runner), a redirect to that IP reaches local services. The CLI denies them.
it('lists this machine’s own addresses as single-host deny CIDRs', () => {
  const cidrs = localInterfaceCidrs()
  expect(cidrs).toContain('127.0.0.1/32')
  expect(cidrs.every((cidr) => cidr.endsWith('/32') || cidr.endsWith('/128'))).toBe(true)
  expect(() => createPolicy({ denyCidrs: cidrs })).not.toThrow()
})
