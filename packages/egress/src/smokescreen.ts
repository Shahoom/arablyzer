import { IPV4_RANGES, IPV6_RANGES } from './ranges'

/**
 * IPv6 outside global unicast (IPV6_GLOBAL_UNICAST, 2000::/3) is never public: the three other
 * parts of the space, around it. The test checks global unicast has not moved.
 */
const OUTSIDE_GLOBAL_UNICAST = [
  { cidr: '::/3', name: 'below global unicast' },
  { cidr: '4000::/2', name: 'above global unicast' },
  { cidr: '8000::/1', name: 'above global unicast' },
] as const

/**
 * Smokescreen's configuration (infra/egress/smokescreen.yaml): every range this package refuses,
 * private ones included, so the egress proxy refuses them too, whatever its own defaults (M2.1
 * plan §5b). Its source tree refuses fewer: it lets 0.0.0.0/8, the documentation and
 * benchmarking ranges, and reserved space through.
 */
export function smokescreenConfig(): string {
  const ranges = [...IPV4_RANGES, ...IPV6_RANGES, ...OUTSIDE_GLOBAL_UNICAST]
  return [
    '# Generated from packages/egress/src/ranges.ts by',
    '# `pnpm --filter @arablyzer/egress smokescreen-config`; the egress tests check it matches.',
    '# Every range Arablyzer refuses, which Smokescreen refuses too. The server’s own public',
    '# address is added when the proxy starts, from ARABLYZER_DENY_CIDRS (infra/egress/main.go).',
    'deny_ranges:',
    ...ranges.map(({ cidr, name }) => `  - ${cidr} # ${name}`),
    '',
  ].join('\n')
}
