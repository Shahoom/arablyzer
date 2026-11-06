import { randomUUID } from 'node:crypto'
import type { PlatformInstall } from '@arablyzer/store'
import {
  DAY_MS,
  expiryOf,
  hashLookupToken,
  openTokens,
  same,
  sealTokens,
  storeUrlOf,
  wantAudit,
  type PlatformApp,
} from './install'
import { prop, text, type PlatformContext, type PlatformTokens } from './types'

// Zid's side of the app (docs.zid.sa: Authorization, Public Apps OAuth Requirements, Embedded Apps,
// Subscription and app events, Webhooks, Retrieve Store Manager Profile).

export const ZID_AUTHORIZE_URL = 'https://oauth.zid.sa/oauth/authorize'
export const ZID_TOKEN_URL = 'https://oauth.zid.sa/oauth/token'
export const ZID_API = 'https://api.zid.sa/v1'
/** The embedded app's lookup token is registered with this scope (Embedded Apps, step 1). */
export const ZID_SCOPE = 'embedded_apps_tokens_write'
/** The header the owner adds to the webhook in the Partner Dashboard (Zid sends the headers it is given). */
export const ZID_WEBHOOK_HEADER = 'x-arablyzer-webhook-token'
/** A token issued today lives three years (Authorization: "Token lifetimes"). */
const ACCESS_LIFE_MS = 3 * 365 * DAY_MS
/** The refresh token lives a year; Zid says to refresh about every ten months, on a calendar. */
const REFRESH_EVERY_MS = 300 * DAY_MS

export interface ZidSettings {
  readonly clientId: string
  readonly clientSecret: string
  /** The app's id: events of other apps are not ours, and the dashboard's embedded address has it. */
  readonly appId: string
  /** The secret value of the webhook header the owner sets. */
  readonly webhookSecret: string
  /** `<site origin>/api/platforms/zid/callback`: must match an allowed redirection URL exactly. */
  readonly redirectUri: string
}

export type ZidEvent =
  { readonly kind: 'handled' } | { readonly kind: 'ignored' } | { readonly kind: 'invalid' }

const STORE_KEY = /^[A-Za-z0-9-]{8,64}$/
const storeKeyOf = (value: unknown): string | null => {
  const raw = text(value)
  return raw !== null && STORE_KEY.test(raw) ? raw : null
}

