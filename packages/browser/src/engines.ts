import type { Engine } from '@arablyzer/collectors'
import type { BrowserContextOptions, LaunchOptions } from 'playwright-core'

/** BUILD-PLAN §1: Arablyzer always identifies itself, and never poses as another bot. */
export const BOT_TOKEN = 'ArablyzerBot/1.0 (+https://arablyzer.com/bot)'

/** A phone-sized viewport (docs/design/plans/m1.1-browser.md §3). */
export const VIEWPORT = Object.freeze({ width: 390, height: 844 })
export const DEVICE_SCALE_FACTOR = 2

/**
 * Set to 1 only where the browser's network reaches nothing but the egress proxy: a container on
 * an isolated network (BUILD-PLAN §13).
 */
export const NETWORK_ISOLATED_VARIABLE = 'ARABLYZER_NETWORK_ISOLATED'

/**
 * Engines that send traffic around the egress proxy, so they render only where the network is
 * isolated (Phase 1 design §5). Measured in CI on 2026-09-26: WebKit's WebRTC reached a loopback
 * port by STUN and TURN, over UDP and TCP. Playwright's WebKit turns WebRTC on for every page it
 * drives, and has no setting that turns it off.
 */
export const NEEDS_ISOLATION: readonly Engine[] = Object.freeze(['webkit'])

/**
 * Engines that reach loopback addresses around the egress proxy on an operating system, which
 * isolating the network cannot stop, since loopback is the machine itself: they never render
 * there. Measured on 2026-09-27 (macOS on Apple silicon, Playwright's WebKit 26.6): WebKit
 * followed a redirect and a navigation to 127.0.0.1 straight to the local service, while its
 * requests from the page went to the proxy. On Linux, every one of them went to the proxy.
 */
export const LOOPBACK_BYPASS: Readonly<Partial<Record<NodeJS.Platform, readonly Engine[]>>> =
  Object.freeze({ darwin: Object.freeze(['webkit' as const]) })

export function bypassesProxyForLoopback(
  engine: Engine,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return LOOPBACK_BYPASS[platform]?.includes(engine) ?? false
}

export function networkIsolated(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env[NETWORK_ISOLATED_VARIABLE]?.trim() === '1'
}

export interface ProxySettings {
  readonly server: string
  readonly username: string
  readonly password: string
}

/**
 * Launch settings that keep every request on the egress proxy (plan §3). Measured on
 * 2026-09-26: without `<-loopback>`, Chromium sends localhost and link-local requests around the
 * proxy (Playwright adds it too, unless PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK is
 * set; the browser SSRF suite sets it, so it tests this setting); the full browser honours only
 * --webrtc-ip-handling-policy and the headless shell only --force-webrtc-ip-handling-policy, so
 * both are set; with neither, STUN reached a local UDP port. WebTransport sent QUIC to a local
 * UDP port despite --disable-quic when no proxy applied, and nothing once the proxy did.
 * Chromium has no SharedWorker in any realm (see WORKER_GUARD). Firefox keeps
 * dom.serviceWorkers.enabled: turned off, it also turns off the request routing that counts the
 * page's requests (CI run 36279700918: with a limit of 10, 61 requests reached the server
 * instead of 9).
 */
export function launchOptions(
  engine: Engine,
  proxy: ProxySettings,
  executablePath?: string,
): LaunchOptions {
  const common: LaunchOptions = {
    headless: true,
    proxy: { ...proxy, bypass: '<-loopback>' },
    ...(executablePath === undefined ? {} : { executablePath }),
  }
  switch (engine) {
    case 'chromium':
      return {
        ...common,
        args: [
          '--webrtc-ip-handling-policy=disable_non_proxied_udp',
          '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
          '--disable-quic',
          '--dns-prefetch-disable',
          '--disable-background-networking',
          '--no-pings',
          '--disable-blink-features=SharedWorker',
        ],
      }
    case 'firefox':
      return {
        ...common,
        firefoxUserPrefs: {
          'network.proxy.allow_hijacking_localhost': true,
          'network.proxy.no_proxies_on': '',
          'media.peerconnection.enabled': false,
          'network.http.http3.enable': false,
          'network.http.http3.enabled': false,
          'network.webtransport.enabled': false,
          'network.dns.disablePrefetch': true,
          'network.prefetch-next': false,
          'network.predictor.enabled': false,
          'browser.send_pings': false,
        },
      }
    case 'webkit':
      return common
  }
}

/**
 * Runs in every document the page loads, before its own scripts: SharedWorker is gone, and
 * registering a service worker fails. No engine ties either kind's requests to the page, so the
 * browser's request count never sees them (measured in Chromium 141 on 2026-09-27: 30 of 30 past
 * a limit of 10; Firefox's source says so for both). Playwright's serviceWorkers: 'block'
 * replaced only navigator.serviceWorker.register, which the prototype still offered (M1.1
 * review). In Chromium, SharedWorker is off in every realm (see launchOptions), and this script
 * ran in a new frame or pop-up before the page could reach it (measured); so it did in Firefox and
 * WebKit (CI run 36282666726). Init scripts never run in workers, and Firefox and WebKit let a
 * dedicated worker register a service worker, whose requests went out uncounted in that run; the
 * browser suite records it.
 */
export const WORKER_GUARD = `(() => {
  delete globalThis.SharedWorker;
  const container = globalThis.ServiceWorkerContainer;
  if (typeof container !== 'function') return;
  Object.defineProperty(container.prototype, 'register', {
    value: function register(scriptURL) {
      return Promise.reject(new DOMException('Service workers are off in this browser', 'SecurityError'));
    },
    writable: true,
    enumerable: true,
    configurable: true,
  });
})();`

/**
 * A fresh context per render: fixed screen, language and clock, nothing kept between scans.
 * Service workers are stopped by WORKER_GUARD rather than Playwright: its 'block' also hides a
 * Chromium service worker's requests from the route, and 'allow' lets the route count them.
 */
export function contextOptions(userAgent: string): BrowserContextOptions {
  return {
    viewport: { ...VIEWPORT },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    locale: 'ar',
    timezoneId: 'Asia/Riyadh',
    reducedMotion: 'reduce',
    colorScheme: 'light',
    serviceWorkers: 'allow',
    acceptDownloads: false,
    javaScriptEnabled: true,
    ignoreHTTPSErrors: false,
    bypassCSP: false,
    userAgent,
  }
}

/** The engine's own user agent, without "Headless", with Arablyzer's token added. */
export function userAgentFor(engineAgent: string, token: string = BOT_TOKEN): string {
  return `${engineAgent.replace(/HeadlessChrome/g, 'Chrome')} ${token}`
}

const PATH_VARIABLES: Readonly<Record<Engine, string>> = {
  chromium: 'ARABLYZER_CHROMIUM_PATH',
  firefox: 'ARABLYZER_FIREFOX_PATH',
  webkit: 'ARABLYZER_WEBKIT_PATH',
}

/** A browser binary named in the environment (local builds); Playwright's own otherwise. */
export function executablePathFor(
  engine: Engine,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const value = env[PATH_VARIABLES[engine]]?.trim()
  return value === undefined || value === '' ? undefined : value
}
