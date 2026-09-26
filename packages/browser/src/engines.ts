import type { Engine } from '@arablyzer/collectors'
import type { BrowserContextOptions, LaunchOptions } from 'playwright-core'

/** BUILD-PLAN §1: Arablyzer always identifies itself, and never poses as another bot. */
export const BOT_TOKEN = 'ArablyzerBot/1.0 (+https://arablyzer.com/bot)'

/** A phone-sized viewport (docs/design/plans/m1.1-browser.md §3). */
export const VIEWPORT = Object.freeze({ width: 390, height: 844 })
export const DEVICE_SCALE_FACTOR = 2

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
 * both are set; with neither, STUN reached a local UDP port.
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
          'network.dns.disablePrefetch': true,
          'network.prefetch-next': false,
          'network.predictor.enabled': false,
          'dom.serviceWorkers.enabled': false,
          'browser.send_pings': false,
        },
      }
    case 'webkit':
      return common
  }
}

/** A fresh context per render: fixed screen, language and clock, nothing kept between scans. */
export function contextOptions(userAgent: string): BrowserContextOptions {
  return {
    viewport: { ...VIEWPORT },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    locale: 'ar',
    timezoneId: 'Asia/Riyadh',
    reducedMotion: 'reduce',
    colorScheme: 'light',
    serviceWorkers: 'block',
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
