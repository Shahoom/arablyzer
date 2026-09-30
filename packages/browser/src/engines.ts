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

/** Names of environment variables that hold a secret: API keys, tokens, passwords, sessions. */
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION/i

/**
 * The environment a browser starts with: this process's, less every variable that looks like a
 * secret. A browser needs none of them, and its pages' code runs in it without a sandbox (M1.3b
 * review: the CrUX key was in the environment of every Chromium process of a lab run).
 */
export function browserEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && !SECRET_NAME.test(name)) kept[name] = value
  }
  return kept
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
 * Chromium has no SharedWorker in any realm (see WORKER_GUARD), and no fetchLater, which sends a
 * POST by a loader that no route holds (see SEND_GUARD); one flag lists both, since only the last
 * --disable-blink-features counts. Firefox keeps dom.serviceWorkers.enabled: turned off, it also
 * turns off the request routing that counts the page's requests (CI run 36279700918: with a limit
 * of 10, 61 requests reached the server instead of 9). Firefox turns CSP reporting off: a page's
 * Content-Security-Policy names an address for `report-uri`, and Firefox POSTed a report to it
 * around the browser's route, from every scan (measured on 2026-09-30, Firefox 155: two reports of
 * 362 and 406 bytes to a second server); Chromium and WebKit send such a report as a request the
 * route refuses.
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
          '--disable-blink-features=SharedWorker,FetchLaterAPI',
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
          'security.csp.reporting.enabled': false,
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
 * dedicated worker register a service worker, whose requests went out uncounted in that run:
 * see SEND_GUARD, which the render adds, for what it does about that.
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
 * Runs in every document the render loads, after WORKER_GUARD, and closes what the render's route
 * and its WebSocket routing cannot reach (M1 review, issue #29; every measurement is of 2026-09-30,
 * in Chromium 153, Firefox 155 and WebKit 26.6, with the route refusing every request that is not
 * GET or HEAD).
 *
 * No dedicated worker, and no WebSocketStream. An init script never runs in a worker, and the
 * routing that closes the page's WebSockets replaces WebSocket in the page and its frames alone, so
 * a WebSocket a worker opened connected in every engine. Firefox and WebKit also let a dedicated
 * worker register a service worker, whose requests, a POST among them, went out with no route to
 * refuse them (the browser suite recorded that in CI run 36282666726, and it sends data). So a
 * dedicated worker is off, as a shared one is: a page that feature-detects Worker goes without it,
 * and one that does not fails as it does for any script it needs, and is measured as it stands.
 * WebSocketStream, which only Chromium has, is a WebSocket that the routing does not replace.
 * WebTransport stays: QUIC is off (see launchOptions), and no engine reached a server with it.
 *
 * No pop-up a page can script: window.open gives back null, as a browser that blocks a pop-up
 * does. Playwright sets a new page up after it exists, so a request made in it at that moment, from
 * the opener's script, was not held for the route: a beacon written into a pop-up reached a second
 * server in Firefox and in WebKit, and in Firefox a beacon and a keepalive POST from a pop-up that
 * was then closed. (A pop-up the page cannot script, as a link's target=_blank opens, runs only
 * what it loads, and it is closed at once.)
 *
 * No handler runs as a page is dismissed. Chromium does not put a request made in a pagehide or
 * unload handler to the route at all, once the page navigates or reloads: every one of a beacon, a
 * keepalive POST and a plain POST or XHR reached a second server that way, some of the plain ones
 * (the route saw none). A listener the guard adds first, on window and capturing, stops the event
 * from reaching the page's own: pagehide, unload and pageswap, and visibilitychange once the page
 * is hidden. Nothing of a dismissed page is measured, so nothing is lost. (beforeunload runs before
 * the navigation starts, with the page still held: the route saw every request made in it.)
 *
 * No form is submitted, whatever starts it (the bot never submits a form: BUILD-PLAN §13). The
 * route refuses a form's POST, but Chromium and WebKit stop parsing a page when its script starts a
 * navigation, and once that is refused they never say the page has loaded: with the review's own
 * page, which submits a form as it loads, the render waited out its whole budget and ended in a
 * timeout with no facts. So submit() does nothing, and the default of every submit event is
 * prevented, and the page loads and is measured as it stands, in every engine.
 *
 * No fetchLater, which Chromium sends when the page asks, by a loader that no route holds: a POST
 * with `activateAfter: 0` reached a second server with the page staying where it was. The launch
 * flag turns it off too (see launchOptions), so that a realm this script has not reached has none.
 */
export const SEND_GUARD = `(() => {
  delete globalThis.Worker;
  delete globalThis.WebSocketStream;
  delete globalThis.fetchLater;
  Object.defineProperty(globalThis, 'open', {
    value: function open() { return null; },
    writable: true,
    enumerable: true,
    configurable: true,
  });
  const forms = globalThis.HTMLFormElement && globalThis.HTMLFormElement.prototype;
  if (forms) {
    Object.defineProperty(forms, 'submit', {
      value: function submit() {},
      writable: true,
      enumerable: true,
      configurable: true,
    });
    globalThis.addEventListener('submit', (event) => { event.preventDefault(); }, true);
  }
  const swallow = (event) => { event.stopImmediatePropagation(); };
  for (const type of ['pagehide', 'unload', 'pageswap']) globalThis.addEventListener(type, swallow, true);
  globalThis.addEventListener('visibilitychange', (event) => {
    if (globalThis.document.visibilityState === 'hidden') event.stopImmediatePropagation();
  }, true);
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
