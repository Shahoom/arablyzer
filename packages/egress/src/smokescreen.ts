import { DEFAULT_MAX_REQUESTS, PROXY_CONNECT_TIMEOUT_MS, PROXY_IDLE_TIMEOUT_MS } from './proxy'
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
 * Tunnels open at once: twice a page load's requests (BUILD-PLAN §11), for the one scan the
 * scanner runs at a time, whose engines render one after another, and the API's checks.
 */
export const SMOKESCREEN_MAX_TUNNELS = 2 * DEFAULT_MAX_REQUESTS

/** A duration as Go's time.ParseDuration reads it. */
const seconds = (ms: number) => `${String(ms / 1000)}s`

/**
 * Smokescreen's configuration (infra/egress/smokescreen.yaml): the browsers' own proxy's limits,
 * so a connection that goes around it gets no more time and no more room, and every range this
 * package refuses, private ones included, so the egress proxy refuses them too, whatever its own
 * defaults (M2.1 plan §5b). Its source tree refuses fewer: it lets 0.0.0.0/8, the documentation
 * and benchmarking ranges, and reserved space through.
 */
export function smokescreenConfig(): string {
  const ranges = [...IPV4_RANGES, ...IPV6_RANGES, ...OUTSIDE_GLOBAL_UNICAST]
  return [
    '# Generated from packages/egress/src/{proxy,ranges}.ts by',
    '# `pnpm --filter @arablyzer/egress smokescreen-config`; the egress tests check it matches.',
    '# The limits of the browsers’ own proxy: a connect, a request’s headers, a quiet connection.',
    `connect_timeout: ${seconds(PROXY_CONNECT_TIMEOUT_MS)}`,
    `read_header_timeout: ${seconds(PROXY_CONNECT_TIMEOUT_MS)}`,
    `idle_timeout: ${seconds(PROXY_IDLE_TIMEOUT_MS)}`,
    '# Twice a page load’s requests (BUILD-PLAN §11): one scan at a time, and the API’s checks.',
    `max_concurrent_connect_tunnels: ${String(SMOKESCREEN_MAX_TUNNELS)}`,
    '# Every range Arablyzer refuses, which Smokescreen refuses too. The server’s own public',
    '# address is added when the proxy starts, from ARABLYZER_DENY_CIDRS (infra/egress/main.go).',
    'deny_ranges:',
    ...ranges.map(({ cidr, name }) => `  - ${cidr} # ${name}`),
    '',
  ].join('\n')
}
