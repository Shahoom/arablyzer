import type { Engine } from '@arablyzer/collectors'
import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import {
  NEEDS_ISOLATION,
  bypassesProxyForLoopback,
  renderPage,
  type RenderOutcome,
} from '../../src/index'
import {
  serveHostileSite,
  SSRF_RESOLVER,
  trap,
  type HostileSite,
  type Trap,
} from '@arablyzer/fixtures'
import { enginesUnderTest } from './helpers'

const engines = await enginesUnderTest()
const cleanup: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

/**
 * This machine's network is not isolated. Engines that need isolation are rendered here all the
 * same, because their pages leave out the one route they send around the proxy (WebRTC); the
 * last suite shows that route still leaks, which is why they need isolation.
 */
async function render(site: HostileSite, path: string, engine: Engine, platform?: NodeJS.Platform) {
  const [outcome] = await renderPage(site.url(path), {
    engines: [engine],
    policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
    resolver: SSRF_RESOLVER,
    timeoutMs: 20_000,
    networkIsolated: true,
    ...(platform === undefined ? {} : { platform }),
  })
  if (outcome === undefined) throw new Error('No outcome')
  return outcome
}

async function hostileSite(port: number, withWebrtc: boolean): Promise<HostileSite> {
  const site = await serveHostileSite(port, withWebrtc)
  cleanup.push(() => site.close())
  return site
}

/** Waits up to `ms` for anything to reach the trap. */
async function hitsWithin(local: Trap, ms: number): Promise<string[]> {
  const until = performance.now() + ms
  while (local.hits.length === 0 && performance.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return local.hits
}

async function withTrap(): Promise<Trap> {
  const opened = await trap()
  cleanup.push(() => opened.close())
  return opened
}

function refusedTargets(outcome: RenderOutcome): string[] {
  return outcome.requests.refusals.map((refusal) => refusal.target)
}

// On macOS, WebKit reaches loopback around the proxy and never renders there (the last suite).
describe.each(engines.filter((engine) => !bypassesProxyForLoopback(engine)))(
  'browser SSRF suite: %s',
  (engine) => {
    const withWebrtc = !NEEDS_ISOLATION.includes(engine)

    it('reaches no local service from a hostile page, by any route, and the proxy saw them all', async () => {
      const local = await withTrap()
      const site = await hostileSite(local.port, withWebrtc)
      const outcome = await render(site, '/', engine)
      // Give anything the page started (WebRTC gathering, retries) time to show up.
      await new Promise((resolve) => setTimeout(resolve, 1500))

      expect(outcome.status, outcome.error ?? '').toBe('rendered')
      expect(local.hits).toEqual([])
      const refused = refusedTargets(outcome)
      for (const target of [
        `http://127.0.0.1:${local.port}/img`,
        `http://localhost:${local.port}/localhost`,
        `http://internal.test:${local.port}/dns`,
        'http://internal.test/dns-80',
        'http://127.0.0.1/loopback-80',
        'http://169.254.169.254/latest/meta-data/',
        `http://127.0.0.1:${local.port}/redirected`,
        `http://127.0.0.1:${local.port}/fetch`,
      ]) {
        expect(refused, target).toContain(target)
      }
      expect(
        outcome.requests.refusals.find(
          (refusal) => refusal.target === 'http://internal.test/dns-80',
        ),
      ).toMatchObject({ code: 'blocked-address', address: '127.0.0.1', range: 'loopback' })
      expect(
        outcome.requests.refusals.find(
          (refusal) => refusal.target === 'http://169.254.169.254/latest/meta-data/',
        ),
      ).toMatchObject({ code: 'blocked-address', range: 'link-local' })
    })

    it.each(['/refresh', '/navigate', '/leave'])(
      'reaches no local service when the page navigates away (%s)',
      async (path) => {
        const local = await withTrap()
        const site = await hostileSite(local.port, withWebrtc)
        await render(site, path, engine)
        expect(local.hits).toEqual([])
      },
    )
  },
)

// If this starts failing, the engine may have stopped sending WebRTC around the proxy: run the
// full suite above with WebRTC for it, and if that passes, take it out of NEEDS_ISOLATION.
describe.each(engines.filter((engine) => NEEDS_ISOLATION.includes(engine)))(
  'why %s renders only where the network is isolated',
  (engine) => {
    it('sends WebRTC to a local service around the proxy', async () => {
      const local = await withTrap()
      const site = await hostileSite(local.port, false)
      // Past the macOS refusal, if any, so this still shows why the engine needs isolation.
      const platform = bypassesProxyForLoopback(engine) ? 'linux' : undefined
      const outcome = await render(site, '/webrtc', engine, platform)
      expect(outcome.status, outcome.error ?? '').toBe('rendered')
      expect(await hitsWithin(local, 10_000)).toContainEqual(expect.stringMatching(/ stun$/))
    })
  },
)

// If this starts failing, the engine may have stopped reaching loopback around the proxy on this
// operating system: run the full suite above for it here, and if that passes, take the platform
// out of LOOPBACK_BYPASS. It renders with platform 'linux' only to get past that refusal.
describe.each(engines.filter((engine) => bypassesProxyForLoopback(engine)))(
  'why %s never renders on this operating system',
  (engine) => {
    it('follows a redirect to a local service around the proxy', async () => {
      const local = await withTrap()
      const site = await hostileSite(local.port, false)
      await render(site, '/leave', engine, 'linux')
      expect(await hitsWithin(local, 5_000)).toContainEqual(
        expect.stringContaining(`GET http://127.0.0.1:${local.port}/`),
      )
    })
  },
)
