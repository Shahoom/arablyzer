/// <reference lib="dom" />
import type {
  A11yFacts,
  Engine,
  FontRequestFact,
  Header,
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
import { challengeOf } from '@arablyzer/rules/challenges'
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
  browserEnvironment,
  launchOptions,
  NEEDS_ISOLATION,
  NETWORK_ISOLATED_VARIABLE,
  networkIsolated,
  SEND_GUARD,
  userAgentFor,
  WORKER_GUARD,
} from './engines'
import { axeRunnerSource, axeSource, toA11yFacts } from './a11y'
import { readPageFiles } from './files'
import { DECODED_SIZES, fromPage, inPage, RESULT_GUARD, throughGuard } from './guard'
import { measureSource } from './measure'
import {
  admit,
  DEFAULT_MAX_HOSTS,
  newBudget,
  pageRequests,
  refuseSocket,
  type PageRequests,
  type RequestBudget,
} from './requests'
import { arabicTextOf, measuredFontFaces, toFacts } from './validate'

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
/** Responses of each kind kept for reading: as many as a page may make requests. */
const MAX_FILE_RESPONSES = DEFAULT_MAX_REQUESTS
/** The kinds of the page's responses that rules read: fonts, stylesheets, text and images. */
const FILE_KINDS = new Set([
  'font',
  'stylesheet',
  'image',
  'document',
  'script',
  'xhr',
  'fetch',
  'eventsource',
])
/**
 * How a WebSocket the page opens is closed: with 1008, a policy violation, as a server that
 * refuses a connection may answer; the page's own `close` event says so, and it goes on.
 */
const WEBSOCKET_CLOSE = { code: 1008, reason: 'Arablyzer browsers open no WebSockets' }
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
  /**
   * Distinct hosts a page may contact per engine (DEFAULT_MAX_HOSTS). Requests to a host past the
   * limit are refused, so that a page cannot make a scan reach as many sites as it names (M1
   * review). A host is counted once, by its name, however many requests go to it.
   */
  readonly maxHosts?: number
}

/**
 * challenged: the site answered the browser's request for the page with a bot challenge, and the
 * render stopped there without measuring it (see watchDocuments).
 */
export type RenderStatus =
  'rendered' | 'failed' | 'timeout' | 'unavailable' | 'refused' | 'challenged'

/** The bot challenge a site answered with in place of the page (M2.3c). */
export interface RenderChallenge {
  /** The service, as its documentation names it. */
  readonly service: string
  /** The HTTP status of the answer: Cloudflare's is a 403, AWS WAF's a 202. */
  readonly status: number
}

export interface RenderOutcome {
  readonly engine: Engine
  readonly status: RenderStatus
  readonly version: string | null
  /** English detail for logs; the report maps the status to its own words. */
  readonly error: string | null
  /** What the site answered instead of the page, for `challenged`; null otherwise. */
  readonly challenge: RenderChallenge | null
  readonly durationMs: number
  /** What the egress proxy saw: an HTTPS connection is one tunnel, however many requests it carries. */
  readonly requests: ProxyStats
  /** What the page asked for, as the browser counted it (see PageRequests). */
  readonly pageRequests: PageRequests
  readonly facts: RenderedFacts | null
  readonly screenshot: Uint8Array | null
}

class RenderTimeout extends Error {}
class RenderAborted extends Error {}

/** What the watch over the page's documents learned, for the render to say when it ends. */
class DocumentsMet {
  /** A bot challenge came in place of a document of the page (see watchDocuments). */
  challenge: RenderChallenge | null = null
  /** Rejects once a challenge is met, so the render stops there and not when the page settles. */
  readonly stopped: Promise<never>
  readonly #stop: (error: Error) => void = () => undefined

  constructor() {
    let stop: (error: Error) => void = () => undefined
    this.stopped = new Promise<never>((_resolve, reject) => {
      stop = reject
    })
    // Whoever races it hears of a challenge; if no one does, it is not an unhandled rejection.
    this.stopped.catch(() => undefined)
    this.#stop = stop
  }

  meet(challenge: RenderChallenge): void {
    this.challenge ??= challenge
    this.#stop(new Error(challengeMessage(challenge)))
  }
}

