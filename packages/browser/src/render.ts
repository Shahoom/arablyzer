/// <reference lib="dom" />
import type {
  A11yFacts,
  Engine,
  FontRequestFact,
  RenderedFacts,
  UsedFontsFact,
} from '@arablyzer/collectors'
import {
  DEFAULT_MAX_REQUESTS,
  DEFAULT_POLICY,
  redactUrl,
  startProxy,
  type EgressPolicy,
  type EgressProxy,
  type ProxyStats,
  type Resolver,
} from '@arablyzer/egress'
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserServer,
  type BrowserType,
  type Page,
  type Request,
  type Response,
} from 'playwright-core'
import {
  BOT_TOKEN,
  bypassesProxyForLoopback,
  contextOptions,
  executablePathFor,
  launchOptions,
  NEEDS_ISOLATION,
  NETWORK_ISOLATED_VARIABLE,
  networkIsolated,
  userAgentFor,
  WORKER_GUARD,
} from './engines'
import { axeRunnerSource, axeSource, toA11yFacts } from './a11y'
import { readPageFiles } from './files'
import { DECODED_SIZES, fromPage, inPage, RESULT_GUARD, throughGuard } from './guard'
import { measureSource } from './measure'
import { measuredFontFaces, toFacts } from './validate'

/** BUILD-PLAN §11: 30 s for the page load, 20 s for each further engine. */
export const RENDER_TIMEOUT_MS = 30_000
export const EXTRA_ENGINE_TIMEOUT_MS = 20_000
/** Waiting for web fonts and for the network to go quiet, within the engine's budget. */
const SETTLE_CAP_MS = 5_000
const QUIET_MS = 500
const MAX_FONT_REQUESTS = 50
const MAX_PROBED_FAMILIES = 10
/**
 * A browser gets this long to close by itself, and is then killed: a page that holds its main
 * thread can keep an engine from closing (WebKit took 30 s in CI).
 */
const CLOSE_GRACE_MS = 5_000
/** A killed browser whose processes have not all exited by then is left to exit on its own. */
const KILL_WAIT_MS = 5_000
/** axe-core's curated rules, within the engine's budget: 36–124 ms on a small page. */
const AXE_CAP_MS = 10_000
/** How long the used-fonts probes wait for their fonts, once the settle step is over. */
const PROBE_FONTS_CAP_MS = 2_000
/** Reading the stylesheets and font files the page loaded, within the engine's budget. */
const FILES_CAP_MS = 5_000
/** Stylesheet and font responses kept for reading: as many as a page may make requests. */
const MAX_FILE_RESPONSES = DEFAULT_MAX_REQUESTS
/** Every Arabic letter, to ask which font draws them. */
const ARABIC_SAMPLE = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'

const TYPES: Readonly<Record<Engine, BrowserType>> = { chromium, firefox, webkit }

export interface RenderOptions {
  readonly engines: readonly Engine[]
  readonly policy?: EgressPolicy
  readonly resolver?: Resolver
  /** Added to the engine's own user agent. */
  readonly botToken?: string
  readonly timeoutMs?: number
  readonly extraEngineTimeoutMs?: number
  readonly screenshots?: boolean
  readonly signal?: AbortSignal
  /** Browser binaries by engine; the ARABLYZER_<ENGINE>_PATH variables by default. */
  readonly executablePaths?: Partial<Record<Engine, string>>
  /**
   * Whether the network here reaches nothing but the egress proxy; ARABLYZER_NETWORK_ISOLATED by
   * default. Engines in NEEDS_ISOLATION are refused without it.
   */
  readonly networkIsolated?: boolean
  /** The operating system, for LOOPBACK_BYPASS; process.platform by default. */
  readonly platform?: NodeJS.Platform
  /**
   * Requests a page may make per engine (BUILD-PLAN §11: 300). The browser counts them, since
   * the proxy sees only the tunnel of an HTTPS connection, not the requests inside it.
   */
  readonly maxRequests?: number
}

