import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  BOT_TOKEN,
  NEEDS_ISOLATION,
  WORKER_GUARD,
  bypassesProxyForLoopback,
  contextOptions,
  executablePathFor,
  launchOptions,
  measureSource,
  networkIsolated,
  renderPage,
  userAgentFor,
} from '../../src/index'

const proxy = { server: 'http://127.0.0.1:1234', username: 'arablyzer', password: 'secret' }

describe('launch settings', () => {
  it('keeps loopback on the proxy in every engine', () => {
    for (const engine of ['chromium', 'firefox', 'webkit'] as const) {
      expect(launchOptions(engine, proxy).proxy).toEqual({ ...proxy, bypass: '<-loopback>' })
    }
  })

  it('gives Chromium both WebRTC flags (each build honours one), and no QUIC or DNS prefetch', () => {
    expect(launchOptions('chromium', proxy).args).toEqual(
      expect.arrayContaining([
        '--webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--disable-quic',
        '--dns-prefetch-disable',
      ]),
    )
  })

  it('takes SharedWorker out of Chromium, since no route sees its requests (M1.1 CI)', () => {
    expect(launchOptions('chromium', proxy).args).toContain('--disable-blink-features=SharedWorker')
  })

  it('turns WebRTC off in Firefox and sends localhost to the proxy', () => {
    expect(launchOptions('firefox', proxy).firefoxUserPrefs).toMatchObject({
      'network.proxy.allow_hijacking_localhost': true,
      'media.peerconnection.enabled': false,
      'network.webtransport.enabled': false,
    })
  })

  it('leaves Firefox service workers on, because turning them off also stops request routing (M1.1 CI)', () => {
    // With dom.serviceWorkers.enabled false, Firefox asks no interception controller about a
    // request (HttpBaseChannel::ShouldIntercept), Playwright's route included: the request limit
    // never applied in Firefox. Service workers are stopped in the page instead (render.ts).
    expect(launchOptions('firefox', proxy).firefoxUserPrefs).not.toHaveProperty([
      'dom.serviceWorkers.enabled',
    ])
  })

  it('launches a binary named in the environment, and Playwright’s own otherwise', () => {
    expect(executablePathFor('chromium', { ARABLYZER_CHROMIUM_PATH: ' /opt/chrome ' })).toBe(
      '/opt/chrome',
    )
    expect(executablePathFor('firefox', { ARABLYZER_FIREFOX_PATH: '' })).toBeUndefined()
    expect(executablePathFor('webkit', {})).toBeUndefined()
    expect(launchOptions('webkit', proxy, '/opt/webkit').executablePath).toBe('/opt/webkit')
  })
})

describe('engines that need an isolated network', () => {
  it('are WebKit, whose WebRTC goes around the proxy (see the browser SSRF suite)', () => {
    expect(NEEDS_ISOLATION).toEqual(['webkit'])
  })

  it('count as isolated only when ARABLYZER_NETWORK_ISOLATED is 1', () => {
    expect(networkIsolated({ ARABLYZER_NETWORK_ISOLATED: '1' })).toBe(true)
    expect(networkIsolated({ ARABLYZER_NETWORK_ISOLATED: ' 1 ' })).toBe(true)
    expect(networkIsolated({ ARABLYZER_NETWORK_ISOLATED: 'true' })).toBe(false)
    expect(networkIsolated({ ARABLYZER_NETWORK_ISOLATED: '0' })).toBe(false)
    expect(networkIsolated({})).toBe(false)
  })

  it('are refused elsewhere, before any browser or proxy starts', async () => {
    const [outcome] = await renderPage('http://127.0.0.1:9/', {
      engines: ['webkit'],
      networkIsolated: false,
      // Never launched: a launch would fail on this path, and the outcome would not be "refused".
      executablePaths: { webkit: '/nonexistent/webkit' },
    })
    expect(outcome).toMatchObject({
      engine: 'webkit',
      status: 'refused',
      version: null,
      durationMs: 0,
      requests: { requests: 0, refused: 0, unauthenticated: 0 },
      facts: null,
      screenshot: null,
    })
    expect(outcome?.error).toMatch(/only where the network is isolated/)
  })
})

