import type { PlatformInstall } from '@arablyzer/store'
import {
  DAY_MS,
  expiryOf,
  hmacHex,
  HOUR_MS,
  openTokens,
  same,
  sealTokens,
  storeUrlOf,
  wantAudit,
  type PlatformApp,
} from './install'
import { prop, text, type PlatformContext, type PlatformTokens } from './types'

// Salla's side of the app (docs.salla.dev: Authorization, Webhooks, App Events, Store Information,
// Embedded SDK / Authentication). Published apps get their tokens in the `app.store.authorize`
// webhook (Easy Mode); the authorize-and-callback flow below is Custom Mode, which Salla allows for
// development and testing and which this app also serves.

export const SALLA_AUTHORIZE_URL = 'https://accounts.salla.sa/oauth2/auth'
export const SALLA_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token'
export const SALLA_STORE_INFO_URL = 'https://api.salla.dev/admin/v2/store/info'
export const SALLA_INTROSPECT_URL = 'https://api.salla.dev/exchange-authority/v1/introspect'
/** Read-only store settings, for the store's address, and a refresh token. */
export const SALLA_SCOPE = 'settings.read offline_access'
/** A Salla access token lives two weeks (Authorization: "Access tokens expire after 2 weeks"). */
const ACCESS_LIFE_MS = 14 * DAY_MS
/** Refreshed this long before it expires, so a missed run still leaves days. */
const REFRESH_BEFORE_MS = 3 * DAY_MS

export interface SallaSettings {
  readonly clientId: string
  readonly clientSecret: string
  /** The app's id in the Partners Portal: the `S-Source` of the embedded token's check. */
  readonly appId: string
  readonly webhookSecret: string
  /** `signature` (X-Salla-Signature, Salla's default for apps) or `token` (the secret as Authorization). */
  readonly webhookStrategy: 'signature' | 'token'
  /** `<site origin>/api/platforms/salla/callback`: the exact address registered as the callback. */
  readonly redirectUri: string
}

export type SallaEvent =
  { readonly kind: 'handled' } | { readonly kind: 'ignored' } | { readonly kind: 'invalid' }

/** Merchant ids are numbers; this keeps the key to digits, whatever the payload says. */
const MERCHANT = /^\d{1,20}$/
const merchantOf = (value: unknown): string | null => {
  const raw = typeof value === 'number' ? String(value) : text(value)
  return raw !== null && MERCHANT.test(raw) ? raw : null
}

