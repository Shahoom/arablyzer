import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  BOT_TOKEN,
  NEEDS_ISOLATION,
  SEND_GUARD,
  WORKER_GUARD,
  browserEnvironment,
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

  it('takes SharedWorker and fetchLater out of Chromium, since no route sees their requests (M1.1 CI, M1 review)', () => {
    // One flag lists both: Chromium counts only the last --disable-blink-features.
    const flags = (launchOptions('chromium', proxy).args ?? []).filter((arg) =>
      arg.startsWith('--disable-blink-features='),
    )
    expect(flags).toEqual(['--disable-blink-features=SharedWorker,FetchLaterAPI'])
  })

  it('turns WebRTC off in Firefox and sends localhost to the proxy', () => {
    expect(launchOptions('firefox', proxy).firefoxUserPrefs).toMatchObject({
      'network.proxy.allow_hijacking_localhost': true,
      'media.peerconnection.enabled': false,
      'network.webtransport.enabled': false,
    })
  })

  it('turns CSP reporting off in Firefox, whose reports go around the browser’s route (M1 review)', () => {
    // A page's report-uri names an address, and Firefox POSTed to it from every scan, with no
    // route in the way (the browser suite's sending tests show it, per engine).
    expect(launchOptions('firefox', proxy).firefoxUserPrefs).toMatchObject({
      'security.csp.reporting.enabled': false,
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

describe('the limit of hosts', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses %s, before any browser or proxy starts (M1 review)',
    async (maxHosts) => {
      await expect(
        renderPage('http://127.0.0.1:9/', {
          engines: ['chromium'],
          maxHosts,
          // Never launched: the limit is checked first.
          executablePaths: { chromium: '/nonexistent/chromium' },
        }),
      ).rejects.toThrow(TypeError)
    },
  )
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

  it('leaves dedicated workers to the render, which turns them off with the send guard', () => {
    // Lighthouse runs this guard too, and its browser is not held to the send guard yet.
    const realm = vm.createContext({ Worker: 'here', WebSocketStream: 'here' })
    vm.runInContext(WORKER_GUARD, realm)
    expect(vm.runInContext('typeof Worker', realm)).toBe('string')
    expect(vm.runInContext('typeof WebSocketStream', realm)).toBe('string')
  })

  it('runs where neither exists', () => {
    expect(() => {
      vm.runInContext(WORKER_GUARD, vm.createContext({}))
    }).not.toThrow()
  })
})

describe('the send guard', () => {
  /** A page's world: the guard is run in it, and the listeners it adds to the window are kept. */
  function world(extra: Record<string, unknown> = {}) {
    const listeners: { type: string; listener: (event: unknown) => void; capture: unknown }[] = []
    const realm = vm.createContext({
      Worker: 'here',
      WebSocketStream: 'here',
      SharedWorker: 'here',
      WebSocket: 'here',
      fetchLater: 'here',
      open: () => 'a window',
      document: { visibilityState: 'visible' },
      addEventListener: (type: string, listener: (event: unknown) => void, capture: unknown) =>
        listeners.push({ type, listener, capture }),
      ...extra,
    })
    vm.runInContext('globalThis.globalThis = globalThis', realm)
    vm.runInContext(SEND_GUARD, realm)
    return { realm, listeners }
  }

  it('takes dedicated workers, WebSocketStream and fetchLater away, whose requests no route holds (M1 review)', () => {
    const { realm } = world()
    for (const name of ['Worker', 'WebSocketStream', 'fetchLater']) {
      expect(vm.runInContext(`typeof ${name}`, realm), name).toBe('undefined')
    }
    // WebSocket itself is Playwright's to replace, so that a page's socket closes and says so.
    expect(vm.runInContext('typeof WebSocket', realm)).toBe('string')
    expect(vm.runInContext('typeof SharedWorker', realm)).toBe('string')
  })

  it('gives a page nothing to script when it opens a pop-up', () => {
    const { realm } = world()
    expect(vm.runInContext("open('about:blank')", realm)).toBeNull()
    expect(vm.runInContext("globalThis.open('/x', '_blank', 'popup')", realm)).toBeNull()
  })

  it('stops the events of a page’s dismissal before any handler of the page sees them', () => {
    const { listeners } = world()
    const stopped: string[] = []
    const event = (type: string) => ({
      type,
      stopImmediatePropagation: () => stopped.push(type),
    })
    // Capturing, and the first on the window, so that it runs before the page's own listeners.
    expect(listeners.map(({ type, capture }) => [type, capture])).toEqual([
      ['pagehide', true],
      ['unload', true],
      ['pageswap', true],
      ['visibilitychange', true],
    ])
    for (const { type, listener } of listeners) listener(event(type))
    // A page that is only visible again is left alone: visibilitychange stops only when hidden.
    expect(stopped).toEqual(['pagehide', 'unload', 'pageswap'])
  })

  it('stops visibilitychange once the page is hidden', () => {
    const document = { visibilityState: 'hidden' }
    const { listeners } = world({ document })
    const stopped: string[] = []
    const change = listeners.find(({ type }) => type === 'visibilitychange')
    change?.listener({ stopImmediatePropagation: () => stopped.push('visibilitychange') })
    expect(stopped).toEqual(['visibilitychange'])
  })

  it('submits no form: submit() does nothing, and the default of a submit event is prevented', () => {
    class HTMLFormElement {
      submit(): string {
        return 'submitted'
      }
    }
    const { realm, listeners } = world({ HTMLFormElement })
    expect(vm.runInContext('new HTMLFormElement().submit()', realm)).toBeUndefined()
    expect(vm.runInContext('HTMLFormElement.prototype.submit.call({})', realm)).toBeUndefined()
    const prevented: string[] = []
    const submit = listeners.find(({ type }) => type === 'submit')
    expect(submit?.capture).toBe(true)
    submit?.listener({ preventDefault: () => prevented.push('submit') })
    expect(prevented).toEqual(['submit'])
  })

  it('runs where none of them exists', () => {
    expect(() => {
      vm.runInContext('globalThis.globalThis = globalThis', vm.createContext({}))
      vm.runInContext(
        SEND_GUARD,
        vm.createContext({ addEventListener: () => undefined, document: {} }),
      )
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

describe('browserEnvironment', () => {
  it('starts browsers without any variable that looks like a secret (M1.3b review)', () => {
    expect(
      browserEnvironment({
        PATH: '/usr/bin',
        HOME: '/home/scanner',
        LANG: 'ar_OM.UTF-8',
        ARABLYZER_CRUX_API_KEY: 'k',
        GITHUB_TOKEN: 't',
        AWS_SECRET_ACCESS_KEY: 's',
        DATABASE_PASSWORD: 'p',
        UNSET: undefined,
      }),
    ).toEqual({ PATH: '/usr/bin', HOME: '/home/scanner', LANG: 'ar_OM.UTF-8' })
  })
})
