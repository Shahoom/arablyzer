import { safeFetch, type EgressPolicy, type Resolver } from '@arablyzer/egress'

type Fetcher = typeof safeFetch

/** Cloudflare's server-side validation (developers.cloudflare.com/turnstile). */
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Turnstile's tokens are at most 2,048 characters, and live 300 seconds. */
const TOKEN_MAX = 2048

/**
 * Whether a string is a shape Turnstile issues: one character to 2,048 of visible ASCII. It
 * issues no token with a space, a control character or a letter of another script, and asking
 * Cloudflare about one costs a request and gets no answer worth having (security review, #30).
 */
export function isTurnstileToken(token: string): boolean {
  return token.length >= 1 && token.length <= TOKEN_MAX && /^[\x21-\x7e]+$/.test(token)
}

/** Whether a person sent the form, by the Turnstile token the page got. */
export type TurnstileCheck = (token: string) => Promise<boolean>

/**
 * Cloudflare's test secrets (developers.cloudflare.com/turnstile/troubleshooting/testing): 1x…
 * always passes, 2x… always fails, 3x… says the token is spent, each a digit, `x` and a run of
 * zeros. They pass or fail every token, whatever it is, so a deployment that keeps one has no
 * check at all. A real secret starts 0x4.
 */
export function isTurnstileTestSecret(secret: string): boolean {
  return /^[1-9]x0{8,}/.test(secret)
}

export interface TurnstileOptions {
  readonly secret: string
  readonly userAgent: string
  /** The site's host name: a token solved on any other site is refused. */
  readonly hostname?: string
  /**
   * The widget's `action`, which the answer must name: Cloudflare returns the action the widget
   * was rendered with, with its integrity protected, so a token made for another widget of the
   * same site key is refused (security review, issue #30). Unset, nothing is bound.
   */
  readonly action?: string
  /**
   * Whether an answer from one of Cloudflare's test keys is taken (`metadata.result_with_testing_key`,
   * which its answers to the test secrets carry): only in development and the end-to-end stack.
   * Such an answer names no action, so none is asked of it. Off, one is refused.
   */
  readonly allowTestKeys?: boolean
  /** The server's own (config.ts), with its egress proxy: required, so no check leaves around it. */
  readonly policy: EgressPolicy
  readonly resolver?: Resolver
  readonly timeoutMs?: number
  /** safeFetch; tests pass their own. */
  readonly fetcher?: Fetcher
}

/**
 * Checks tokens with Cloudflare, through the egress package: every request the server makes
 * leaves through it (BUILD-PLAN §13). The visitor's address is not sent: Cloudflare's check
 * does not need it (§14). A token of a shape Turnstile never issues (isTurnstileToken) is refused
 * without asking; so is an answer that is not `success: true` for the site's host name and the
 * widget's action, one from a test key unless they are allowed, and a failed request.
 */
export function cloudflareTurnstile(options: TurnstileOptions): TurnstileCheck {
  return async (token) => {
    if (!isTurnstileToken(token)) return false
    const fetched = await (options.fetcher ?? safeFetch)(SITEVERIFY_URL, {
      userAgent: options.userAgent,
      accept: 'application/json',
      policy: options.policy,
      ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
      timeoutMs: options.timeoutMs ?? 5_000,
      maxBytes: 16 * 1024,
      json: { secret: options.secret, response: token },
    })
    if (fetched.response?.status !== 200) return false
    try {
      const body: unknown = JSON.parse(new TextDecoder().decode(fetched.response.body))
      if (typeof body !== 'object' || body === null) return false
      const answer = body as {
        success?: unknown
        hostname?: unknown
        action?: unknown
        metadata?: { result_with_testing_key?: unknown } | null
      }
      if (answer.success !== true) return false
      if (options.hostname !== undefined && answer.hostname !== options.hostname) return false
      // A test key's answer says so, and names no action: it is taken only where they are allowed.
      if (answer.metadata?.result_with_testing_key === true) return options.allowTestKeys === true
      return options.action === undefined || answer.action === options.action
    } catch {
      return false
    }
  }
}

/** No check, for development and tests only: server.ts refuses it in production. */
export const noTurnstile: TurnstileCheck = () => Promise.resolve(true)