/**
 * The page's requests as the browser's route counted them: every one, including those inside
 * HTTPS connections, which the proxy sees only as tunnels (the owner's sites, 2026-09-27: dozens
 * of files over two connections), and those refused past maxRequests, which never reach it.
 */
export interface PageRequests {
  readonly made: number
  /** Refused past maxRequests. */
  readonly overLimit: number
}

export type RenderStatus = 'rendered' | 'failed' | 'timeout' | 'unavailable' | 'refused'

export interface RenderOutcome {
  readonly engine: Engine
  readonly status: RenderStatus
  readonly version: string | null
  /** English detail for logs; the report maps the status to its own words. */
  readonly error: string | null
  readonly durationMs: number
  /** What the egress proxy saw: an HTTPS connection is one tunnel, however many requests it carries. */
  readonly requests: ProxyStats
  /** What the page asked for, as the browser counted it (see PageRequests). */
  readonly pageRequests: PageRequests
  readonly facts: RenderedFacts | null
  readonly screenshot: Uint8Array | null
}

/** The page's request count against maxRequests, kept by the browser's route. */
interface RequestBudget {
  readonly max: number
  made: number
  overLimit: number
  reached: boolean
}

class RenderTimeout extends Error {}
class RenderAborted extends Error {}

const NO_PAGE_REQUESTS: PageRequests = Object.freeze({ made: 0, overLimit: 0 })

const NO_REQUESTS: ProxyStats = Object.freeze({
  requests: 0,
  refused: 0,
  unauthenticated: 0,
  limited: false,
  bytes: 0,
  refusals: Object.freeze([]),
})

/**
 * Renders the page in each engine, one after the other (one browser at a time, BUILD-PLAN
 * §18.3.1), each with a new browser, context and egress proxy. Never throws for what the page
 * does; the outcome says what happened.
 */
export async function renderPage(url: string, options: RenderOptions): Promise<RenderOutcome[]> {
  const outcomes: RenderOutcome[] = []
  for (const [index, engine] of options.engines.entries()) {
    const budget =
      index === 0
        ? (options.timeoutMs ?? RENDER_TIMEOUT_MS)
        : (options.extraEngineTimeoutMs ?? EXTRA_ENGINE_TIMEOUT_MS)
    outcomes.push(await renderIn(engine, url, budget, options))
  }
  return outcomes
}