export function createZid(ctx: PlatformContext, settings: ZidSettings) {
  const refreshDueOf = (): Date => new Date(ctx.now().getTime() + REFRESH_EVERY_MS)

  const tokensFrom = (status: number | null, body: unknown): PlatformTokens | null => {
    const access = text(prop(body, 'authorization'))
    const manager = text(prop(body, 'access_token'))
    if (status !== 200 || access === null || manager === null) return null
    return {
      access: access.replace(/^Bearer\s+/i, ''),
      refresh: text(prop(body, 'refresh_token')),
      manager,
      expiresAt: expiryOf(prop(body, 'expires_in'), ctx.now(), ACCESS_LIFE_MS),
    }
  }

  const headersOf = (tokens: PlatformTokens): Record<string, string> => ({
    authorization: `Bearer ${tokens.access}`,
    'x-manager-token': tokens.manager ?? '',
    'accept-language': 'ar',
  })

  const api = {
    authorizeUrl(state: string): string {
      const url = new URL(ZID_AUTHORIZE_URL)
      url.search = new URLSearchParams({
        client_id: settings.clientId,
        redirect_uri: settings.redirectUri,
        response_type: 'code',
        scope: ZID_SCOPE,
        state,
      }).toString()
      return url.href
    },

    /** The code (valid ten minutes, once) for tokens; null when Zid refuses. */
    async exchange(code: string): Promise<PlatformTokens | null> {
      const answer = await ctx.http({
        url: ZID_TOKEN_URL,
        form: {
          grant_type: 'authorization_code',
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          redirect_uri: settings.redirectUri,
          code,
        },
      })
      return tokensFrom(answer.status, answer.body)
    },

    /** A refresh returns a whole new set and revokes the old refresh token. */
    async refreshTokens(refresh: string): Promise<PlatformTokens | 'revoked' | null> {
      const answer = await ctx.http({
        url: ZID_TOKEN_URL,
        form: {
          grant_type: 'refresh_token',
          refresh_token: refresh,
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          redirect_uri: settings.redirectUri,
        },
      })
      const tokens = tokensFrom(answer.status, answer.body)
      if (tokens !== null) return tokens
      return answer.status === 400 || answer.status === 401 ? 'revoked' : null
    },

    /** Which store the tokens are for: its uuid and numeric id (Retrieve Store Manager Profile). */
    async profile(tokens: PlatformTokens) {
      const answer = await ctx.http({
        url: `${ZID_API}/managers/account/profile`,
        headers: headersOf(tokens),
      })
      const store = prop(prop(answer.body, 'user'), 'store')
      const key = storeKeyOf(prop(store, 'uuid'))
      if (answer.status !== 200 || key === null) return null
      return { key, name: text(prop(store, 'title')) ?? text(prop(store, 'username')) }
    },

    /** Tells Zid the lookup token its dashboard will open the app with (Embedded Apps, step 3). */
    async registerEmbedded(tokens: PlatformTokens, lookup: string): Promise<boolean> {
      const answer = await ctx.http({
        url: `${ZID_API}/managers/embedded-apps-token`,
        headers: headersOf(tokens),
        json: { token: lookup },
      })
      return answer.status !== null && answer.status >= 200 && answer.status < 300
    },

    /**
     * Whether the request is Zid's. Zid documents no signature for its webhooks, only headers the
     * owner chooses (Subscription and app events: "Add any headers you need for authentication"),
     * so the check is a secret in `ZID_WEBHOOK_HEADER`, compared in constant time.
     */
    verify(given: string | undefined): boolean {
      return given !== undefined && given !== '' && same(given, settings.webhookSecret)
    },

    /** The address of the store inside Zid's dashboard, where an install ends (Embedded Apps). */
    dashboardUrl(): string {
      return `https://dashboard.zid.sa/ar-sa/stores/1/apps/${encodeURIComponent(settings.appId)}/embedded`
    },
  }

  /**
   * The callback's work: the tokens of an authorization, whose store the profile names. A store
   * already known keeps its row and takes the new tokens (a reactivation brings a new pair), and
   * gets a new lookup token for its panel. Null when Zid cannot say which store it is.
   */
  async function connect(
    tokens: PlatformTokens,
  ): Promise<{ install: PlatformInstall; embedded: boolean } | null> {
    const profile = await api.profile(tokens)
    if (profile === null) return null
    const lookup = randomUUID()
    const embedded = await api.registerEmbedded(tokens, lookup)
    const { install } = await ctx.data.upsert({
      id: ctx.newId(),
      platform: 'zid',
      storeKey: profile.key,
      patch: {
        ...(profile.name === null ? {} : { storeName: profile.name }),
        tokens: sealTokens(ctx, 'zid', profile.key, tokens, refreshDueOf()),
        ...(embedded ? { embedTokenHash: hashLookupToken(lookup) } : {}),
      },
      at: ctx.now(),
    })
    if (install.storeUrl !== null) await wantAudit(ctx, install)
    return { install, embedded }
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
    // The whole set at once: the old refresh token is revoked, and the manager token is new too.
    await ctx.data.upsert({
      id: install.id,
      platform: 'zid',
      storeKey: install.storeKey,
      patch: { tokens: sealTokens(ctx, 'zid', install.storeKey, next, refreshDueOf()) },
      at: ctx.now(),
    })
  }

  /** The storefront's address comes only from Zid's install event, so there is nothing to learn. */
  const learn = (install: PlatformInstall): Promise<PlatformInstall> => Promise.resolve(install)

  /**
   * One webhook, already verified. Install and authorization events carry the store's address;
   * the uninstall deletes the store's tokens, audits and everything else kept of it. The events
   * of other apps, and the subscription events, are not ours to act on.
   */
  async function onEvent(payload: unknown): Promise<ZidEvent> {
    const event = text(prop(payload, 'event_name'))
    const appId = prop(payload, 'app_id')
    const store = storeKeyOf(prop(payload, 'store_uuid'))
    if (event === null || store === null) return { kind: 'invalid' }
    if (String(appId) !== settings.appId) return { kind: 'ignored' }
    switch (event) {
      case 'app.market.application.authorized':
      case 'app.market.application.install': {
        const url = storeUrlOf(prop(payload, 'store_url'))
        const { install } = await ctx.data.upsert({
          id: ctx.newId(),
          platform: 'zid',
          storeKey: store,
          patch: url === null ? {} : { storeUrl: url },
          at: ctx.now(),
        })
        if (install.storeUrl !== null) await wantAudit(ctx, install)
        return { kind: 'handled' }
      }
      case 'app.market.application.uninstall':
        await ctx.data.erase('zid', store)
        return { kind: 'handled' }
      default:
        return { kind: 'ignored' }
    }
  }

  const app: PlatformApp = { platform: 'zid', learn, refresh }
  return { ...api, connect, onEvent, app }
}

export type Zid = ReturnType<typeof createZid>
