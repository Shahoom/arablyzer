import { randomBytes } from 'node:crypto'
import { API_KEY_ID_PATTERN, SCAN_ID_PATTERN, type ScanState } from '@arablyzer/api-contract'
import { ADMIN_UI, type Lang } from '@arablyzer/i18n'
import {
  isOverrideNumber,
  OVERRIDE_NUMBER_FIELDS,
  type PlanOverrides,
  type Window,
} from '@arablyzer/plans'
import {
  quietly,
  type AdminData,
  type AdminUserRow,
  type AuditAction,
  type AuditDetail,
} from '@arablyzer/store'
import { Hono, type Context, type Next } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { ApiDeps } from '../app'
import {
  hasSessionCookie,
  planOf,
  type AccountsDeps,
  type AccountUser,
  type SessionAccess,
} from '../accounts'
import { fromTheSite } from '../guards'
import { ADMIN_CSS } from './css'
import { isAdmin } from './emails'
import { networkOf } from './network'
import { ADMIN_PATH, ASSET_PATH, esc, href, layout, PAGE_POLICY, type View } from './render'
import {
  auditPage,
  flash,
  overviewPage,
  reauthPage,
  scansPage,
  settingsPage,
  userMissingPage,
  userPage,
  usersPage,
  type UserDetail,
  type UsersRow,
} from './views'

/** The panel needs a sign-in this recent: a stolen cookie of an old session opens nothing. */
export const FRESH_HOURS = 12
const FRESH_MS = FRESH_HOURS * 3600 * 1000
/** What a visitor with a session cookie may ask of /admin, admin or not (a non-admin gets 404 either way). */
const PROBE: Window = { scans: 300, seconds: 60 }
/** What one administrator may ask of the panel. */
const PER_ADMIN: Window = { scans: 120, seconds: 60 }
const PAGE_SIZE = 25
const FORM_BYTES = 8 * 1024
/** A person's id as the library makes it, and as this route takes it. */
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/

interface AdminContext {
  readonly user: AccountUser
  readonly view: View
}

export interface AdminMountDeps {
  readonly deps: ApiDeps & { accounts: AccountsDeps }
  readonly access: SessionAccess
  readonly admin: AdminData
  readonly emails: readonly string[]
  readonly startedAt: Date
}

const newAuditId = (): string => randomBytes(16).toString('base64url')

const pageNumber = (raw: string | undefined): number => {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1
}

/**
 * The owner's panel (M4.8): server-rendered pages under /admin, answered by the API so that
 * nothing static says they exist. Everything that is not an administrator with a fresh sign-in
 * gets the answer an unknown address gets, a 404 with the same body. No script runs on any page.
 */