export function createSalla(ctx: PlatformContext, settings: SallaSettings) {
  const refreshDueOf = (expiresAt: Date): Date => {
    const at = ctx.now()
    const due = new Date(expiresAt.getTime() - REFRESH_BEFORE_MS)
    const soonest = new Date(at.getTime() + HOUR_MS)
    return due > soonest ? due : soonest
  }

  /** The token endpoint's answer as tokens; null when it says no. */
  const tokensFrom = (
    status: number | null,
    body: unknown,
    previous?: string,
  ): PlatformTokens | null => {
    const access = text(prop(body, 'access_token'))
    if (status !== 200 || access === null) return null
    return {
      access,
      refresh: text(prop(body, 'refresh_token')) ?? previous ?? null,
      manager: null,
      expiresAt: expiryOf(
        prop(body, 'expires') ?? prop(body, 'expires_in'),
        ctx.now(),
        ACCESS_LIFE_MS,
      ),
    }
  }

  const api = {
    authorizeUrl(state: string): string {
      const url = new URL(SALLA_AUTHORIZE_URL)
      url.search = new URLSearchParams({
        client_id: settings.clientId,
        response_type: 'code',
        redirect_uri: settings.redirectUri,
        scope: SALLA_SCOPE,
        state,
      }).toString()
      return url.href
    },

    /** Custom Mode: the code from the callback for tokens. Null when Salla refuses. */
    async exchange(code: string): Promise<PlatformTokens | null> {
      const answer = await ctx.http({
        url: SALLA_TOKEN_URL,
        form: {
          grant_type: 'authorization_code',
          code,
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          redirect_uri: settings.redirectUri,
        },
      })
      return tokensFrom(answer.status, answer.body)
    },

    /**
     * New tokens for a refresh token (single use: Salla revokes everything issued from one that is
     * used twice). 'revoked' when Salla says the grant is gone, null when it could not be asked.
     */
    async refreshTokens(refresh: string): Promise<PlatformTokens | 'revoked' | null> {
      const answer = await ctx.http({
        url: SALLA_TOKEN_URL,
        form: {
          grant_type: 'refresh_token',
          refresh_token: refresh,
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
        },
      })
      const tokens = tokensFrom(answer.status, answer.body)
      if (tokens !== null) return tokens
      return answer.status === 400 || answer.status === 401 ? 'revoked' : null
    },

    /** The store's name and storefront address; 'unauthorized' when the token is no good. */
    async storeInfo(access: string) {
      const answer = await ctx.http({
        url: SALLA_STORE_INFO_URL,
        headers: { authorization: `Bearer ${access}` },
      })
      if (answer.status === 401 || answer.status === 403) return 'unauthorized' as const
      const data = prop(answer.body, 'data')
      if (answer.status !== 200 || data === undefined) return null
      return {
        key: merchantOf(prop(data, 'id')),
        name: text(prop(data, 'name')),
        url: storeUrlOf(prop(data, 'domain')),
      }
    },

    /**
     * The merchant behind the short-lived token a Salla dashboard opens the app with. The app's
     * id is the `S-Source`, so another app's token does not verify as ours.
     */
    async introspect(token: string): Promise<{ merchant: string } | 'invalid' | null> {
      const answer = await ctx.http({
        url: SALLA_INTROSPECT_URL,
        headers: { 's-source': settings.appId },
        json: { token },
      })
      if (answer.status === 401 || answer.status === 403 || answer.status === 400) return 'invalid'
      const merchant = merchantOf(prop(prop(answer.body, 'data'), 'merchant_id'))
      if (answer.status !== 200 || prop(answer.body, 'success') !== true || merchant === null) {
        return null
      }
      return { merchant }
    },

    /** Whether the request is Salla's: the signature of the raw body, or the token, as set. */
    verify(
      headers: { signature: string | undefined; authorization: string | undefined },
      body: Buffer,
    ): boolean {
      if (settings.webhookStrategy === 'token') {
        const given = headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
        return given !== '' && same(given, settings.webhookSecret)
      }
      const given = headers.signature?.trim().toLowerCase() ?? ''
      return given !== '' && same(given, hmacHex(settings.webhookSecret, body))
    },
  }

  /** Stores the tokens of a store, learns its address with them, and asks for its audit. */
  async function connect(
    merchant: string,
    tokens: PlatformTokens,
    known?: Exclude<Awaited<ReturnType<typeof api.storeInfo>>, 'unauthorized' | null>,
  ): Promise<PlatformInstall> {
    const at = ctx.now()
    const made = await ctx.data.upsert({
      id: ctx.newId(),
      platform: 'salla',
      storeKey: merchant,
      patch: { tokens: sealTokens(ctx, 'salla', merchant, tokens, refreshDueOf(tokens.expiresAt)) },
      at,
    })
    let install = made.install
    const info = known ?? (await api.storeInfo(tokens.access))
    if (info !== null && info !== 'unauthorized') {
      install = (
        await ctx.data.upsert({
          id: install.id,
          platform: 'salla',
          storeKey: merchant,
          patch: {
            ...(info.name === null ? {} : { storeName: info.name }),
            ...(info.url === null ? {} : { storeUrl: info.url }),
          },
          at,
        })
      ).install
    }
    await wantAudit(ctx, install)
    return install
  }

  /** Custom Mode: the store behind fresh tokens is the one Salla's store information names. */
  async function connectCustom(tokens: PlatformTokens): Promise<PlatformInstall | null> {
    const info = await api.storeInfo(tokens.access)
    if (info === null || info === 'unauthorized' || info.key === null) return null
    return connect(info.key, tokens, info)
  }

  async function learn(install: PlatformInstall): Promise<PlatformInstall> {
    let tokens = openTokens(ctx, install)
    if (tokens === null) return install
    let info = await api.storeInfo(tokens.access)
    if (info === 'unauthorized') {
      await refresh(install)
      const again = await ctx.data.get('salla', install.storeKey)
      tokens = again === null ? null : openTokens(ctx, again)
      info = tokens === null ? null : await api.storeInfo(tokens.access)
    }
    if (info === null || info === 'unauthorized') return install
    return (
      await ctx.data.upsert({
        id: install.id,
        platform: 'salla',
        storeKey: install.storeKey,
        patch: {
          ...(info.name === null ? {} : { storeName: info.name }),
          ...(info.url === null ? {} : { storeUrl: info.url }),
        },
        at: ctx.now(),
      })
    ).install
  }

  async function refresh(install: PlatformInstall): Promise<void> {
    const tokens = openTokens(ctx, install)
    if (tokens?.refresh == null) {
      await ctx.data.dropTokens(install.id)
      return
    }
    const next = await api.refreshTokens(tokens.refresh)
    if (next === null) return
    if (next === 'revoked') {
      await ctx.data.dropTokens(install.id)
      return
    }
    await ctx.data.upsert({
      id: install.id,
      platform: 'salla',
      storeKey: install.storeKey,
      patch: {
        tokens: sealTokens(ctx, 'salla', install.storeKey, next, refreshDueOf(next.expiresAt)),
      },
      at: ctx.now(),
    })
  }

  /**
   * One webhook, already verified. The events the app lives by: the tokens (`app.store.authorize`),
   * the install, an update of the app or its settings (the store may have a new address, and gets
   * a fresh audit), and the uninstall, which deletes the store's tokens, audits and everything
   * else kept of it. Anything else is not ours to act on. Throws when the store fails, so the
   * route answers 503 and Salla delivers it again.
   */
  async function onEvent(payload: unknown): Promise<SallaEvent> {
    const event = text(prop(payload, 'event'))
    const merchant = merchantOf(prop(payload, 'merchant'))
    if (event === null || merchant === null) return { kind: 'invalid' }
    const data = prop(payload, 'data')
    switch (event) {
      case 'app.store.authorize': {
        const access = text(prop(data, 'access_token'))
        if (access === null) return { kind: 'invalid' }
        await connect(merchant, {
          access,
          refresh: text(prop(data, 'refresh_token')),
          manager: null,
          expiresAt: expiryOf(prop(data, 'expires'), ctx.now(), ACCESS_LIFE_MS),
        })
        return { kind: 'handled' }
      }
      case 'app.installed': {
        const { install } = await ctx.data.upsert({
          id: ctx.newId(),
          platform: 'salla',
          storeKey: merchant,
          patch: {},
          at: ctx.now(),
        })
        // The tokens may already be here (the authorize event can come first): then the store's
        // address is known and the audit can be asked for.
        if (install.storeUrl !== null) await wantAudit(ctx, install)
        return { kind: 'handled' }
      }
      case 'app.updated':
      case 'app.settings.updated': {
        const known = await ctx.data.get('salla', merchant)
        if (known === null) return { kind: 'ignored' }
        await wantAudit(ctx, await learn(known))
        return { kind: 'handled' }
      }
      case 'app.uninstalled':
        await ctx.data.erase('salla', merchant)
        return { kind: 'handled' }
      default:
        return { kind: 'ignored' }
    }
  }

  const app: PlatformApp = { platform: 'salla', learn, refresh }
  return { ...api, connect, connectCustom, onEvent, app }
}

export type Salla = ReturnType<typeof createSalla>
