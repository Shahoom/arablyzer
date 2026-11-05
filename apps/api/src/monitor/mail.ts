import { safeFetch, type EgressPolicy, type Resolver } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'

/** The variable that names the mail provider; unset (or `off`), mail is off. */
export const MAIL_PROVIDER_VARIABLE = 'ARABLYZER_MAIL_PROVIDER'
/** The sender of every automated message: `Arablyzer <alerts@send.example.com>`. */
export const MAIL_FROM_VARIABLE = 'ARABLYZER_MAIL_FROM'
/** Signs the unsubscribe links; at least 32 characters, shared by the API and the monitor. */
export const MAIL_SECRET_VARIABLE = 'ARABLYZER_MAIL_SECRET'
export const RESEND_KEY_VARIABLE = 'RESEND_API_KEY'

/** What became of one message: handed over, to be tried again, or refused for good. */
export type MailOutcome = 'sent' | 'retry' | 'rejected'

export interface MailMessage {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html: string
  /** `List-Unsubscribe` and the like. */
  readonly headers?: Readonly<Record<string, string>>
  /**
   * The same key for the same message: the provider answers a repeat with the first send, so a
   * retry after a lost answer cannot mail a person twice.
   */
  readonly idempotencyKey?: string
}

/**
 * Where an alert can go besides a webhook. `available` is what the page reads to show the email
 * switch. A provider is one object with this shape; `send` never throws.
 */
export interface Mailer {
  readonly available: boolean
  send(message: MailMessage): Promise<MailOutcome>
}

export const noMailer: Mailer = {
  available: false,
  send: () => Promise.resolve('rejected'),
}

const RESEND_URL = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000
const MAX_BYTES = 16 * 1024

/** Domains that are somebody's own mailbox, never an automated sender's. */
const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
])

const MAILBOX = /^(?:(.*?)\s*<([^<>\s]+)>|([^<>\s]+))$/
const ADDRESS = /^[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/

export interface Sender {
  /** The header as given to the provider: `Arablyzer <alerts@send.example.com>`. */
  readonly from: string
  readonly domain: string
}

/**
 * The sender, if it may be one. Automated mail leaves from a subdomain made for it
 * (`send.example.com`), never from the site's own domain, where the people's mailboxes are, and
 * never from a personal mail domain: a spam complaint about an alert must not reach the
 * reputation of anyone's inbox. `siteHost` is the site's host (`example.com`).
 */
export function senderFrom(raw: string, siteHost: string): Sender {
  const given = MAILBOX.exec(raw.trim())
  const name = given?.[1]?.trim() ?? ''
  const address = given?.[2] ?? given?.[3] ?? ''
  const match = ADDRESS.exec(address)
  if (match?.[1] === undefined || /[\r\n"]/.test(name)) {
    throw new Error(
      `${MAIL_FROM_VARIABLE} must be an address like Arablyzer <alerts@send.example.com>`,
    )
  }
  const domain = match[1].toLowerCase()
  const apex = siteHost.toLowerCase().split('.').slice(-2).join('.')
  if (PERSONAL_DOMAINS.has(domain) || domain === apex || !domain.endsWith(`.${apex}`)) {
    throw new Error(
      `${MAIL_FROM_VARIABLE} must be on a subdomain of ${apex} made for automated mail (send.${apex}), not on ${domain}`,
    )
  }
  return { from: name === '' ? address : `${name} <${address}>`, domain }
}

export interface ResendOptions {
  readonly apiKey: string
  readonly from: string
  readonly policy: EgressPolicy
  readonly resolver?: Resolver
  /** Another way to fetch; tests pass their own, which answers for Resend. */
  readonly fetcher?: typeof safeFetch
  /** Told the status of a failure, never the key, an address or a body. */
  readonly log?: (message: string) => void
}

/**
 * Resend, over the egress rules like every call that leaves the server. 2xx is sent. A malformed
 * message or address (400, 422) is refused for good; everything else (the provider down, rate
 * limited, a key or domain that is not set up yet, no answer) is tried again later, and a failing
 * provider never throws into the monitor.
 */
export function resendMailer(options: ResendOptions): Mailer {
  return {
    available: true,
    async send(message) {
      const payload = {
        from: options.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.headers === undefined ? {} : { headers: message.headers }),
      }
      try {
        const fetched = await (options.fetcher ?? safeFetch)(RESEND_URL, {
          userAgent: USER_AGENT,
          accept: 'application/json',
          policy: options.policy,
          ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
          timeoutMs: TIMEOUT_MS,
          maxBytes: MAX_BYTES,
          onTooLarge: 'truncate',
          json: payload,
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            ...(message.idempotencyKey === undefined
              ? {}
              : { 'idempotency-key': message.idempotencyKey }),
          },
        })
        const status = fetched.response?.status ?? null
        if (status !== null && status >= 200 && status < 300) return 'sent'
        options.log?.(`Resend answered ${status === null ? 'nothing' : String(status)}`)
        return status === 400 || status === 422 ? 'rejected' : 'retry'
      } catch {
        options.log?.('Resend could not be reached')
        return 'retry'
      }
    },
  }
}

export interface MailerContext {
  readonly policy: EgressPolicy
  readonly resolver?: Resolver
  readonly fetcher?: typeof safeFetch
  /** The site's host: the sender must be a subdomain of its domain. */
  readonly siteHost: string
  readonly log?: (message: string) => void
}

/** The sender and the secret of a provider that is on, read from the environment. */
export function mailSettingsFrom(
  env: Readonly<Record<string, string | undefined>>,
  siteHost: string,
): { readonly sender: Sender; readonly secret: string } | null {
  const provider = env[MAIL_PROVIDER_VARIABLE]?.trim() ?? ''
  if (provider === '' || provider === 'off') return null
  if (provider !== 'resend') {
    throw new Error(`${MAIL_PROVIDER_VARIABLE}=${provider}: the only provider is resend`)
  }
  const secret = env[MAIL_SECRET_VARIABLE]?.trim() ?? ''
  if (secret.length < 32) {
    throw new Error(`${MAIL_SECRET_VARIABLE} must be at least 32 characters with mail on`)
  }
  return { sender: senderFrom(env[MAIL_FROM_VARIABLE] ?? '', siteHost), secret }
}

/**
 * The mailer the environment names. Unset (or `off`) is off, and nothing else is read. A provider
 * that is named must be complete (its key, a sender on its own subdomain, the unsubscribe secret):
 * a half-set one stops the start rather than let the owner believe alerts are mailed.
 */
export function mailerFrom(
  env: Readonly<Record<string, string | undefined>>,
  context: MailerContext,
): Mailer {
  const settings = mailSettingsFrom(env, context.siteHost)
  if (settings === null) return noMailer
  const apiKey = env[RESEND_KEY_VARIABLE]?.trim() ?? ''
  if (apiKey === '') throw new Error(`${RESEND_KEY_VARIABLE} must be set with mail on`)
  return resendMailer({
    apiKey,
    from: settings.sender.from,
    policy: context.policy,
    ...(context.resolver === undefined ? {} : { resolver: context.resolver }),
    ...(context.fetcher === undefined ? {} : { fetcher: context.fetcher }),
    ...(context.log === undefined ? {} : { log: context.log }),
  })
}
