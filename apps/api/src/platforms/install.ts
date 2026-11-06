import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Platform, PlatformInstall, TokenPatch } from '@arablyzer/store'
import { open, seal } from './crypto'
import { text, type PlatformContext, type PlatformTokens } from './types'

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS
/** The shortest time between two audits of one store: the platform's updates cannot flood the scanner. */
export const AUDIT_GAP_MS = DAY_MS

/** What each platform's code offers the audit loop (audit.ts) and the panel. */
export interface PlatformApp {
  readonly platform: Platform
  /** Teaches the install its storefront address, if the platform can say it; the install as it is after. */
  learn(install: PlatformInstall): Promise<PlatformInstall>
  /** Trades the install's refresh token for new tokens, or drops the tokens the platform refuses. */
  refresh(install: PlatformInstall): Promise<void>
}

/** The name sealed values are bound to: a copy onto another store's row does not open. */
const contextOf = (platform: Platform, storeKey: string): string => `${platform}:${storeKey}`

export function sealTokens(
  ctx: PlatformContext,
  platform: Platform,
  storeKey: string,
  tokens: PlatformTokens,
  refreshDueAt: Date | null,
): TokenPatch {
  return {
    sealed: seal(ctx.sealKey, contextOf(platform, storeKey), tokens),
    expiresAt: tokens.expiresAt,
    at: ctx.now(),
    refreshDueAt,
  }
}

export function openTokens(ctx: PlatformContext, install: PlatformInstall): PlatformTokens | null {
  if (install.sealedTokens === null) return null
  return open(ctx.sealKey, contextOf(install.platform, install.storeKey), install.sealedTokens)
}

/**
 * A storefront address as the audit scans it: http or https, no credentials, no query and no
 * fragment; a bare host name gets https. Null for anything else. The scan still vets it (DNS and
 * the egress rules) before it is queued: this only keeps what is stored tidy.
 */
export function storeUrlOf(raw: unknown): string | null {
  const value = text(raw)
  if (value === null || value.length > 2048) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username !== '' || url.password !== '') return null
  url.search = ''
  url.hash = ''
  return url.href
}

/** Asks for an audit of the store, no sooner than the gap after its last one. */
export async function wantAudit(ctx: PlatformContext, install: PlatformInstall): Promise<void> {
  const now = ctx.now()
  const after =
    install.lastAuditAt === null ? now : new Date(install.lastAuditAt.getTime() + AUDIT_GAP_MS)
  await ctx.data.scheduleAudit(install.id, after > now ? after : now)
}

/** The hash a lookup token is kept by: 128 or more random bits need no salt. */
export const hashLookupToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

/** Whether two strings are the same, in time that does not tell where they first differ. */
export function same(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** HMAC-SHA-256 of the body under the secret, in hex: what Salla signs a webhook with. */
export const hmacHex = (secret: string, body: Buffer): string =>
  createHmac('sha256', secret).update(body).digest('hex')

/**
 * When the platform's expiry is a unix time (the webhook's `expires`), a count of seconds from
 * now (the token endpoint's `expires`, `expires_in`), or missing: the date it means.
 */
export function expiryOf(value: unknown, now: Date, fallbackMs: number): Date {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(number) || number <= 0) return new Date(now.getTime() + fallbackMs)
  return number > 1_000_000_000 ? new Date(number * 1000) : new Date(now.getTime() + number * 1000)
}