export function mountAdmin(app: Hono, mount: AdminMountDeps): void {
  const { deps, access, admin, emails } = mount
  const { accounts } = deps
  const now = deps.now ?? (() => new Date())
  const told = quietly('Admin', deps.log)
  const sub = new Hono()
  // Keyed by the request object Hono keeps for the whole call (bodyLimit swaps the raw one).
  const contexts = new WeakMap<object, AdminContext>()

  const viewOf = (c: Context, user: AccountUser): View => {
    const lang: Lang = c.req.query('lang') === 'en' ? 'en' : 'ar'
    return { lang, t: ADMIN_UI[lang], email: user.email, now: now() }
  }
  const html = (c: Context, body: string, status: 200 | 404 | 429 | 503 = 200) => {
    c.header('Content-Security-Policy', PAGE_POLICY)
    c.header('X-Frame-Options', 'DENY')
    return c.html(body, status)
  }
  const ctxOf = (c: Context): AdminContext => {
    const found = contexts.get(c.req)
    if (found === undefined) throw new Error('An admin route ran without its guard')
    return found
  }

  // The guard: who may see anything at all, then how fresh their sign-in is, then how often.
  const exempt = new Set([ASSET_PATH, `${ADMIN_PATH}/reauth`, `${ADMIN_PATH}/signout`])
  sub.use('*', async (c: Context, next: Next) => {
    const at = now()
    const address = deps.address(c)
    // No address, no cookie, a limited visitor, no session, someone else: all the same 404.
    if (address === null || !hasSessionCookie(c.req.header('cookie'))) return c.notFound()
    const probe = await deps.limiter
      .take(`admin-probe:${deps.connectionKey(address, at)}`, PROBE, at.getTime())
      .catch(() => ({ ok: false as const }))
    if (!probe.ok) return c.notFound()
    const read = await access.session(c)
    if (read.kind !== 'user' || !isAdmin(emails, read.user)) return c.notFound()
    const view = viewOf(c, read.user)
    for (const cookie of read.cookies) c.header('Set-Cookie', cookie, { append: true })
    if (!exempt.has(new URL(c.req.url).pathname)) {
      if (at.getTime() - read.signedInAt.getTime() > FRESH_MS) {
        return c.redirect(href(view.lang, `${ADMIN_PATH}/reauth`), 302)
      }
      const mine = await deps.limiter
        .take(`admin-user:${read.user.id}`, PER_ADMIN, at.getTime())
        .catch(() => ({ ok: true as const }))
      if (!mine.ok) {
        c.header('Retry-After', String(mine.retryAfterSeconds))
        return html(
          c,
          layout(
            view,
            null,
            view.t.common.tooMany,
            `<p class="flash bad">${esc(view.t.common.tooMany)}</p>`,
          ),
          429,
        )
      }
    }
    contexts.set(c.req, { user: read.user, view })
    await next()
    return undefined
  })

  sub.post(
    '*',
    fromTheSite({
      origin: deps.origin,
      json: false,
      refuse: (c) => c.json({ error: 'bad-request' }, 400),
      foreign: told,
    }),
    async (c: Context, next: Next) => {
      if (c.req.header('sec-fetch-site') === 'cross-site')
        return c.json({ error: 'bad-request' }, 400)
      await next()
      return undefined
    },
    bodyLimit({ maxSize: FORM_BYTES, onError: (c) => c.json({ error: 'bad-request' }, 413) }),
  )

  /** A page that reads: a failure is a 503 page, told by its message alone. */
  const reading =
    (render: (c: Context, a: AdminContext) => Promise<Response>) =>
    async (c: Context): Promise<Response> => {
      const a = ctxOf(c)
      try {
        return await render(c, a)
      } catch (thrown) {
        told(new Error(thrown instanceof Error ? thrown.message : 'The panel failed'))
        return html(
          c,
          layout(
            a.view,
            null,
            a.view.t.common.unavailable,
            `<p class="flash bad">${esc(a.view.t.common.unavailable)}</p>`,
          ),
          503,
        )
      }
    }

  const record = (
    c: Context,
    a: AdminContext,
    action: AuditAction,
    target: { readonly id: string; readonly email: string } | null,
    detail: AuditDetail = {},
  ) =>
    admin.audit({
      id: newAuditId(),
      at: now(),
      actorId: a.user.id,
      actorEmail: a.user.email,
      action,
      targetId: target?.id ?? null,
      targetEmail: target?.email ?? null,
      detail,
      network: networkOf(deps.address(c)),
    })

  const usedOf = async (userId: string, window: Window): Promise<number | null> => {
    const left = await deps.limiter.remaining?.(`account:${userId}`, window, now().getTime())
    return left === undefined ? null : Math.max(0, window.scans - left)
  }

  // ---- assets and the sign-in-again page

  sub.get('/assets/admin.css', (c) =>
    c.body(ADMIN_CSS, 200, { 'Content-Type': 'text/css; charset=UTF-8' }),
  )
  sub.get('/reauth', (c) => {
    const a = ctxOf(c)
    return html(c, reauthPage(a.view, href(a.view.lang, `${ADMIN_PATH}/signout`), FRESH_HOURS))
  })
  sub.post('/signout', async (c) => {
    const a = ctxOf(c)
    try {
      const out = await accounts.auth.api.signOut({ headers: c.req.raw.headers, asResponse: true })
      for (const line of out.headers.getSetCookie()) c.header('Set-Cookie', line, { append: true })
    } catch (thrown) {
      told(new Error(thrown instanceof Error ? thrown.message : 'Sign-out failed'))
    }
    return c.redirect(a.view.lang === 'en' ? '/en/login' : '/login', 303)
  })

  // ---- overview

  const overview = reading(async (c, a) => {
    const at = now()
    const started = performance.now()
    const data = await admin.overview(at)
    const databaseMs = Math.round(performance.now() - started)
    const asked = performance.now()
    const queue = await deps.queue.waiting().then(
      (waiting) => ({ waiting, ms: Math.round(performance.now() - asked) }),
      () => null,
    )
    return html(
      c,
      overviewPage({ ...a.view, now: at }, data, {
        databaseMs,
        queue,
        uptimeSeconds: process.uptime(),
      }),
    )
  })
  sub.get('/', overview)

  // ---- users

  sub.get(
    '/users',
    reading(async (c, a) => {
      const q = (c.req.query('q') ?? '').trim().slice(0, 100)
      const page = pageNumber(c.req.query('page'))
      const found = await admin.users({ q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      const rows: UsersRow[] = await Promise.all(
        found.rows.map(async (row) => {
          const plan = await planOf(accounts.plans, row.id)
          return { row, plan, used: await usedOf(row.id, plan.scans) }
        }),
      )
      return html(
        c,
        usersPage(a.view, {
          q,
          rows,
          total: found.total,
          page,
          pages: Math.max(1, Math.ceil(found.total / PAGE_SIZE)),
        }),
      )
    }),
  )

  sub.get(
    '/users/:id',
    reading(async (c, a) => {
      const id = c.req.param('id') ?? ''
      if (!USER_ID.test(id)) return c.notFound()
      const row = await admin.user(id)
      if (row === null) return html(c, userMissingPage(a.view), 404)
      // Reading an account is an action: it is written first, and if it cannot be, nothing is shown.
      await record(c, a, 'user.view', { id: row.id, email: row.email })
      const at = now()
      const [state, plan, sites, history, audit] = await Promise.all([
        admin.state(id),
        planOf(accounts.plans, id),
        accounts.data.sites(id),
        accounts.data.history(id, 20),
        admin.auditLog({ targetId: id, limit: 20, offset: 0 }),
      ])
      const [monitors, crawls, pdfs, pdfUsed, keys, used] = await Promise.all([
        accounts.monitors?.monitors(id) ?? [],
        accounts.crawls === undefined
          ? []
          : accounts.crawls.latestPerSite(id).then((m) => [...m.values()]),
        accounts.pdfs?.list(id, 10) ?? [],
        accounts.pdfs?.used(id, at) ?? 0,
        accounts.apiKeys?.list(id) ?? [],
        usedOf(id, plan.scans),
      ])
      const detail: UserDetail = {
        row,
        overrides: state.overrides,
        base: accounts.plans.account,
        plan,
        used,
        pdfUsed,
        sites,
        history,
        monitors,
        crawls,
        pdfs,
        keys,
        audit: audit.rows,
        self: row.id === a.user.id,
      }
      const view = { ...a.view, now: at }
      return html(c, userPage(view, detail, flash(view, c.req.query('done'), c.req.query('error'))))
    }),
  )

  /** Where an action sends the admin back to, with what happened. */
  const back = (
    c: Context,
    a: AdminContext,
    userId: string,
    outcome: { done?: string; error?: string },
  ) =>
    c.redirect(href(a.view.lang, `${ADMIN_PATH}/users/${encodeURIComponent(userId)}`, outcome), 303)

  /**
   * An action on an account: the account must exist, the second click must have come with it
   * (`confirm=yes`), and the audit row is written before anything is done.
   */
  const onUser =
    (
      run: (input: {
        readonly c: Context
        readonly a: AdminContext
        readonly row: AdminUserRow
        readonly form: Readonly<Record<string, string>>
        readonly params: Readonly<Record<string, string>>
      }) => Promise<Response>,
      options: { readonly notOnSelf?: boolean } = {},
    ) =>
    async (c: Context): Promise<Response> => {
      const a = ctxOf(c)
      const id = c.req.param('id') ?? ''
      if (!USER_ID.test(id)) return c.notFound()
      try {
        const raw: Record<string, unknown> = await c.req.parseBody().catch(() => ({}))
        const form: Record<string, string> = {}
        for (const [key, value] of Object.entries(raw))
          form[key] = typeof value === 'string' ? value : ''
        if (form.confirm !== 'yes') return back(c, a, id, { error: 'confirm' })
        const row = await admin.user(id)
        if (row === null) {
          return c.redirect(href(a.view.lang, `${ADMIN_PATH}/users`, { error: 'missing' }), 303)
        }
        if (options.notOnSelf === true && row.id === a.user.id) {
          return back(c, a, id, { error: 'self' })
        }
        return await run({ c, a, row, form, params: c.req.param() })
      } catch (thrown) {
        told(new Error(thrown instanceof Error ? thrown.message : 'An admin action failed'))
        return back(c, a, id, { error: 'failed' })
      }
    }

  const sessionsOf = async () => (await accounts.auth.$context).internalAdapter

  sub.post(
    '/users/:id/suspend',
    onUser(
      async ({ c, a, row }) => {
        await record(c, a, 'user.suspend', row)
        await admin.setSuspended(row.id, now(), now())
        // Sessions end now; monitors stop scanning for an account that cannot sign in.
        await (await sessionsOf()).deleteUserSessions(row.id)
        await accounts.monitors?.pauseExtras(row.id, 0)
        return back(c, a, row.id, { done: 'suspend' })
      },
      { notOnSelf: true },
    ),
  )
  sub.post(
    '/users/:id/unsuspend',
    onUser(
      async ({ c, a, row }) => {
        await record(c, a, 'user.unsuspend', row)
        await admin.setSuspended(row.id, null, now())
        return back(c, a, row.id, { done: 'unsuspend' })
      },
      { notOnSelf: true },
    ),
  )
  sub.post(
    '/users/:id/revoke-sessions',
    onUser(async ({ c, a, row }) => {
      await record(c, a, 'user.revoke_sessions', row, { sessions: row.sessions })
      await (await sessionsOf()).deleteUserSessions(row.id)
      return back(c, a, row.id, { done: 'sessions' })
    }),
  )
  sub.post(
    '/users/:id/keys/:keyId/revoke',
    onUser(async ({ c, a, row, params }) => {
      const keyId = params.keyId ?? ''
      const keys = accounts.apiKeys
      const key = API_KEY_ID_PATTERN.test(keyId)
        ? (await keys?.list(row.id))?.find((kept) => kept.id === keyId)
        : undefined
      if (keys === undefined || key === undefined) return back(c, a, row.id, { error: 'missing' })
      await record(c, a, 'user.revoke_key', row, { prefix: key.prefix })
      await keys.revoke(row.id, key.id)
      return back(c, a, row.id, { done: 'key' })
    }),
  )
  sub.post(
    '/users/:id/overrides',
    onUser(async ({ c, a, row, form }) => {
      const next: { -readonly [K in keyof PlanOverrides]: PlanOverrides[K] } = {}
      for (const field of OVERRIDE_NUMBER_FIELDS) {
        const raw = (form[field] ?? '').trim()
        if (raw === '') continue
        const value = /^\d{1,7}$/.test(raw) ? Number(raw) : Number.NaN
        if (!isOverrideNumber(field, value)) return back(c, a, row.id, { error: 'numbers' })
        next[field] = value
      }
      if (form.whiteLabel === 'on') next.whiteLabel = true
      else if (form.whiteLabel === 'off') next.whiteLabel = false
      await record(c, a, 'user.overrides', row, {
        ...next,
        cleared: Object.keys(next).length === 0,
      })
      await admin.setOverrides(row.id, next, now())
      return back(c, a, row.id, { done: 'overrides' })
    }),
  )
  sub.post(
    '/users/:id/delete',
    onUser(
      async ({ c, a, row, form }) => {
        if ((form.email ?? '').trim().toLowerCase() !== row.email.toLowerCase()) {
          return back(c, a, row.id, { error: 'email' })
        }
        await record(c, a, 'user.delete', row)
        // The erasure the account's own deletion runs, then the account: the audit row just
        // written loses the address and takes a hash for the id in the first step.
        await accounts.erase?.(row.id)
        await (await sessionsOf()).deleteUser(row.id)
        return c.redirect(href(a.view.lang, `${ADMIN_PATH}/users`, { done: 'deleted' }), 303)
      },
      { notOnSelf: true },
    ),
  )

  // ---- scans

  const STATES: readonly ScanState[] = ['queued', 'running', 'complete', 'partial', 'failed']
  sub.get(
    '/scans',
    reading(async (c, a) => {
      const page = pageNumber(c.req.query('page'))
      const stateParam = c.req.query('state')
      const state = STATES.find((s) => s === stateParam)
      const host = (c.req.query('host') ?? '').trim().slice(0, 100)
      const at = now()
      const [found, top] = await Promise.all([
        admin.scans({
          ...(state === undefined ? {} : { state }),
          host,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        }),
        admin.topHosts(new Date(at.getTime() - 7 * 86_400_000), 10),
      ])
      const view = { ...a.view, now: at }
      return html(
        c,
        scansPage(
          view,
          {
            rows: found.rows,
            total: found.total,
            page,
            pages: Math.max(1, Math.ceil(found.total / PAGE_SIZE)),
            state,
            host,
            top,
          },
          flash(view, c.req.query('done'), c.req.query('error')),
        ),
      )
    }),
  )
  sub.post('/scans/:id/delete', async (c) => {
    const a = ctxOf(c)
    const id = c.req.param('id')
    if (!SCAN_ID_PATTERN.test(id)) return c.notFound()
    const to = (outcome: { done?: string; error?: string }) =>
      c.redirect(
        href(a.view.lang, `${ADMIN_PATH}/scans`, {
          ...outcome,
          state: c.req.query('state'),
          host: c.req.query('host'),
        }),
        303,
      )
    try {
      const form: Record<string, unknown> = await c.req.parseBody().catch(() => ({}))
      if (form.confirm !== 'yes') return to({ error: 'confirm' })
      await record(c, a, 'scan.delete', null, { scanId: id })
      return (await admin.deleteScan(id)) ? to({ done: 'scan' }) : to({ error: 'missing' })
    } catch (thrown) {
      told(new Error(thrown instanceof Error ? thrown.message : 'An admin action failed'))
      return to({ error: 'failed' })
    }
  })

  // ---- audit and settings

  sub.get(
    '/audit',
    reading(async (c, a) => {
      const page = pageNumber(c.req.query('page'))
      const found = await admin.auditLog({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      return html(
        c,
        auditPage(a.view, {
          rows: found.rows,
          total: found.total,
          page,
          pages: Math.max(1, Math.ceil(found.total / PAGE_SIZE)),
        }),
      )
    }),
  )
  sub.get(
    '/settings',
    reading((c, a) =>
      Promise.resolve(
        html(
          c,
          settingsPage(a.view, {
            plans: accounts.plans,
            limits: deps.limits,
            authLimits: accounts.limits,
            flags: {
              suggest: deps.search?.suggest ?? false,
              serp: deps.search?.serp ?? false,
              mail: accounts.mail?.available ?? false,
              searchConsole: deps.gsc !== undefined,
              monitors: accounts.monitors !== undefined,
              crawls: accounts.crawls !== undefined,
              pdfs: accounts.pdfs !== undefined,
              keys: accounts.apiKeys !== undefined,
            },
            admins: emails.length,
            node: process.version,
            platform: `${process.platform} ${process.arch}`,
            startedAt: mount.startedAt,
          }),
        ),
      ),
    ),
  )

  app.route(ADMIN_PATH, sub)
}
