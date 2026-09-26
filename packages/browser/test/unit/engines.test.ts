import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  BOT_TOKEN,
  NEEDS_ISOLATION,
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

  it('turns WebRTC off in Firefox and sends localhost to the proxy', () => {
    expect(launchOptions('firefox', proxy).firefoxUserPrefs).toMatchObject({
      'network.proxy.allow_hijacking_localhost': true,
      'media.peerconnection.enabled': false,
      'network.webtransport.enabled': false,
      'dom.serviceWorkers.enabled': false,
    })
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
  it('blocks service workers and downloads, and fixes screen, language and clock', () => {
    expect(contextOptions('agent')).toMatchObject({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: 'ar',
      timezoneId: 'Asia/Riyadh',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
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

describe('the measuring script', () => {
  it('is sent as one self-contained expression, with a stand-in for the __name helper', () => {
    const source = measureSource()
    expect(source.startsWith('(() => { const __name = (target) => target; return (')).toBe(true)
    expect(source).toContain('"maxBlocks":200')
    // Compiled, not run: it runs against a real page in the browser suite.
    expect(() => new vm.Script(source)).not.toThrow()
  })
})
