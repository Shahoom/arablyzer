import { createHmac, randomBytes } from 'node:crypto'
import type { UrlErrorCode, WebhookKind } from '@arablyzer/api-contract'
import { safeFetch, type EgressPolicy, type Resolver } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import { parseTarget } from '../target'

/** The headers a receiver verifies: the time, and the HMAC-SHA256 of "<time>.<body>" with the secret. */
export const TIMESTAMP_HEADER = 'x-arablyzer-timestamp'
export const SIGNATURE_HEADER = 'x-arablyzer-signature'

const TIMEOUT_MS = 10_000
const MAX_BYTES = 16 * 1024

/** A signing secret: 32 random bytes, shown to the person once. */
export function newWebhookSecret(): string {
  return randomBytes(32).toString('base64url')
}

/** `sha256=<hex>`: what a receiver recomputes from the timestamp header, a dot, and the raw body. */
export function sign(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`
}

export type WebhookTarget =
  | { readonly ok: true; readonly url: string; readonly kind: WebhookKind; readonly host: string }
  | { readonly ok: false; readonly code: UrlErrorCode }

/**
 * A webhook address as saved: https only, no credentials, nothing the egress rules refuse (the
 * same checks as a scan's address, so a webhook cannot point at the server's own network). The
 * kind is told from the host, since Slack's and Discord's incoming webhooks take different bodies.
 */
export function webhookTarget(input: string, policy: EgressPolicy): WebhookTarget {
  const parsed = parseTarget(input.trim(), policy)
  if (!parsed.ok) return { ok: false, code: parsed.code }
  if (parsed.value.url.protocol !== 'https:') return { ok: false, code: 'unsupported-scheme' }
  const { host } = parsed.value
  const kind: WebhookKind =
    host === 'hooks.slack.com'
      ? 'slack'
      : host === 'discord.com' || host === 'discordapp.com' || host.endsWith('.discord.com')
        ? 'discord'
        : 'generic'
  return { ok: true, url: parsed.value.url.href, kind, host }
}

/** What an alert says, before it is put in a kind's body. */
export interface AlertMessage {
  readonly type: 'monitor.alert' | 'monitor.summary' | 'webhook.test'
  /** The sentences, one per line. */
  readonly lines: readonly string[]
  /** The structured part, for the generic body. */
  readonly data: Readonly<Record<string, unknown>>
  readonly at: Date
}

/** The body for the kind: Slack's `text`, Discord's `content`, or the generic JSON. */
export function bodyFor(kind: WebhookKind, message: AlertMessage): unknown {
  const text = message.lines.join('\n')
  if (kind === 'slack') return { text }
  // Discord caps a message at 2000 characters.
  if (kind === 'discord') return { content: text.slice(0, 2000) }
  return { type: message.type, version: 1, at: message.at.toISOString(), text, ...message.data }
}

export interface Delivery {
  /** The status the receiver answered, or null when it could not be reached. */
  readonly status: number | null
  readonly ok: boolean
}

export interface WebhookSender {
  send(
    webhook: { readonly url: string; readonly secret: string; readonly kind: WebhookKind },
    message: AlertMessage,
  ): Promise<Delivery>
}

export interface SenderOptions {
  readonly policy: EgressPolicy
  readonly resolver?: Resolver
  /** Another way to fetch; tests pass their own. */
  readonly fetcher?: typeof safeFetch
}

/**
 * Sends a message to a webhook through the egress rules (and the egress proxy where the server
 * has one), signed, once and without redirects. A 2xx answer is delivered; anything else, or no
 * answer, is not. The secret is never in a log or a result.
 */
export function webhookSender(options: SenderOptions): WebhookSender {
  return {
    async send(webhook, message) {
      const payload = bodyFor(webhook.kind, message)
      // The exact text safeFetch sends for a JSON body, so the signature covers the bytes on the wire.
      const body = JSON.stringify(payload)
      const timestamp = String(Math.floor(message.at.getTime() / 1000))
      try {
        const fetched = await (options.fetcher ?? safeFetch)(webhook.url, {
          userAgent: USER_AGENT,
          accept: 'application/json',
          policy: options.policy,
          ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
          timeoutMs: TIMEOUT_MS,
          maxBytes: MAX_BYTES,
          onTooLarge: 'truncate',
          json: payload,
          headers: {
            [TIMESTAMP_HEADER]: timestamp,
            [SIGNATURE_HEADER]: sign(webhook.secret, timestamp, body),
          },
        })
        const status = fetched.response?.status ?? null
        return { status, ok: status !== null && status >= 200 && status < 300 }
      } catch {
        return { status: null, ok: false }
      }
    },
  }
}