const NO_PAGE_REQUESTS: PageRequests = Object.freeze({
  made: 0,
  overLimit: 0,
  overHosts: 0,
  sending: 0,
})

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
  // A limit of no hosts would refuse the page itself: a mistake of the caller's, said before any
  // proxy or browser starts (as startProxy does of its limits).
  if (
    options.maxHosts !== undefined &&
    (!Number.isInteger(options.maxHosts) || options.maxHosts < 1)
  ) {
    throw new TypeError('maxHosts must be a whole number, at least 1')
  }
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
      challenge: null,
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
      challenge: null,
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
      challenge: null,
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
  const budget = newBudget(
    options.maxRequests ?? DEFAULT_MAX_REQUESTS,
    options.maxHosts ?? DEFAULT_MAX_HOSTS,
  )
  // What the watch over the page's documents saw: a bot challenge, told when the render ends.
  const met = new DocumentsMet()
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
    challenge: status === 'challenged' ? met.challenge : null,
    durationMs: Math.round(performance.now() - started),
    requests: { ...proxy.stats(), limited: proxy.stats().limited || budget.reached },
    pageRequests: pageRequests(budget),
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
    // No key or token of this process reaches a browser that runs pages' code.
    env: browserEnvironment(),
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
        met,
      })
    })()
    work.catch(() => undefined)
    // A page that blocks its own main thread would hold page.evaluate forever; the budget wins.
    const { facts, screenshot } = await Promise.race([work, expired, aborted])
    return finish('rendered', null, facts, screenshot)
  } catch (error) {
    if (error instanceof RenderTimeout || error instanceof RenderAborted) stuck = true
    // A challenge ended the render, by whatever error the ending gave: a page closed under it.
    if (met.challenge !== null && !stuck)
      return finish('challenged', challengeMessage(met.challenge))
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
  // A launch has its own timeout (the budget), but a browser that starts and never answers held
  // it for minutes (M1.3b review): past the kill wait, it is left behind.
  const server = await Promise.race([
    launching.catch(() => undefined),
    unheld(KILL_WAIT_MS).then(() => undefined),
  ])
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
  { screenshots, budget, met }: { screenshots: boolean; budget: RequestBudget; met: DocumentsMet },
): Promise<{ facts: RenderedFacts; screenshot: Uint8Array | null }> {
  const remaining = () => Math.max(1, Math.round(deadline - performance.now()))
  const agent = await defaultUserAgent(browser)
  const context = await browser.newContext(contextOptions(userAgentFor(agent, BOT_TOKEN)))
  // Every request waits here for its turn to be counted, so a burst cannot get past a limit before
  // it is noticed (BUILD-PLAN §11, M1.1 review). It goes out only if it asks and sends nothing
  // (GET or HEAD, whatever its destination), is within the request limit, and goes to a host
  // within the host limit: see admit, and M1 review (issue #29) for why each is refused.
  await context.route('**/*', async (route) => {
    // After a bot challenge, nothing the page asks for goes out: its scripts get no further.
    if (met.challenge !== null) {
      budget.made++
      await route.abort('blockedbyclient')
      return
    }
    const request = route.request()
    const verdict = admit(budget, request.method(), request.url())
    if (verdict === 'allow') {
      await route.fallback()
      return
    }
    if (verdict === 'limit') {
      await route.abort('blockedbyclient')
      return
    }
    // Only 'aborted' leaves a page in place when it is a navigation that is refused, as a form's
    // submission would be (none is, see SEND_GUARD): any other error made Chromium show its own
    // error page, and the render measured that in the site's place.
    await route.abort('aborted')
  })
  // No WebSockets: they are closed before they open. No route sees a WebSocket's handshake, and a
  // WebSocket is a way to send whatever the page likes to any host it likes. Playwright replaces
  // WebSocket in the page and its frames, not in workers (see SEND_GUARD).
  await context.routeWebSocket(
    () => true,
    async (socket) => {
      refuseSocket(budget)
      await socket.close(WEBSOCKET_CLOSE)
    },
  )
  // No workers whose requests no route sees, and no socket that routing does not close (see
  // WORKER_GUARD and SEND_GUARD).
  await context.addInitScript(WORKER_GUARD)
  await context.addInitScript(SEND_GUARD)
  await context.addInitScript(RESULT_GUARD)
  await context.addInitScript(DECODED_SIZES)
  const page = await context.newPage()
  watchDocuments(page, met)
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
  const files: {
    stylesheets: Response[]
    fonts: Response[]
    texts: Response[]
    images: Response[]
    finished: Set<Request>
    responses: Map<string, number>
  } = {
    stylesheets: [],
    fonts: [],
    texts: [],
    images: [],
    finished: new Set(),
    responses: new Map(),
  }
  page.on('response', (response) => {
    const url = response.url()
    if (files.responses.has(url) || files.responses.size < MAX_FILE_RESPONSES) {
      files.responses.set(url, (files.responses.get(url) ?? 0) + 1)
    }
    const request = response.request()
    const kind = request.resourceType()
    if (kind === 'font') statuses.set(request, response.status())
    const list = FILE_KINDS.has(kind)
      ? kind === 'font'
        ? files.fonts
        : kind === 'stylesheet'
          ? files.stylesheets
          : kind === 'image'
            ? files.images
            : files.texts
      : undefined
    if (list === undefined) return
    let main = false
    try {
      main = response.frame() === page.mainFrame()
    } catch {
      // A response without a frame is not the page's.
    }
    if (main && list.length < MAX_FILE_RESPONSES) list.push(response)
  })
  const done = () => {
    inflight = Math.max(0, inflight - 1)
    lastActivity = performance.now()
  }
  page.on('requestfinished', (request) => {
    if (FILE_KINDS.has(request.resourceType())) files.finished.add(request)
    done()
  })
  page.on('requestfailed', done)

  // A challenge ends the render at once, not when the page settles (see watchDocuments).
  const response = await Promise.race([
    page.goto(url, { waitUntil: 'domcontentloaded', timeout: remaining() }),
    met.stopped,
  ])
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
  // A challenge a script navigated to ended the page under the render: nothing measured is the page's.
  if (met.challenge !== null) throw new Error(challengeMessage(met.challenge))
  // Finished animations end in their final state; endless ones stop (as Playwright's screenshots do).
  await page.evaluate(FINISH_ANIMATIONS).catch(() => undefined)

  const measured = fromPage(await page.evaluate(throughGuard(measureSource())))
  // Stylesheets and font files, only for the rules that read them: without them they stay silent.
  const read = await readPageFiles(
    page,
    files,
    measuredFontFaces(measured),
    Math.min(deadline, performance.now() + FILES_CAP_MS),
    undefined,
    arabicTextOf(measured),
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
    // What the limits on requests and on hosts cut is not the site's doing. What was refused for
    // sending data cut no file, so it does not count.
    limited: proxy.stats().limited || budget.reached || budget.overHosts > 0,
    filesRead: read !== undefined,
    ...(usedFonts === undefined ? {} : { usedFonts }),
    a11y,
    ...(read ?? {}),
  })
  return { facts, screenshot }
}