async function renderIn(
  engine: Engine,
  url: string,
  budgetMs: number,
  options: RenderOptions,
): Promise<RenderOutcome> {
  if (NEEDS_ISOLATION.includes(engine) && !(options.networkIsolated ?? networkIsolated())) {
    return {
      engine,
      status: 'refused',
      version: null,
      error: `${engine} sends traffic around the egress proxy, so it renders only where the network is isolated (${NETWORK_ISOLATED_VARIABLE}=1)`,
      durationMs: 0,
      requests: NO_REQUESTS,
      pageRequests: NO_PAGE_REQUESTS,
      facts: null,
      screenshot: null,
    }
  }
  if (bypassesProxyForLoopback(engine, options.platform)) {
    return {
      engine,
      status: 'refused',
      version: null,
      error: `${engine} on macOS reaches loopback addresses around the egress proxy, which an isolated network cannot stop, so it never renders there`,
      durationMs: 0,
      requests: NO_REQUESTS,
      pageRequests: NO_PAGE_REQUESTS,
      facts: null,
      screenshot: null,
    }
  }
  // An abort that came first never fires its event: without this, the render ran its whole budget.
  if (options.signal?.aborted === true) {
    return {
      engine,
      status: 'failed',
      version: null,
      error: 'Aborted',
      durationMs: 0,
      requests: NO_REQUESTS,
      pageRequests: NO_PAGE_REQUESTS,
      facts: null,
      screenshot: null,
    }
  }
  const started = performance.now()
  const deadline = started + budgetMs
  const proxy = await startProxy({
    policy: options.policy ?? DEFAULT_POLICY,
    ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
  })
  const executablePath = options.executablePaths?.[engine] ?? executablePathFor(engine)
  let version: string | null = null
  // The page's own request count, kept by the browser (see RenderOptions.maxRequests).
  const budget: RequestBudget = {
    max: options.maxRequests ?? DEFAULT_MAX_REQUESTS,
    made: 0,
    overLimit: 0,
    reached: false,
  }
  const finish = (
    status: RenderStatus,
    error: string | null,
    facts: RenderedFacts | null = null,
    screenshot: Uint8Array | null = null,
  ): RenderOutcome => ({
    engine,
    status,
    version,
    error,
    durationMs: Math.round(performance.now() - started),
    requests: { ...proxy.stats(), limited: proxy.stats().limited || budget.reached },
    pageRequests: { made: budget.made, overLimit: budget.overLimit },
    facts,
    screenshot,
  })

  // A browser server rather than a plain launch, because only a server can be killed; it listens
  // on loopback only, at an unguessable path, and the page's own requests cannot reach loopback.
  const launching = TYPES[engine].launchServer({
    ...launchOptions(engine, proxySettings(proxy), executablePath),
    host: '127.0.0.1',
    port: 0,
    timeout: budgetMs,
  })
  launching.catch(() => undefined)
  let timer: NodeJS.Timeout | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new RenderTimeout(`${engine} did not finish within ${budgetMs} ms`))
    }, budgetMs)
  })
  const aborted = new Promise<never>((_resolve, reject) => {
    // An abort while the proxy started has already fired its event.
    if (options.signal?.aborted === true) reject(new RenderAborted('Aborted'))
    options.signal?.addEventListener(
      'abort',
      () => {
        reject(new RenderAborted('Aborted'))
      },
      { once: true },
    )
  })
  // The losers of the race below still settle later; they must not become unhandled rejections.
  expired.catch(() => undefined)
  aborted.catch(() => undefined)
  // A page that ran out of time may be holding its engine: that browser is killed, not closed.
  let stuck = false
  try {
    const work = (async () => {
      const server = await launching
      const browser: Browser = await TYPES[engine].connect(server.wsEndpoint(), {
        timeout: Math.max(1, Math.round(deadline - performance.now())),
      })
      version = browser.version()
      return await renderWith(browser, engine, url, proxy, deadline, {
        screenshots: options.screenshots === true,
        budget,
      })
    })()
    work.catch(() => undefined)
    // A page that blocks its own main thread would hold page.evaluate forever; the budget wins.
    const { facts, screenshot } = await Promise.race([work, expired, aborted])
    return finish('rendered', null, facts, screenshot)
  } catch (error) {
    if (error instanceof RenderTimeout || error instanceof RenderAborted) stuck = true
    if (error instanceof RenderTimeout) return finish('timeout', error.message)
    // Playwright's own timeouts are set from the same budget, so they can fire first.
    if (error instanceof Error && error.name === 'TimeoutError') {
      stuck = true
      return finish('timeout', firstLine(error.message))
    }
    const message = error instanceof Error ? error.message : String(error)
    if (/Executable doesn't exist|executable doesn't exist|ENOENT/i.test(message)) {
      return finish('unavailable', firstLine(message))
    }
    return finish('failed', firstLine(message))
  } finally {
    clearTimeout(timer)
    // The proxy closes first: a closing browser lets go of the requests the route was holding,
    // and beacons outlive their page, so otherwise they went out uncounted (M1.1 CI).
    await proxy.close()
    await shutDown(launching, stuck)
  }
}

/**
 * Ends a render's browser: it is killed at once when its page ran out of time, and otherwise
 * when it has not closed within CLOSE_GRACE_MS. Killing ends the whole process group.
 */
async function shutDown(launching: Promise<BrowserServer>, stuck: boolean): Promise<void> {
  // A launch has its own timeout (the budget), so this wait ends too.
  const server = await launching.catch(() => undefined)
  if (server === undefined) return
  if (!stuck) {
    const closed = await Promise.race([
      server.close().then(
        () => true,
        () => false,
      ),
      unheld(CLOSE_GRACE_MS).then(() => false),
    ])
    if (closed) return
  }
  await Promise.race([server.kill().catch(() => undefined), unheld(KILL_WAIT_MS)])
}

