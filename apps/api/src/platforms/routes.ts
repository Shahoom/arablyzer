import type { Window } from '@arablyzer/plans'
import { quietly, type Handoff, type ScanStore } from '@arablyzer/store'
import type { Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  CODE_PATTERN,
  FLOW_TTL_SECONDS,
  randomToken,
  sameString,
  signFlow,
  verifyFlow,
} from '../gsc/oauth'
import { hashLookupToken, wantAudit } from './install'
import {
  installedBody,
  langOf,
  noticeBody,
  page,
  policyFor,
  summaryBody,
  summaryOf,
  themeOf,
} from './panel'
import { ZID_WEBHOOK_HEADER, type Zid } from './zid'
import type { Salla } from './salla'
import type { PlatformContext } from './types'

export const PLATFORMS_PATH = '/api/platforms'
/** A webhook's body is a small JSON: 256 KB is ample, and nothing larger is read. */
const WEBHOOK_BYTES = 256 * 1024
/** What one visitor may ask of the install, callback and panel routes together. */
const VISITOR_WINDOW: Window = { scans: 60, seconds: 60 }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The apps' settings, built from the environment (config.ts); a platform that is off is absent. */
export interface PlatformsDeps {
  /** The site's origin: reports are linked on it. */
  readonly origin: string
  /** The flow cookie's flag: the site is served over HTTPS. */
  readonly secure: boolean
  /** The key the flow's cookie is signed with, derived from the server's own secret. */
  readonly signingKey: Buffer
  readonly context: PlatformContext
  readonly handoff: Handoff
  readonly salla?: Salla
  readonly zid?: Zid
}

/** What the routes use of the API's own dependencies. */
export interface PlatformsMount {
  readonly platforms: PlatformsDeps
  readonly store: ScanStore
  readonly limiter: {
    take(key: string, window: Window, now: number): Promise<{ readonly ok: boolean }>
  }
  readonly address: (c: Context) => string | null
  readonly connectionKey: (address: string, now: Date) => string
  readonly now: () => Date
  readonly log: ((message: string) => void) | undefined
}

type Platform = 'salla' | 'zid'
const stateKey = (platform: Platform, nonce: string) => `platform-state:${platform}:${nonce}`

/**
 * The Salla and Zid apps' routes (M9, issue #41), under /api/platforms/<platform>/:
 * `install` and `callback` (the authorization code flow, with a signed cookie and a one-time
 * state), `webhook` (verified before it is read), and `panel` (the page the store's dashboard
 * opens inside itself). A platform that is off has none of them, and answers 404 as any address
 * the API does not have.
 */
