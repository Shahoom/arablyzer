import type { Resolver } from '@arablyzer/egress'
import { describe, expect, it } from 'vitest'
import {
  assertIsolated,
  defaultRoutes,
  defaultRoutesV6,
  isolationProblems,
  type IsolationProbe,
} from '../src/isolation'

const HEADER = 'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT'

/** /proc/net/route as Docker containers showed it (Docker Engine 29.5, 2026-09-30). */
const ROUTES = {
  // --network none, and a container on internal networks alone: no route past the subnet.
  none: `${HEADER}      \n`,
  internal: `${HEADER}      \neth0\t000016AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0      \n`,
  // The default bridge, and a user-defined network with a way out.
  bridge: `${HEADER}      \neth0\t00000000\t010011AC\t0003\t0\t0\t0\t00000000\t0\t0\t0      \neth0\t000011AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0      \n`,
}

/** /proc/net/ipv6_route: the kernel's own reject routes on the loopback, in every container. */
const LOOPBACK_V6 = [
  '00000000000000000000000000000000 00 00000000000000000000000000000000 00 00000000000000000000000000000000 ffffffff 00000001 00000000 00200200       lo',
  '00000000000000000000000000000001 80 00000000000000000000000000000000 00 00000000000000000000000000000000 00000000 00000002 00000000 80200001       lo',
  '00000000000000000000000000000000 00 00000000000000000000000000000000 00 00000000000000000000000000000000 ffffffff 00000001 00000000 00200200       lo',
].join('\n')
const DEFAULT_V6 =
  '00000000000000000000000000000000 00 00000000000000000000000000000000 00 fe800000000000000000000000000001 00000400 00000001 00000000 00000003     eth0'

describe('defaultRoutes', () => {
  it('finds none where a container has no way past its own subnet', () => {
    expect(defaultRoutes(ROUTES.none)).toEqual([])
    expect(defaultRoutes(ROUTES.internal)).toEqual([])
    expect(defaultRoutes('')).toEqual([])
  })

  it('finds the default route of a network with a way out, and its gateway', () => {
    expect(defaultRoutes(ROUTES.bridge)).toEqual(['eth0 via 172.17.0.1'])
  })

  it('finds a default route with no gateway (on-link), and each of several', () => {
    const table = [
      HEADER,
      'eth0\t00000000\t00000000\t0001\t0\t0\t0\t00000000\t0\t0\t0',
      'eth1\t00000000\t0100A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0',
    ].join('\n')
    expect(defaultRoutes(table)).toEqual(['eth0', 'eth1 via 192.168.0.1'])
  })

  it('leaves out a route that is down, a route to a subnet, and lines it cannot read', () => {
    const table = [
      HEADER,
      'eth0\t00000000\t010011AC\t0002\t0\t0\t0\t00000000\t0\t0\t0',
      'eth0\t00000000\t010011AC\t0003\t0\t0\t0\t0000FFFF\t0\t0\t0',
      'eth0\t0000FEA9\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
      'not a route',
      '',
    ].join('\n')
    expect(defaultRoutes(table)).toEqual([])
  })
})

describe('defaultRoutesV6', () => {
  it('leaves out the kernel’s reject routes on the loopback, which every container has', () => {
    expect(defaultRoutesV6(LOOPBACK_V6)).toEqual([])
    expect(defaultRoutesV6('')).toEqual([])
  })

  it('finds a default route out of the loopback, and its gateway', () => {
    expect(defaultRoutesV6(`${LOOPBACK_V6}\n${DEFAULT_V6}\n`)).toEqual([
      'eth0 via fe800000000000000000000000000001',
    ])
  })

  it('leaves out a reject route that is not on the loopback, and a route that is down', () => {
    const rejected = DEFAULT_V6.replace('00000003', '00000203')
    const down = DEFAULT_V6.replace('00000003', '00000002')
    expect(defaultRoutesV6(`${rejected}\n${down}`)).toEqual([])
  })

  it('leaves out a route to a prefix', () => {
    const prefix = DEFAULT_V6.replace(
      '00000000000000000000000000000000 00 ',
      'fd000000000000000000000000000000 40 ',
    )
    expect(defaultRoutesV6(prefix)).toEqual([])
  })
})

