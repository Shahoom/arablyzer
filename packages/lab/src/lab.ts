import {
  BOT_TOKEN,
  browserEnvironment,
  executablePathFor,
  launchOptions,
  WORKER_GUARD,
} from '@arablyzer/browser/engines'
import {
  DEFAULT_MAX_REQUESTS,
  DEFAULT_POLICY,
  startProxy,
  type EgressPolicy,
  type Resolver,
} from '@arablyzer/egress'
import lighthouse from 'lighthouse'
import { userAgents } from 'lighthouse/core/config/constants.js'
import playwrightCore from 'playwright-core/lib/coreBundle'
import puppeteer, { TargetType, type Browser, type Target } from 'puppeteer-core'

/** The Lighthouse this package runs; the report names it, since its metrics change by version. */
export const LIGHTHOUSE_VERSION = '13.5.0'

/** M1.3 plan §0: a Lighthouse run gets 60 s, then its browser is killed. */
export const LAB_TIMEOUT_MS = 60_000

/** What a run needs beyond the page load: starting Chromium, and Lighthouse's own work after. */
const OVERHEAD_MS = 15_000

/** Lighthouse 13's weighted performance metrics (core/config/default-config.js). */
const LAB_AUDITS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
] as const

/** Lighthouse's warning when the page had not loaded by maxWaitForLoad (driver/navigation.js). */
const LOAD_TIMED_OUT = 'The page loaded too slowly to finish within the time limit.'

/** A browser gets this long to close by itself before it is killed, as in the render. */
const CLOSE_GRACE_MS = 5_000

export interface LabOptions {
  readonly policy?: EgressPolicy
  readonly resolver?: Resolver
  /** LAB_TIMEOUT_MS by default; never more. */
  readonly timeoutMs?: number
  /** Requests the page may make, as in the render (BUILD-PLAN §11: 300). */
  readonly maxRequests?: number
  /** Chromium's binary; ARABLYZER_CHROMIUM_PATH, else Playwright's headless shell. */
  readonly executablePath?: string
  readonly signal?: AbortSignal
}

/** Lighthouse's lab metrics on its emulated phone: milliseconds, and CLS without a unit. */
export interface LabMetrics {
  readonly fcp: number | null
  readonly lcp: number | null
  readonly tbt: number | null
  readonly si: number | null
  readonly cls: number | null
}

/**
 * measured: a score and its five metrics. timeout: out of time, or the page had not loaded when
 * Lighthouse stopped waiting. unavailable: Chromium or Lighthouse is not installed. skipped: the
 * scan left no time to start it.
 */
export type LabStatus = 'measured' | 'failed' | 'timeout' | 'unavailable' | 'skipped'

export interface LabRun {
  readonly status: LabStatus
  readonly lighthouse: string
  /** The Chromium it ran in; null when it did not start. */
  readonly chromium: string | null
  /** English detail for logs; the report maps the status to its own words. */
  readonly error: string | null
  readonly durationMs: number
  /** The page's requests as the browser counted them, and those not let through. */
  readonly requests: { readonly total: number; readonly refused: number }
  /** The page reached the request limit, so some of its requests never went out. */
  readonly limited: boolean
  /** Lighthouse's performance score, 0 to 100: information, never part of Arablyzer's score. */
  readonly performance: number | null
  /** Only for a measured run. */
  readonly metrics: LabMetrics | null
}

class LabTimeout extends Error {}

/**
 * Runs the five metrics of Lighthouse's performance score on the page, once, on an emulated phone
 * with simulated throttling. It runs in the render's browser, Playwright's headless shell, launched
 * over a pipe (no debugging port) with the render's flags, behind its own egress proxy: the page
 * answers the proxy's credentials, its requests are counted and stopped at the render's limit, and
 * pop-ups are blocked. Lab metrics vary from run to run, so they are reported, never judged (M1.3
 * plan §1). Never throws for what the page does.
 *
 * Lighthouse drives its own navigation over the DevTools protocol, and puppeteer intercepts
 * requests, not responses, so a bot challenge cannot be stopped before its scripts run here, as the
 * render stops it (M2.3c review). The engine runs Lighthouse only for a page whose plain fetch was
 * not a challenge and where no browser of the render was answered one; a scan that asks for it
 * without a render has no such warning to go by.
 */