// Measured on 2026-09-27 (macOS on Apple silicon, Playwright's WebKit 26.6): WebKit followed a
// redirect and a navigation to 127.0.0.1 straight to the local service. Isolating the network
// cannot stop that, since loopback is this machine; see the browser SSRF suite.
describe('engines that reach loopback around the proxy on this operating system', () => {
  it('are WebKit on macOS', () => {
    expect(bypassesProxyForLoopback('webkit', 'darwin')).toBe(true)
    expect(bypassesProxyForLoopback('webkit', 'linux')).toBe(false)
    expect(bypassesProxyForLoopback('chromium', 'darwin')).toBe(false)
    expect(bypassesProxyForLoopback('firefox', 'darwin')).toBe(false)
  })

  it('are refused there even where the network counts as isolated', async () => {
    const [outcome] = await renderPage('http://127.0.0.1:9/', {
      engines: ['webkit'],
      networkIsolated: true,
      platform: 'darwin',
      // Never launched: a launch would fail on this path, and the outcome would not be "refused".
      executablePaths: { webkit: '/nonexistent/webkit' },
    })
    expect(outcome).toMatchObject({ engine: 'webkit', status: 'refused', durationMs: 0 })
    expect(outcome?.error).toMatch(/on macOS .*loopback/)
  })
})

describe('an aborted render', () => {
  it('stops before any browser starts when its signal is already aborted (M1.1 review)', async () => {
    const controller = new AbortController()
    controller.abort()
    const started = performance.now()
    const [outcome] = await renderPage('http://127.0.0.1:9/', {
      engines: ['chromium'],
      signal: controller.signal,
      // Never launched: a launch would fail on this path, and the outcome would say so.
      executablePaths: { chromium: '/nonexistent/chromium' },
    })
    expect(outcome).toMatchObject({ status: 'failed', error: 'Aborted', facts: null })
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})

describe('context settings', () => {
  it('refuses downloads, and fixes screen, language and clock', () => {
    expect(contextOptions('agent')).toMatchObject({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: 'ar',
      timezoneId: 'Asia/Riyadh',
      reducedMotion: 'reduce',
      // WORKER_GUARD stops service workers; Playwright's 'block' hid their requests (M1.1 CI).
      serviceWorkers: 'allow',
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      bypassCSP: false,
      userAgent: 'agent',
    })
  })

  it('keeps the engine’s own user agent, without "Headless", and adds Arablyzer’s token', () => {
    expect(userAgentFor('Mozilla/5.0 (X11) HeadlessChrome/141.0.0.0 Safari/537.36')).toBe(
      `Mozilla/5.0 (X11) Chrome/141.0.0.0 Safari/537.36 ${BOT_TOKEN}`,
    )
    expect(BOT_TOKEN).toBe('ArablyzerBot/1.0 (+https://arablyzer.com/bot)')
  })
})

describe('the worker guard', () => {
  it('takes SharedWorker away and makes registering a service worker fail (M1.1 CI)', async () => {
    class ServiceWorkerContainer {
      register(): Promise<string> {
        return Promise.resolve('registered')
      }
    }
    const realm = vm.createContext({ SharedWorker: 'here', ServiceWorkerContainer, DOMException })
    vm.runInContext(WORKER_GUARD, realm)
    expect(vm.runInContext('typeof SharedWorker', realm)).toBe('undefined')
    await expect(new ServiceWorkerContainer().register()).rejects.toMatchObject({
      name: 'SecurityError',
    })
  })

  it('runs where neither exists', () => {
    expect(() => {
      vm.runInContext(WORKER_GUARD, vm.createContext({}))
    }).not.toThrow()
  })
})

describe('the measuring script', () => {
  it('is sent as one self-contained expression, with a stand-in for the __name helper', () => {
    const source = measureSource()
    expect(source.startsWith('(() => { const __name = (target) => target; return (')).toBe(true)
    expect(source).toContain('"maxBlocks":200')
    // Compiled, not run: it runs against a real page in the browser suite.
    expect(() => new vm.Script(source)).not.toThrow()
  })
})
