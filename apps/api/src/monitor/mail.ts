/** The variable that names the mail provider; unset, mail is off (M4.3). */
export const MAIL_PROVIDER_VARIABLE = 'ARABLYZER_MAIL_PROVIDER'

/**
 * Where an alert can go besides a webhook. No provider is built yet (Resend comes with the email
 * path, docs/design/plans/m4.1-accounts.md): `noMailer` is the only one, and `available` is what
 * the page reads to hide the email switch. A provider is one class with this shape.
 */
export interface Mailer {
  /** Whether mail can be sent at all. */
  readonly available: boolean
  /** True when the message was handed to the provider. */
  send(message: {
    readonly to: string
    readonly subject: string
    readonly text: string
  }): Promise<boolean>
}

export const noMailer: Mailer = {
  available: false,
  send: () => Promise.resolve(false),
}

/**
 * The mailer the environment names. Unset (or `off`) is off. Any provider named before one is
 * built is a mistake worth stopping for: the owner would believe alerts are mailed.
 */
export function mailerFrom(env: Readonly<Record<string, string | undefined>>): Mailer {
  const provider = env[MAIL_PROVIDER_VARIABLE]?.trim() ?? ''
  if (provider === '' || provider === 'off') return noMailer
  throw new Error(
    `${MAIL_PROVIDER_VARIABLE}=${provider}: no mail provider is built yet; leave it unset`,
  )
}
