import {
  BOT_TOKEN,
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
import { chromium } from 'playwright-core'
import puppeteer, { type Browser } from 'puppeteer-core'

/** The Lighthouse this package runs; the report names it, since its metrics change by version. */
export const LIGHTHOUSE_VERSION = '13.5.0'

/** M1.3 plan §0: a Lighthouse run gets 60 s, then its browser is killed. */
export const LAB_TIMEOUT_MS = 60_000

/** Lighthouse 13's weighted performance metrics (core/config/default-config.js). */
const LAB_AUDITS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
] as const

/** A browser gets this long to close by itself before it is killed, as in the render. */
const CLOSE_GRACE_MS = 5_000

export interface LabOptions {
  readonly policy?: EgressPolicy
  readonly resolver?: Resolver
  /** LAB_TIMEOUT_MS by default; never more. */
  readonly timeoutMs?: number
  /** Requests the page may make, as in the render (BUILD-PLAN §11: 300). */
  readonly maxRequests?: number
  /** Chromium's binary; ARABLYZER_CHROMIUM_PATH, else Playwright's Chromium. */
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

export type LabStatus = 'measured' | 'failed' | 'timeout' | 'unavailable'

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
  /** Lighthouse's performance score, 0 to 100: information, never part of Arablyzer's score. */
  readonly performance: number | null
  readonly metrics: LabMetrics | null
}

class LabTimeout extends Error {}

/**
 * Runs Lighthouse's performance category on the page, once, in Chromium on an emulated phone
 * with simulated throttling. The browser is launched as the render's is, behind its own egress
 * proxy with the same flags, over a pipe (no debugging port); the page answers the proxy's
 * credentials, and its requests are counted and stopped at the render's limit. Lab metrics vary
 * from run to run, so they are reported, never judged (M1.3 plan §1). Never throws for what the
 * page does.
 */
export async function runLab(url: string, options: LabOptions = {}): Promise<LabRun> {
  const started = performance.now()
  const budgetMs = Math.min(options.timeoutMs ?? LAB_TIMEOUT_MS, LAB_TIMEOUT_MS)
  const counts = { made: 0, refused: 0 }
  let version: string | null = null
  const finish = (
    status: LabStatus,
    error: string | null,
    result: Pick<LabRun, 'performance' | 'metrics'> = { performance: null, metrics: null },
  ): LabRun => ({
    status,
    lighthouse: LIGHTHOUSE_VERSION,
    chromium: version,
    error,
    durationMs: Math.round(performance.now() - started),
    requests: { total: counts.made, refused: counts.refused + proxy.stats().refused },
    ...result,
  })
  const proxy = await startProxy({
    policy: options.policy ?? DEFAULT_POLICY,
    ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
  })
  if (options.signal?.aborted === true) {
    await proxy.close()
    return finish('failed', 'Aborted')
  }
  const executablePath =
    options.executablePath ?? executablePathFor('chromium') ?? chromium.executablePath()
  // The render's own flags, and its proxy; puppeteer-core passes them on the command line.
  const settings = launchOptions('chromium', {
    server: proxy.url,
    username: proxy.username,
    password: proxy.password,
  })
  const launching = puppeteer.launch({
    executablePath,
    headless: true,
    pipe: true,
    defaultViewport: null,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    timeout: budgetMs,
    args: [
      ...(settings.args ?? []),
      `--proxy-server=${proxy.url}`,
      '--proxy-bypass-list=<-loopback>',
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
  const aborted = new Promise<never>((_resolve, reject) => {
    options.signal?.addEventListener(
      'abort',
      () => {
        reject(new Error('Aborted'))
      },
      { once: true },
    )
  })
  aborted.catch(() => undefined)
  let stuck = false
  try {
    const work = (async () => {
      const browser = await launching
      version = await browser.version()
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
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
          maxWaitForLoad: Math.max(1_000, budgetMs - 15_000),
          // Lighthouse's phone, with Arablyzer's token: it never poses as another visitor.
          emulatedUserAgent: `${userAgents.mobile} ${BOT_TOKEN}`,
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
    // Measured means a score: each of its five metrics measured. A page that never painted, for
    // one, has none, and each metric's audit says why.
    const { performance, metrics, error } = resultOf(lhr)
    return performance === null
      ? finish('failed', error ?? 'Lighthouse measured no score', { performance, metrics })
      : finish('measured', null, { performance, metrics })
  } catch (error) {
    if (error instanceof LabTimeout) {
      stuck = true
      return finish('timeout', error.message)
    }
    const message = error instanceof Error ? error.message : String(error)
    if (/ENOENT|executable doesn't exist|Browser was not found|Failed to launch/i.test(message)) {
      return finish('unavailable', firstLine(message))
    }
    stuck = true
    return finish('failed', firstLine(message))
  } finally {
    clearTimeout(timer)
    // The proxy closes first, so nothing the page left behind goes out uncounted (render.ts).
    await proxy.close()
    await shutDown(launching, stuck)
  }
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
}): Pick<LabRun, 'performance' | 'metrics'> & { readonly error: string | null } {
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

/** Closes the browser, and kills it when it is stuck or does not close in time. */
async function shutDown(launching: Promise<Browser>, stuck: boolean): Promise<void> {
  const browser = await launching.catch(() => undefined)
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
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, CLOSE_GRACE_MS).unref()),
  ])
  // A browser that did not close within its grace, or whose process is still there, is killed.
  const child = browser.process()
  if (child !== null && child.exitCode === null && child.signalCode === null) kill()
}

function firstLine(message: string): string {
  return message.split('\n')[0]?.slice(0, 500) ?? ''
}
