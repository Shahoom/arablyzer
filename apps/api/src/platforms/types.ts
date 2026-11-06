import type { PlatformData } from '@arablyzer/store'

/** What a store's platform handed us to act for it. */
export interface PlatformTokens {
  /** Salla's access token; Zid's `authorization` (sent as `Authorization: Bearer`). */
  readonly access: string
  readonly refresh: string | null
  /** Zid's `access_token`, sent as `X-Manager-Token`. Salla has none. */
  readonly manager: string | null
  readonly expiresAt: Date
}

/** The platform's answer to one call: its status and body as JSON; both null when none came. */
export interface Answer {
  readonly status: number | null
  readonly body: unknown
}

export interface PlatformRequest {
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
  readonly json?: unknown
  readonly form?: Readonly<Record<string, string>>
}

/** One call to a platform, through the server's egress rules. */
export type PlatformHttp = (request: PlatformRequest) => Promise<Answer>

/** What both platforms' code is given. */
export interface PlatformContext {
  readonly data: PlatformData
  /** The key tokens are sealed with (crypto.ts). */
  readonly sealKey: Buffer
  readonly http: PlatformHttp
  readonly now: () => Date
  readonly newId: () => string
  readonly log: (error: Error) => void
}

/** The text of an unknown value when it is a non-empty string, else null. */
export const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

/** A property of an unknown value, which is any object's. */
export const prop = (value: unknown, name: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[name] : undefined