/** Waits for web fonts and returns only its own literal, whatever the page made the promise do. */
const FONTS_READY = '(async () => { await document.fonts.ready; return true })()'

/** A delay that does not keep the process alive, so a closed browser does not hold up exit. */
function unheld(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref())
}

async function renderWith(
  browser: Browser,
  engine: Engine,
  url: string,
  proxy: EgressProxy,
  deadline: number,
  { screenshots, budget }: { screenshots: boolean; budget: RequestBudget },
): Promise<{ facts: RenderedFacts; screenshot: Uint8Array | null }> {
  const remaining = () => Math.max(1, Math.round(deadline - performance.now()))
  const agent = await defaultUserAgent(browser)
  const context = await browser.newContext(contextOptions(userAgentFor(agent, BOT_TOKEN)))
  // Every request waits here for its turn to be counted, so a burst cannot get past the limit
  // before it is noticed; past it, new requests are refused (BUILD-PLAN §11, M1.1 review).
  await context.route('**/*', async (route) => {
    budget.made++
    if (budget.made <= budget.max) {
      await route.fallback()
      return
    }
    budget.reached = true
    budget.overLimit++
    await route.abort('blockedbyclient')
  })
  // No workers whose requests no route sees (see WORKER_GUARD).
  await context.addInitScript(WORKER_GUARD)
  await context.addInitScript(RESULT_GUARD)
  await context.addInitScript(DECODED_SIZES)
  const page = await context.newPage()
  // No pop-ups, no dialogs waiting for a click: nothing on the page is ever acted on (§13).
  context.on('page', (opened) => {
    if (opened !== page) void opened.close().catch(() => undefined)
  })
  page.on('dialog', (dialog) => {
    void dialog.dismiss().catch(() => undefined)
  })

  let inflight = 0
  let lastActivity = performance.now()
  const fontRequests: Request[] = []
  const statuses = new Map<Request, number>()
  page.on('request', (request) => {
    inflight++
    lastActivity = performance.now()
    if (request.resourceType() === 'font' && fontRequests.length < MAX_FONT_REQUESTS) {
      fontRequests.push(request)
    }
  })
  // The main frame's stylesheets and fonts, read once the page has rendered (see readPageFiles).
  const files: { stylesheets: Response[]; fonts: Response[]; finished: Set<Request> } = {
    stylesheets: [],
    fonts: [],
    finished: new Set(),
  }
  page.on('response', (response) => {
    const request = response.request()
    const kind = request.resourceType()
    if (kind === 'font') statuses.set(request, response.status())
    if (kind !== 'font' && kind !== 'stylesheet') return
    let main = false
    try {
      main = response.frame() === page.mainFrame()
    } catch {
      // A response without a frame is not the page's.
    }
    const list = kind === 'font' ? files.fonts : files.stylesheets
    if (main && list.length < MAX_FILE_RESPONSES) list.push(response)
  })
  const done = () => {
    inflight = Math.max(0, inflight - 1)
    lastActivity = performance.now()
  }
  page.on('requestfinished', (request) => {
    const kind = request.resourceType()
    if (kind === 'font' || kind === 'stylesheet') files.finished.add(request)
    done()
  })
  page.on('requestfailed', done)

  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: remaining() })
  await page
    .waitForLoadState('load', { timeout: Math.min(remaining(), 10_000) })
    .catch(() => undefined)
  // Fixed wait policy (Phase 1 design §5): web fonts, then quiet on the network, both capped.
  const settleUntil = Math.min(deadline, performance.now() + SETTLE_CAP_MS)
  await Promise.race([
    page.evaluate(FONTS_READY).catch(() => undefined),
    unheld(Math.max(0, settleUntil - performance.now())),
  ])
  while (performance.now() < settleUntil) {
    if (inflight === 0 && performance.now() - lastActivity >= QUIET_MS) break
    await delay(100)
  }
  // Finished animations end in their final state; endless ones stop (as Playwright's screenshots do).
  await page.evaluate(FINISH_ANIMATIONS).catch(() => undefined)

  const measured = fromPage(await page.evaluate(throughGuard(measureSource())))
  // Stylesheets and font files, only for the rules that read them: without them they stay silent.
  const read = await readPageFiles(
    page,
    files,
    measuredFontFaces(measured),
    Math.min(deadline, performance.now() + FILES_CAP_MS),
  ).catch(() => undefined)
  // Used fonts only explain font findings; without them those rules stay silent.
  const usedFonts =
    engine === 'chromium'
      ? await chromiumUsedFonts(page, measured).catch(() => undefined)
      : undefined
  const screenshot = screenshots
    ? new Uint8Array(
        await page.screenshot({
          type: 'png',
          animations: 'disabled',
          caret: 'hide',
          timeout: remaining(),
        }),
      )
    : null

  // After the screenshot: axe reads the page as it is and leaves it so, but runs last all the same.
  const a11y = await runAxe(page, Math.min(remaining(), AXE_CAP_MS))

  const refusals = proxy.stats().refusals
  const facts = toFacts(measured, {
    engine,
    version: browser.version(),
    url: page.url(),
    status: response?.status() ?? null,
    fontRequests: fontRequests.map((request) => fontRequestFact(request, statuses, refusals)),
    limited: proxy.stats().limited || budget.reached,
    ...(usedFonts === undefined ? {} : { usedFonts }),
    a11y,
    ...(read ?? {}),
  })
  return { facts, screenshot }
}

