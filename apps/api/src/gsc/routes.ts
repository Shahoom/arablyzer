import {
  GSC_CALLBACK_PATH,
  GSC_RESULT_PATTERN,
  SCAN_ID_PATTERN,
  type GscFailure,
  type GscResult,
  type GscStatus,
} from '@arablyzer/api-contract/codes'
import type { Window } from '@arablyzer/plans'
import type { Handoff, RateLimiter, ScanStore } from '@arablyzer/store'
import type { Context, Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { GoogleApi } from './google'
import {
  authorizationUrl,
  CODE_PATTERN,
  COOKIE_NAME,
  FLOW_TTL_SECONDS,
  newPkce,
  randomToken,
  sameString,
  signFlow,
  verifyFlow,
} from './oauth'
import { periodOf, pickProperty, shapeInspection, shapeRows, shapeTotals } from './shape'

/** How long a result waits for the report page to read it: it is read once, or it is gone. */
export const RESULT_TTL_SECONDS = 300

/** The connection's settings, built from the environment (config.ts); absent, the feature is off. */
export interface GscDeps {
  readonly clientId: string
  readonly clientSecret: string
  /** `<site origin>/api/gsc/callback`: the exact address Google sends the visitor back to. */
  readonly redirectUri: string
  /** The site's origin: the only place a visitor is sent back to. */
  readonly origin: string
  /** The cookie's flag: the site is served over HTTPS. */
  readonly secure: boolean
  /** The key the flow's cookie is signed with, derived from the server's own secret. */
  readonly signingKey: Buffer
  readonly handoff: Handoff
  readonly google: GoogleApi
}

/** What the routes use of the API's own dependencies. */
export interface GscContext {
  readonly gsc: GscDeps | undefined
  readonly store: ScanStore
  readonly limiter: RateLimiter
  readonly window: Window
  readonly address: (c: Context) => string | null
  readonly connectionKey: (address: string, now: Date) => string
  readonly now: () => Date
  readonly log: (error: Error) => void
}

type Lang = 'ar' | 'en'

/** A flow's verifier, and what the callback needs to send the visitor back. */
interface Pending {
  readonly verifier: string
  readonly report: string
  readonly lang: Lang
  readonly url: string
}

const pendingKey = (nonce: string) => `gsc-pkce:${nonce}`
const resultKey = (id: string) => `gsc-result:${id}`

/**
 * Search Console, from a finished report (account-free): `start` sends the visitor to Google's
 * consent, `callback` takes the code, reads Search Console once with an online token that is then
 * thrown away, and sends the visitor back to the report with a one-time result id, which the page
 * reads once from `results`. Nothing of Google's, token or data, is kept longer than that: the
 * result waits five minutes in a store that is read once.
 */
export function registerGscRoutes(app: Hono, context: GscContext): void {
  const { gsc } = context

  const status: GscStatus = { enabled: gsc !== undefined }
  app.get('/api/gsc/status', (c) => c.json(status))
  if (gsc === undefined) return

  /** The report's page, with what the connection came to: a result's id, or a keyword. */
  const back = (c: Context, report: string, lang: Lang, outcome: string) =>
    c.redirect(`${gsc.origin}${lang === 'en' ? '/en' : ''}/r/${report}?gsc=${outcome}`, 302)

  /** One bucket per visitor for the three routes, from the attempts' window. Null: no address. */
  const limited = async (c: Context): Promise<'unknown' | 'limited' | null> => {
    const address = context.address(c)
    if (address === null) return 'unknown'
    const at = context.now()
    const taken = await context.limiter.take(
      `gsc:${context.connectionKey(address, at)}`,
      context.window,
      at.getTime(),
    )
    return taken.ok ? null : 'limited'
  }

  app.get('/api/gsc/start', async (c) => {
    const report = c.req.query('report') ?? ''
    const lang: Lang = c.req.query('lang') === 'en' ? 'en' : 'ar'
    if (!SCAN_ID_PATTERN.test(report)) return c.json({ error: 'bad-request' }, 400)
    const refused = await limited(c)
    if (refused === 'unknown') return c.json({ error: 'unavailable' }, 503)
    if (refused === 'limited') return c.json({ error: 'rate-limited' }, 429)
    const scan = await context.store.get(report)
    if (scan?.report == null) return c.notFound()
    const url = scan.report.target.finalUrl ?? scan.report.target.url
    const nonce = randomToken(32)
    const pkce = newPkce()
    const pending: Pending = { verifier: pkce.verifier, report, lang, url }
    await gsc.handoff.put(pendingKey(nonce), JSON.stringify(pending), FLOW_TTL_SECONDS)
    const expires = context.now().getTime() + FLOW_TTL_SECONDS * 1000
    setCookie(c, COOKIE_NAME, signFlow(gsc.signingKey, { n: nonce, r: report, e: expires }), {
      httpOnly: true,
      sameSite: 'Lax',
      secure: gsc.secure,
      path: '/api/gsc',
      maxAge: FLOW_TTL_SECONDS,
    })
    return c.redirect(
      authorizationUrl({
        clientId: gsc.clientId,
        redirectUri: gsc.redirectUri,
        state: nonce,
        challenge: pkce.challenge,
      }),
      302,
    )
  })

  app.get(GSC_CALLBACK_PATH, async (c) => {
    const now = context.now()
    const flow = verifyFlow(gsc.signingKey, getCookie(c, COOKIE_NAME), now.getTime())
    // The cookie is the flow's, and used once: whatever comes of it, it goes.
    deleteCookie(c, COOKIE_NAME, { path: '/api/gsc', secure: gsc.secure })
    const state = c.req.query('state') ?? ''
    if (flow === null || !sameString(state, flow.n) || !SCAN_ID_PATTERN.test(flow.r)) {
      return c.json({ error: 'bad-request' }, 400)
    }
    // The verifier is read once: a callback sent again finds nothing.
    const held = await gsc.handoff.take(pendingKey(flow.n))
    const pending = readPending(held)
    if (pending?.report !== flow.r) return c.json({ error: 'bad-request' }, 400)
    const fail = (outcome: GscFailure) => back(c, pending.report, pending.lang, outcome)

    if (c.req.query('error') !== undefined) return fail('denied')
    const code = c.req.query('code') ?? ''
    if (!CODE_PATTERN.test(code)) return fail('error')
    const refused = await limited(c)
    if (refused !== null) return fail('error')

    const token = await gsc.google.exchange({
      code,
      verifier: pending.verifier,
      clientId: gsc.clientId,
      clientSecret: gsc.clientSecret,
      redirectUri: gsc.redirectUri,
    })
    if (token === null) return fail('error')
    let result: GscResult | null
    try {
      result = await collect(gsc.google, token, pending.url, now)
    } catch (error) {
      // Told by its message alone: nothing it holds is the visitor's, or the token.
      context.log(error instanceof Error ? new Error(error.message) : new Error('GSC failed'))
      result = null
    } finally {
      // The token is thrown away as soon as it has been used, and Google is told so.
      await gsc.google.revoke(token)
    }
    if (result === null) return fail('error')
    const id = randomToken(32)
    await gsc.handoff.put(resultKey(id), JSON.stringify(result), RESULT_TTL_SECONDS)
    return back(c, pending.report, pending.lang, id)
  })

  app.get('/api/gsc/results/:id', async (c) => {
    const id = c.req.param('id')
    if (!GSC_RESULT_PATTERN.test(id)) return c.notFound()
    const refused = await limited(c)
    if (refused === 'limited') return c.json({ error: 'rate-limited' }, 429)
    // Read once, whoever reads it: the page that was sent here has it, and no one after.
    const held = await gsc.handoff.take(resultKey(id))
    if (held === null) return c.notFound()
    return c.body(held, 200, { 'content-type': 'application/json; charset=utf-8' })
  })
}

function readPending(value: string | null): Pending | null {
  if (value === null) return null
  try {
    const pending = JSON.parse(value) as Partial<Pending>
    const { verifier, report, lang, url } = pending
    return typeof verifier === 'string' &&
      typeof report === 'string' &&
      typeof url === 'string' &&
      (lang === 'ar' || lang === 'en')
      ? { verifier, report, lang, url }
      : null
  } catch {
    return null
  }
}

/**
 * Reads Search Console for the report's page with the token: the user's properties, the one the
 * page's site matches, and for it the totals, the top queries, pages and countries, and URL
 * Inspection of the page. A property the user does not have is a result with none. A part Google
 * would not give leaves the rest, and `partial`; nothing at all, or no list of properties, is a
 * failure (null, or a throw).
 */
export async function collect(
  google: GoogleApi,
  token: string,
  pageUrl: string,
  now: Date,
): Promise<GscResult | null> {
  const period = periodOf(now)
  const sites = await google.sites(token)
  if (sites.status !== 200) return null
  const property = pickProperty(sites.body, pageUrl)
  if (property === null) {
    return {
      property: null,
      period,
      totals: null,
      queries: [],
      pages: [],
      countries: [],
      inspection: null,
      partial: false,
    }
  }
  const ask = (dimensions: string[], rowLimit: number) =>
    google.analytics(token, property.siteUrl, {
      startDate: period.start,
      endDate: period.end,
      ...(dimensions.length === 0 ? {} : { dimensions }),
      rowLimit,
    })
  const [totals, queries, pages, countries, inspection] = await Promise.all([
    ask([], 1),
    ask(['query'], 10),
    ask(['page'], 10),
    ask(['country'], 5),
    google.inspect(token, property.siteUrl, pageUrl),
  ])
  const answers = [totals, queries, pages, countries, inspection]
  const failed = answers.filter((answer) => answer.status !== 200).length
  if (failed === answers.length) return null
  return {
    property,
    period,
    totals: totals.status === 200 ? shapeTotals(totals.body) : null,
    queries: queries.status === 200 ? shapeRows(queries.body, 10) : [],
    pages: pages.status === 200 ? shapeRows(pages.body, 10) : [],
    countries: countries.status === 200 ? shapeRows(countries.body, 5) : [],
    inspection: inspection.status === 200 ? shapeInspection(inspection.body) : null,
    partial: failed > 0,
  }
}