export async function runLab(url: string, options: LabOptions = {}): Promise<LabRun> {
  const started = performance.now()
  const budgetMs = Math.min(options.timeoutMs ?? LAB_TIMEOUT_MS, LAB_TIMEOUT_MS)
  const counts = { made: 0, refused: 0 }
  let version: string | null = null
  const proxy = await startProxy({
    policy: options.policy ?? DEFAULT_POLICY,
    ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
  })
  const finish = (
    status: LabStatus,
    error: string | null,
    performance: number | null = null,
    metrics: LabMetrics | null = null,
  ): LabRun => ({
    status,
    lighthouse: LIGHTHOUSE_VERSION,
    chromium: version,
    error,
    durationMs: Math.round(globalThis.performance.now() - started),
    requests: { total: counts.made, refused: counts.refused + proxy.stats().refused },
    limited: counts.refused > 0 || proxy.stats().limited,
    performance,
    metrics,
  })
  if (options.signal?.aborted === true) {
    await proxy.close()
    return finish('failed', 'Aborted')
  }
  let executablePath: string
  try {
    executablePath = options.executablePath ?? executablePathFor('chromium') ?? headlessShell()
  } catch (error) {
    await proxy.close()
    return finish('unavailable', firstLine(errorText(error)))
  }
  // The render's own flags and proxy, on the command line, with the bot's token for every page.
  const userAgent = `${userAgents.mobile} ${BOT_TOKEN}`
  const settings = launchOptions('chromium', {
    server: proxy.url,
    username: proxy.username,
    password: proxy.password,
  })
  // Out of time or aborted, the launch stops too, and puppeteer closes what it started.
  const stop = AbortSignal.any([
    AbortSignal.timeout(budgetMs),
    ...(options.signal === undefined ? [] : [options.signal]),
  ])
  const launching = puppeteer.launch({
    executablePath,
    headless: 'shell',
    pipe: true,
    defaultViewport: null,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    timeout: budgetMs,
    protocolTimeout: budgetMs,
    signal: stop,
    // No key or token of this process reaches a browser that runs pages' code.
    env: browserEnvironment(),
    args: [
      ...(settings.args ?? []),
      `--proxy-server=${proxy.url}`,
      '--proxy-bypass-list=<-loopback>',
      `--user-agent=${userAgent}`,
      // Pop-ups never open: none escapes the request count, the worker guard or the user agent.
      '--block-new-web-contents',
      // As Playwright launches the render's Chromium: the container is the boundary.
      '--no-sandbox',
    ],
  })
  launching.catch(() => undefined)
  let timer: NodeJS.Timeout | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new LabTimeout(`Lighthouse did not finish within ${budgetMs} ms`))
    }, budgetMs)
  })
  expired.catch(() => undefined)
  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(new Error('Aborted'))
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
  })
  aborted.catch(() => undefined)
  let stuck = false
  try {
    const work = (async () => {
      const browser = await launching
      version = await browser.version()
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      // Anything else that opens in the context is closed at once, as the render closes pop-ups.
      context.on('targetcreated', (target: Target) => {
        if (target.type() !== TargetType.PAGE) return
        void target.page().then(
          (other) => (other !== null && other !== page ? other.close() : undefined),
          () => undefined,
        )
      })
      await page.authenticate({ username: proxy.username, password: proxy.password })
      await page.evaluateOnNewDocument(WORKER_GUARD)
      const max = options.maxRequests ?? DEFAULT_MAX_REQUESTS
      await page.setRequestInterception(true)
      page.on('request', (request) => {
        if (request.isInterceptResolutionHandled()) return
        counts.made++
        if (counts.made > max) {
          counts.refused++
          request.abort('blockedbyclient').catch(() => undefined)
        } else {
          request.continue().catch(() => undefined)
        }
      })
      // What the budget leaves for the page to load, after starting Chromium and before Lighthouse
      // works out its metrics.
      const loadWait = Math.max(5_000, budgetMs - OVERHEAD_MS)
      const result = await lighthouse(
        url,
        {
          output: 'json',
          logLevel: 'error',
          // The five metrics its performance score weighs (10, 25, 30, 25, 10), alone: the score
          // is the same, fewer gatherers run, and none of them holds the process open after the
          // run (the image gatherer's 5 s timer, image-elements.js, measured 2026-09-28). With
          // onlyCategories too, Lighthouse would add these to the whole category (filters.js).
          onlyAudits: [...LAB_AUDITS],
          formFactor: 'mobile',
          throttlingMethod: 'simulate',
          disableFullPageScreenshot: true,
          // No error reporting: Lighthouse starts Sentry from its own CLI alone (cli/bin.js), and
          // its library, used here, keeps the no-op in core/lib/sentry.js.
          maxWaitForLoad: loadWait,
          maxWaitForFcp: Math.min(30_000, loadWait),
          // Lighthouse's phone, with Arablyzer's token: it never poses as another visitor.
          emulatedUserAgent: userAgent,
        },
        undefined,
        page,
      )
      return result?.lhr
    })()
    work.catch(() => undefined)
    const lhr = await Promise.race([work, expired, aborted])
    if (lhr === undefined) return finish('failed', 'Lighthouse returned no result')
    if (lhr.runtimeError !== undefined) {
      return finish('failed', `${lhr.runtimeError.code}: ${lhr.runtimeError.message}`)
    }
    // A page still loading when Lighthouse stopped waiting gives numbers of a page not yet there.
    if (lhr.runWarnings.some((warning) => warning.startsWith(LOAD_TIMED_OUT))) {
      return finish('timeout', LOAD_TIMED_OUT)
    }
    // Measured means a score: each of its five metrics measured. A page that never painted, for
    // one, has none, and each metric's audit says why.
    const { performance, metrics, error } = resultOf(lhr)
    return performance === null
      ? finish('failed', error ?? 'Lighthouse measured no score')
      : finish('measured', null, performance, metrics)
  } catch (error) {
    if (error instanceof LabTimeout || stop.aborted) {
      stuck = true
      return finish('timeout', `Lighthouse did not finish within ${budgetMs} ms`)
    }
    const message = errorText(error)
    if (/ENOENT|executable doesn't exist|Browser was not found|Failed to launch/i.test(message)) {
      return finish('unavailable', firstLine(message))
    }
    stuck = true
    return finish('failed', firstLine(message))
  } finally {
    clearTimeout(timer)
    if (onAbort !== undefined) options.signal?.removeEventListener('abort', onAbort)
    // The proxy closes first, so nothing the page left behind goes out uncounted (render.ts).
    await proxy.close()
    await shutDown(launching, stuck)
  }
}