/**
 * Stops the render at a bot challenge in place of the page (BUILD-PLAN §13, M2.3c review: the
 * plain fetch passed a page whose browser was answered a challenge, and its script ran). A
 * challenge is told by the headers of the answer to a request for the page itself, the first or a
 * redirect's next or where a script navigates, with the same challengeOf the engine uses on the
 * plain fetch. The moment the engine reports them, the route lets nothing more out (see the
 * route in renderWith) and the render ends as `challenged`, without measuring the page.
 *
 * The answer is not held back from the page first, which no engine lets a render do without
 * changing what it measures. Measured with Playwright 1.63: `route.fetch` hands the browser
 * Node's answer for its own (Firefox then met the proxy's 407 for every file, and the document's
 * compression and encoding facts were lost); a Chromium session pausing responses (the Fetch
 * domain) sees the proxy's 407 of a plain HTTP request as the document's answer and never lets
 * the credentials through. So a challenge's inline scripts may run for a moment, and its script
 * file may be asked for as the engine reports the answer; the challenge needs that script to run,
 * and a round trip, to be passed, and nothing that script asks for goes out.
 */
function watchDocuments(page: Page, met: DocumentsMet): void {
  page.on('response', (response) => {
    if (met.challenge !== null) return
    try {
      if (!response.request().isNavigationRequest() || response.frame() !== page.mainFrame()) return
    } catch {
      // A response without a frame is not the page's.
      return
    }
    const headers = Object.entries(response.headers()).map(([name, value]): Header => [name, value])
    const challenge = challengeOf(headers)
    if (challenge !== null) met.meet({ service: challenge.service, status: response.status() })
  })
}

function challengeMessage(challenge: RenderChallenge): string {
  return `A ${challenge.service} bot challenge (HTTP ${String(challenge.status)}) came in place of the page`
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
