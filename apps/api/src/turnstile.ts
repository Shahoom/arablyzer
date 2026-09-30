import { DEFAULT_POLICY, safeFetch, type EgressPolicy, type Resolver } from '@arablyzer/egress'

type Fetcher = typeof safeFetch

/** Cloudflare's server-side validation (developers.cloudflare.com/turnstile). */
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Turnstile's tokens are at most 2,048 characters, and live 300 seconds. */
const TOKEN_MAX = 2048

/** Whether a person sent the form, by the Turnstile token the page got. */
export type TurnstileCheck = (token: string) => Promise<boolean>

export interface TurnstileOptions {
  readonly secret: string
  readonly userAgent: string
  /** The site's host name: a token solved on any other site is refused. */
  readonly hostname?: string
  readonly policy?: EgressPolicy
  readonly resolver?: Resolver
  readonly timeoutMs?: number
  /** safeFetch; tests pass their own. */
  readonly fetcher?: Fetcher
}

/**
 * Checks tokens with Cloudflare, through the egress package: every request the server makes
 * leaves through it (BUILD-PLAN §13). The visitor's address is not sent: Cloudflare's check
 * does not need it (§14). An empty or overlong token, an answer that is not `success: true` for
 * the site's host name, and a failed request all refuse the scan.
 */
export function cloudflareTurnstile(options: TurnstileOptions): TurnstileCheck {
  return async (token) => {
    if (token === '' || token.length > TOKEN_MAX) return false
    const fetched = await (options.fetcher ?? safeFetch)(SITEVERIFY_URL, {
      userAgent: options.userAgent,
      accept: 'application/json',
      policy: options.policy ?? DEFAULT_POLICY,
      ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
      timeoutMs: options.timeoutMs ?? 5_000,
      maxBytes: 16 * 1024,
      json: { secret: options.secret, response: token },
    })
    if (fetched.response?.status !== 200) return false
    try {
      const body: unknown = JSON.parse(new TextDecoder().decode(fetched.response.body))
      if (typeof body !== 'object' || body === null) return false
      const answer = body as { success?: unknown; hostname?: unknown }
      return (
        answer.success === true &&
        (options.hostname === undefined || answer.hostname === options.hostname)
      )
    } catch {
      return false
    }
  }
}

/** No check, for development and tests only: server.ts refuses it in production. */
export const noTurnstile: TurnstileCheck = () => Promise.resolve(true)