export function mountPlatforms(app: Hono, mount: PlatformsMount): void {
  const { platforms } = mount
  const told = quietly('Platforms', mount.log)
  const tell = (error: unknown) => {
    told(new Error(error instanceof Error ? error.message : 'A platform request failed'))
  }

  /** One bucket per visitor for the install, callback and panel routes. Null: the request may go on. */
  const limited = async (c: Context): Promise<'unknown' | 'limited' | null> => {
    const address = mount.address(c)
    if (address === null) return 'unknown'
    const at = mount.now()
    const taken = await mount.limiter.take(
      `platforms:${mount.connectionKey(address, at)}`,
      VISITOR_WINDOW,
      at.getTime(),
    )
    return taken.ok ? null : 'limited'
  }

  const html = (
    c: Context,
    platform: Platform,
    body: string,
    status: 200 | 400 | 401 | 404 | 429 | 503,
    query?: Record<string, string | undefined>,
  ) => {
    c.header('Content-Security-Policy', policyFor(platform))
    return c.html(
      page({ platform, lang: langOf(query?.lang), theme: themeOf(query?.theme), body }),
      status,
    )
  }

  const webhook = (
    platform: Platform,
    verified: (c: Context, body: Buffer) => boolean,
    handle: (payload: unknown) => Promise<{ readonly kind: 'handled' | 'ignored' | 'invalid' }>,
  ) => {
    app.post(
      `${PLATFORMS_PATH}/${platform}/webhook`,
      bodyLimit({ maxSize: WEBHOOK_BYTES, onError: (c) => c.json({ error: 'too-large' }, 413) }),
      async (c) => {
        const body = Buffer.from(await c.req.arrayBuffer())
        // Before anything is read: a request that is not the platform's is told nothing.
        if (!verified(c, body)) return c.json({ error: 'unauthorized' }, 401)
        let payload: unknown
        try {
          payload = JSON.parse(body.toString('utf8'))
        } catch {
          return c.json({ error: 'bad-request' }, 400)
        }
        try {
          const outcome = await handle(payload)
          if (outcome.kind === 'invalid') return c.json({ error: 'bad-request' }, 400)
          return c.json({ ok: true })
        } catch (error) {
          // Not 2xx: the platform delivers it again.
          tell(error)
          return c.json({ error: 'unavailable' }, 503)
        }
      },
    )
  }

  const flow = (
    platform: Platform,
    authorizeUrl: (state: string) => string,
    finish: (c: Context, code: string) => Promise<Response>,
  ) => {
    const cookieName = `arablyzer_${platform}`
    const cookiePath = `${PLATFORMS_PATH}/${platform}`
    const fail = (c: Context, status: 400 | 429 | 503 = 400) =>
      html(c, platform, installedBody('ar', false, null), status)

    app.get(`${PLATFORMS_PATH}/${platform}/install`, async (c) => {
      const refused = await limited(c)
      if (refused === 'unknown') return c.json({ error: 'unavailable' }, 503)
      if (refused === 'limited') return c.json({ error: 'rate-limited' }, 429)
      const nonce = randomToken(32)
      await platforms.handoff.put(stateKey(platform, nonce), '1', FLOW_TTL_SECONDS)
      const expires = mount.now().getTime() + FLOW_TTL_SECONDS * 1000
      setCookie(
        c,
        cookieName,
        signFlow(platforms.signingKey, { n: nonce, r: platform, e: expires }),
        {
          httpOnly: true,
          sameSite: 'Lax',
          secure: platforms.secure,
          path: cookiePath,
          maxAge: FLOW_TTL_SECONDS,
        },
      )
      return c.redirect(authorizeUrl(nonce), 302)
    })

    app.get(`${PLATFORMS_PATH}/${platform}/callback`, async (c) => {
      const refused = await limited(c)
      if (refused === 'unknown') return fail(c, 503)
      if (refused === 'limited') return fail(c, 429)
      // The state is checked three ways before the code is spent: it is the one this browser was
      // given (the signed cookie), it is not past its time, and it has not been used (a one-time
      // value in the store). A forged, stale or replayed callback gets nothing.
      const cookie = verifyFlow(
        platforms.signingKey,
        getCookie(c, cookieName),
        mount.now().getTime(),
      )
      deleteCookie(c, cookieName, { path: cookiePath })
      const state = c.req.query('state') ?? ''
      if (cookie?.r !== platform || state === '' || !sameString(cookie.n, state)) return fail(c)
      if ((await platforms.handoff.take(stateKey(platform, state))) === null) return fail(c)
      const code = c.req.query('code') ?? ''
      if (c.req.query('error') !== undefined || !CODE_PATTERN.test(code)) return fail(c)
      try {
        return await finish(c, code)
      } catch (error) {
        tell(error)
        return fail(c, 503)
      }
    })
  }

  const { salla, zid } = platforms

  if (salla !== undefined) {
    flow(
      'salla',
      (state) => salla.authorizeUrl(state),
      async (c, code) => {
        const tokens = await salla.exchange(code)
        if (tokens === null) return html(c, 'salla', installedBody('ar', false, null), 400)
        const install = await salla.connectCustom(tokens)
        return html(
          c,
          'salla',
          installedBody('ar', install !== null, null),
          install === null ? 400 : 200,
        )
      },
    )
    webhook(
      'salla',
      (c, body) =>
        salla.verify(
          {
            signature: c.req.header('x-salla-signature'),
            authorization: c.req.header('authorization'),
          },
          body,
        ),
      (payload) => salla.onEvent(payload),
    )
    app.get(`${PLATFORMS_PATH}/salla/panel`, async (c) => {
      const query = { lang: c.req.query('lang'), theme: c.req.query('theme') }
      const refused = await limited(c)
      if (refused !== null)
        return html(
          c,
          'salla',
          noticeBody(langOf(query.lang), 'unavailable'),
          refused === 'limited' ? 429 : 503,
          query,
        )
      const token = c.req.query('token') ?? ''
      if (token === '' || token.length > 4096) {
        return html(c, 'salla', noticeBody(langOf(query.lang), 'expired'), 401, query)
      }
      // Salla vouches for the token, not the page: the merchant is whoever it names.
      const who = await salla.introspect(token)
      if (who === null)
        return html(c, 'salla', noticeBody(langOf(query.lang), 'unavailable'), 503, query)
      if (who === 'invalid')
        return html(c, 'salla', noticeBody(langOf(query.lang), 'expired'), 401, query)
      const install = await platforms.context.data.get('salla', who.merchant)
      if (install === null)
        return html(c, 'salla', noticeBody(langOf(query.lang), 'notInstalled'), 404, query)
      return panelOf(c, 'salla', install, query)
    })
  }

  if (zid !== undefined) {
    flow(
      'zid',
      (state) => zid.authorizeUrl(state),
      async (c, code) => {
        const tokens = await zid.exchange(code)
        const connected = tokens === null ? null : await zid.connect(tokens)
        if (connected === null) return html(c, 'zid', installedBody('ar', false, null), 400)
        // Back into Zid's dashboard, where the app opens inside it (Embedded Apps); without a
        // lookup token for the panel, a page that says what happened instead.
        return connected.embedded
          ? c.redirect(zid.dashboardUrl(), 302)
          : html(c, 'zid', installedBody('ar', true, zid.dashboardUrl()), 200)
      },
    )
    webhook(
      'zid',
      (c) => zid.verify(c.req.header(ZID_WEBHOOK_HEADER)),
      (payload) => zid.onEvent(payload),
    )
    app.get(`${PLATFORMS_PATH}/zid/panel`, async (c) => {
      const query = {
        lang: c.req.query('language') ?? c.req.query('lang'),
        theme: c.req.query('theme'),
      }
      const refused = await limited(c)
      if (refused !== null)
        return html(
          c,
          'zid',
          noticeBody(langOf(query.lang), 'unavailable'),
          refused === 'limited' ? 429 : 503,
          query,
        )
      const token = c.req.query('token') ?? ''
      if (!UUID.test(token))
        return html(c, 'zid', noticeBody(langOf(query.lang), 'notInstalled'), 404, query)
      const install = await platforms.context.data.byEmbedHash(hashLookupToken(token.toLowerCase()))
      if (install === null)
        return html(c, 'zid', noticeBody(langOf(query.lang), 'notInstalled'), 404, query)
      return panelOf(c, 'zid', install, query)
    })
  }

  /** The store's panel. A store with no audit at all gets one asked for: it is how a lost one heals. */
  async function panelOf(
    c: Context,
    platform: Platform,
    install: Parameters<typeof summaryOf>[1],
    query: Record<string, string | undefined>,
  ): Promise<Response> {
    try {
      let summary = await summaryOf({ data: platforms.context.data, store: mount.store }, install)
      if (summary.status === 'none' && install.status === 'active') {
        await wantAudit(platforms.context, install)
        summary = { ...summary, status: 'running' }
      }
      return html(
        c,
        platform,
        summaryBody(summary, langOf(query.lang), platforms.origin),
        200,
        query,
      )
    } catch (error) {
      tell(error)
      return html(c, platform, noticeBody(langOf(query.lang), 'unavailable'), 503, query)
    }
  }
}
