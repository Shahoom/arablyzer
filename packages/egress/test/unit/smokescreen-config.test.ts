import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { IPV4_RANGES, IPV6_GLOBAL_UNICAST, IPV6_RANGES } from '../../src/ranges'
import { smokescreenConfig } from '../../src/smokescreen'

const FILE = new URL('../../../../infra/egress/smokescreen.yaml', import.meta.url)

it("keeps Smokescreen's deny list the egress package's own", () => {
  // Regenerate with `pnpm --filter @arablyzer/egress smokescreen-config`.
  expect(readFileSync(FILE, 'utf8')).toBe(smokescreenConfig())
})

it('refuses every range the package refuses, and IPv6 outside global unicast', () => {
  const listed = [...smokescreenConfig().matchAll(/^ {2}- (\S+)/gm)].map((match) => match[1])
  for (const { cidr } of [...IPV4_RANGES, ...IPV6_RANGES]) expect(listed).toContain(cidr)
  // The three parts of the IPv6 space around global unicast, which must still be 2000::/3.
  expect(IPV6_GLOBAL_UNICAST).toBe('2000::/3')
  expect(listed).toEqual(expect.arrayContaining(['::/3', '4000::/2', '8000::/1']))
})

it("gives Smokescreen the browsers' proxy's limits, so nothing that goes around it gets more", () => {
  const config = smokescreenConfig()
  expect(config).toMatch(/^connect_timeout: 10s$/m)
  expect(config).toMatch(/^read_header_timeout: 10s$/m)
  expect(config).toMatch(/^idle_timeout: 30s$/m)
  // Two page loads' requests (BUILD-PLAN §11: 300 each).
  expect(config).toMatch(/^max_concurrent_connect_tunnels: 600$/m)
})