/** A probe of a container: its routes, and what its DNS answers. */
function probe(
  routes: string,
  answers: Readonly<Record<string, readonly string[]>> = {},
  overrides: Partial<IsolationProbe> = {},
): IsolationProbe {
  const resolver: Resolver = (name) =>
    (answers[name] ?? []).length > 0
      ? Promise.resolve(
          (answers[name] ?? []).map((address) => ({
            address,
            family: address.includes(':') ? 6 : 4,
          })),
        )
      : Promise.reject(new Error('SERVFAIL'))
  return {
    routes: () => Promise.resolve(routes),
    routesV6: () => Promise.resolve(LOOPBACK_V6),
    resolver,
    names: ['example.com', 'example.org'],
    dnsTimeoutMs: 200,
    ...overrides,
  }
}

describe('isolationProblems', () => {
  it('finds none on a network that reaches nothing outside: no route, and no outside name', async () => {
    expect(await isolationProblems(probe(ROUTES.internal))).toEqual([])
    expect(await isolationProblems(probe(ROUTES.none))).toEqual([])
  })

  it('finds the default route, and says through what', async () => {
    const problems = await isolationProblems(probe(ROUTES.bridge))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('default route (eth0 via 172.17.0.1)')
  })

  it('finds an IPv6 default route', async () => {
    const problems = await isolationProblems(
      probe(
        ROUTES.internal,
        {},
        { routesV6: () => Promise.resolve(`${LOOPBACK_V6}\n${DEFAULT_V6}`) },
      ),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('IPv6 default route')
  })

  it('finds an outside name that resolves to a public address, IPv6 too', async () => {
    const problems = await isolationProblems(
      probe(ROUTES.internal, {
        'example.com': ['93.184.215.14'],
        'example.org': ['2606:2800:21f:cb07:6820:80da:af6b:8b2c'],
      }),
    )
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('example.com resolves (93.184.215.14)')
    expect(problems[1]).toContain('example.org resolves (2606:2800:21f:cb07:6820:80da:af6b:8b2c)')
  })

  it('does not count a resolver that answers a name with an address of no site', async () => {
    const sinkhole = { 'example.com': ['10.0.0.9'], 'example.org': ['0.0.0.0', '127.0.0.1'] }
    expect(await isolationProblems(probe(ROUTES.internal, sinkhole))).toEqual([])
  })

  it('does not wait for a resolver that never answers', async () => {
    const silent: Resolver = () => new Promise(() => undefined)
    const started = performance.now()
    const problems = await isolationProblems(probe(ROUTES.internal, {}, { resolver: silent }))
    expect(problems).toEqual([])
    expect(performance.now() - started).toBeLessThan(2_000)
  })

  it('counts routes it cannot read against the network, which cannot then be shown closed', async () => {
    const problems = await isolationProblems(
      probe(ROUTES.internal, {}, { routes: () => Promise.reject(new Error('EACCES')) }),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('cannot be read (EACCES)')
  })

  it('takes a kernel without IPv6 as having no IPv6 route', async () => {
    expect(
      await isolationProblems(
        probe(ROUTES.internal, {}, { routesV6: () => Promise.resolve(null) }),
      ),
    ).toEqual([])
  })

  it('reports each thing it finds', async () => {
    const problems = await isolationProblems(
      probe(ROUTES.bridge, { 'example.com': ['93.184.215.14'] }),
    )
    expect(problems).toHaveLength(2)
  })
})

describe('assertIsolated', () => {
  it('asks nothing where the network is not claimed isolated: WebKit does not run there', async () => {
    const asked: string[] = []
    const watching = probe(
      ROUTES.bridge,
      {},
      {
        routes: () => {
          asked.push('routes')
          return Promise.resolve(ROUTES.bridge)
        },
      },
    )
    await assertIsolated({}, watching)
    await assertIsolated({ ARABLYZER_NETWORK_ISOLATED: '0' }, watching)
    expect(asked).toEqual([])
  })

  it('starts where the claim holds', async () => {
    await expect(
      assertIsolated({ ARABLYZER_NETWORK_ISOLATED: '1' }, probe(ROUTES.internal)),
    ).resolves.toBeUndefined()
  })

  it('refuses to start where the network has a way out, and says what it found', async () => {
    const env = { ARABLYZER_NETWORK_ISOLATED: '1' }
    await expect(assertIsolated(env, probe(ROUTES.bridge))).rejects.toThrow(
      /ARABLYZER_NETWORK_ISOLATED is set, but this container's network is not isolated: it has a default route \(eth0 via 172\.17\.0\.1\)/,
    )
    await expect(
      assertIsolated(env, probe(ROUTES.internal, { 'example.com': ['93.184.215.14'] })),
    ).rejects.toThrow(/example\.com resolves \(93\.184\.215\.14\)/)
  })
})