/**
 * Playwright's headless shell, which the render runs: Playwright names it in its registry, which
 * its package exports as lib/coreBundle. Pinned with playwright-core, and tested (lab tests).
 */
function headlessShell(): string {
  const path = playwrightCore.registry.registry
    .findExecutable('chromium-headless-shell')
    ?.executablePath('javascript')
  if (path === undefined) throw new Error("Playwright's headless shell is not in its registry")
  return path
}

/**
 * A Lighthouse result's performance score and lab metrics, and the first error of a metric it
 * could not measure.
 */
export function resultOf(lhr: {
  readonly audits: Readonly<
    Record<
      string,
      { readonly numericValue?: number | undefined; readonly errorMessage?: string | undefined }
    >
  >
  readonly categories: Readonly<Record<string, { readonly score: number | null } | undefined>>
}): {
  readonly performance: number | null
  readonly metrics: LabMetrics
  readonly error: string | null
} {
  const value = (id: string) => {
    const number = lhr.audits[id]?.numericValue
    return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null
  }
  const ms = (id: string) => {
    const number = value(id)
    return number === null ? null : Math.round(number)
  }
  const cls = value('cumulative-layout-shift')
  const score = lhr.categories.performance?.score ?? null
  const error = LAB_AUDITS.map((id) => lhr.audits[id]?.errorMessage).find(
    (message) => message !== undefined && message !== '',
  )
  return {
    error: error === undefined ? null : firstLine(error),
    performance:
      typeof score === 'number' && score >= 0 && score <= 1 ? Math.round(score * 100) : null,
    metrics: {
      fcp: ms('first-contentful-paint'),
      lcp: ms('largest-contentful-paint'),
      tbt: ms('total-blocking-time'),
      si: ms('speed-index'),
      cls: cls === null ? null : Math.round(cls * 1000) / 1000,
    },
  }
}

/**
 * Closes the browser, and kills it when it is stuck, does not close in time, or leaves its process
 * behind. A launch that never settled is waited for only as long.
 */
async function shutDown(launching: Promise<Browser>, stuck: boolean): Promise<void> {
  const grace = <T>(promise: Promise<T>) =>
    Promise.race([
      promise,
      new Promise<undefined>((resolve) => setTimeout(resolve, CLOSE_GRACE_MS, undefined).unref()),
    ])
  const browser = await grace(launching.catch(() => undefined))
  if (browser === undefined) return
  const kill = () => {
    try {
      browser.process()?.kill('SIGKILL')
    } catch {
      // Already gone.
    }
  }
  if (stuck) {
    kill()
    return
  }
  await grace(browser.close().catch(() => undefined))
  const child = browser.process()
  if (child !== null && child.exitCode === null && child.signalCode === null) kill()
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function firstLine(message: string): string {
  return message.split('\n')[0]?.slice(0, 500) ?? ''
}
