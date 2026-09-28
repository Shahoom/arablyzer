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