/**
 * axe-core's curated rules on the page; null when axe fails, returns what its runner does not, or
 * runs out of time. The browser is closed after the render in any case, so a run left behind ends
 * with it.
 */
async function runAxe(page: Page, timeMs: number): Promise<A11yFacts | null> {
  const run = async () => {
    // The value of axe's own source is left behind: only the guard's text comes back.
    await page.evaluate(`${axeSource()}\n;void 0`)
    return toA11yFacts(fromPage(await page.evaluate(throughGuard(axeRunnerSource()))))
  }
  return await Promise.race([run().catch(() => null), unheld(timeMs).then(() => null)])
}

/**
 * Which fonts draw Arabic letters in each web-font family the Arabic text uses, from Chromium's
 * own record (CSS.getPlatformFontsForNode). A hidden probe carries every Arabic letter, so the
 * answer does not depend on which letters the page happens to use.
 */
async function chromiumUsedFonts(page: Page, measured: unknown): Promise<UsedFontsFact[]> {
  const families = webFontFamilies(measured)
  if (families.length === 0) return []
  const ids = fromPage(
    await page.evaluate(throughGuard(inPage(addProbes, families, ARABIC_SAMPLE))),
  )
  if (!Array.isArray(ids)) return []
  // Capped, as the settle step is: a font that never arrives held the whole render until its
  // budget ran out, and the page was reported with no facts at all (M1.1 review).
  await Promise.race([
    page.evaluate(FONTS_READY).catch(() => undefined),
    unheld(PROBE_FONTS_CAP_MS),
  ])
  const session = await page.context().newCDPSession(page)
  const result: UsedFontsFact[] = []
  try {
    await session.send('DOM.enable')
    await session.send('CSS.enable')
    const { root } = await session.send('DOM.getDocument', { depth: 0 })
    for (const [index, fontFamily] of families.entries()) {
      const id: unknown = ids[index]
      if (typeof id !== 'string') continue
      const { nodeId } = await session.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: `#${id}`,
      })
      if (nodeId === 0) continue
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId })
      result.push({
        fontFamily,
        fonts: fonts.map((font) => ({
          family: font.familyName,
          custom: font.isCustomFont,
          glyphs: font.glyphCount,
        })),
      })
    }
  } finally {
    await session.detach().catch(() => undefined)
    await page.evaluate(REMOVE_PROBES).catch(() => undefined)
  }
  return result
}

/** The computed font-family lists of Arabic text whose first family is a web font. */
function webFontFamilies(measured: unknown): string[] {
  if (typeof measured !== 'object' || measured === null) return []
  const { arabicText, fontFaces } = measured as { arabicText?: unknown; fontFaces?: unknown }
  if (!Array.isArray(arabicText) || !Array.isArray(fontFaces)) return []
  const webFamilies = new Set(
    fontFaces.flatMap((face: unknown) =>
      typeof face === 'object' &&
      face !== null &&
      'family' in face &&
      typeof face.family === 'string'
        ? [face.family.toLowerCase()]
        : [],
    ),
  )
  const lists = new Set<string>()
  for (const block of arabicText as unknown[]) {
    if (typeof block !== 'object' || block === null) continue
    const { fontFamily, primaryFamily } = block as { fontFamily?: unknown; primaryFamily?: unknown }
    if (typeof fontFamily !== 'string' || typeof primaryFamily !== 'string') continue
    if (fontFamily.length > 500 || !webFamilies.has(primaryFamily.toLowerCase())) continue
    lists.add(fontFamily)
    if (lists.size >= MAX_PROBED_FAMILIES) break
  }
  return [...lists]
}

/** In the page: one hidden probe per font-family list; returns their ids. */
function addProbes(families: readonly string[], sample: string): string[] {
  return families.map((family, index) => {
    const probe = document.createElement('span')
    probe.id = `arablyzer-probe-${index}`
    probe.dataset.arablyzerProbe = ''
    probe.setAttribute('aria-hidden', 'true')
    probe.style.setProperty('position', 'absolute', 'important')
    probe.style.setProperty('top', '0', 'important')
    probe.style.setProperty('left', '0', 'important')
    probe.style.setProperty('opacity', '0', 'important')
    probe.style.setProperty('pointer-events', 'none', 'important')
    probe.style.setProperty('font-family', family, 'important')
    probe.style.setProperty('letter-spacing', '0', 'important')
    probe.textContent = sample
    document.body.appendChild(probe)
    return probe.id
  })
}

// A block body returns nothing, whatever the page made forEach return.
const REMOVE_PROBES =
  "(() => { document.querySelectorAll('[data-arablyzer-probe]').forEach((probe) => probe.remove()) })()"

const FINISH_ANIMATIONS = `(() => {
  for (const animation of document.getAnimations()) {
    try {
      const end = animation.effect && animation.effect.getComputedTiming().endTime
      if (typeof end === 'number' && Number.isFinite(end)) animation.finish()
      else animation.cancel()
    } catch {}
  }
})()`

function fontRequestFact(
  request: Request,
  statuses: ReadonlyMap<Request, number>,
  refusals: ProxyStats['refusals'],
): FontRequestFact {
  const url = request.url()
  let authority = ''
  try {
    const parsed = new URL(url)
    authority = `${parsed.hostname}:${parsed.port === '' ? (parsed.protocol === 'https:' ? '443' : '80') : parsed.port}`
  } catch {
    // An unparseable URL cannot match a refusal.
  }
  const refused = refusals.some((refusal) => refusal.target === url || refusal.target === authority)
  return {
    url: redactUrl(url).slice(0, 2048),
    status: refused ? null : (statuses.get(request) ?? null),
    refused,
  }
}

async function defaultUserAgent(browser: Browser): Promise<string> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    return String(await page.evaluate('navigator.userAgent'))
  } finally {
    await context.close()
  }
}

function proxySettings(proxy: EgressProxy) {
  return { server: proxy.url, username: proxy.username, password: proxy.password }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function firstLine(message: string): string {
  return (message.split('\n')[0] ?? '').slice(0, 300)
}

/** Whether the engine launches here: its binary is installed and starts. */
export async function engineAvailable(
  engine: Engine,
  executablePath: string | undefined = executablePathFor(engine),
): Promise<boolean> {
  try {
    const browser = await TYPES[engine].launch({
      headless: true,
      ...(executablePath === undefined ? {} : { executablePath }),
    })
    await browser.close()
    return true
  } catch {
    return false
  }
}
