import { createHmac, timingSafeEqual } from 'node:crypto'
import { MAIL_SECRET_VARIABLE } from './mail'

/** Where the link lands; the page asks, and the button (or a mail client's one click) does it. */
export const UNSUBSCRIBE_PATH = '/api/mail/unsubscribe'

export interface Unsubscribe {
  /** The address in a person's mail that turns their email alerts off. */
  link(userId: string): string
  /** The person a token names, or null for anything that is not ours. */
  read(token: string): string | null
}

const PURPOSE = 'arablyzer/mail-unsubscribe/v1'

/**
 * Unsubscribe links without a table: the token is the account's id and an HMAC of it under a key
 * made from the secret and this one purpose, so it names nobody else and works for nothing else.
 * It does not expire (a link in an old mail must still stop the mail), and the only thing it can
 * do is turn that person's email alerts off.
 */
export function unsubscribeFor(secret: string, origin: string): Unsubscribe {
  const key = createHmac('sha256', secret).update(PURPOSE).digest()
  const mac = (id: string): Buffer => createHmac('sha256', key).update(id).digest()
  return {
    link(userId) {
      const token = `${Buffer.from(userId).toString('base64url')}.${mac(userId).toString('base64url')}`
      return `${origin}${UNSUBSCRIBE_PATH}?t=${token}`
    },
    read(token) {
      const [id, signature, ...rest] = token.split('.')
      if (id === undefined || signature === undefined || rest.length > 0) return null
      let userId: string
      let given: Buffer
      try {
        userId = Buffer.from(id, 'base64url').toString('utf8')
        given = Buffer.from(signature, 'base64url')
      } catch {
        return null
      }
      const expected = mac(userId)
      // Only the form this file writes: base64url ignores the spare bits of its last character, so
      // two spellings of one signature would otherwise both pass.
      if (userId === '' || given.toString('base64url') !== signature) return null
      if (id !== Buffer.from(userId).toString('base64url')) return null
      if (given.length !== expected.length) return null
      return timingSafeEqual(given, expected) ? userId : null
    },
  }
}

/**
 * The links, if the environment has the secret for them. They work whether or not the provider is
 * on, so a link in an old mail still stops the mail after the provider is switched off. A secret
 * that is set must be long enough to sign with.
 */
export function unsubscribeFrom(
  env: Readonly<Record<string, string | undefined>>,
  origin: string,
): Unsubscribe | undefined {
  const secret = env[MAIL_SECRET_VARIABLE]?.trim() ?? ''
  if (secret === '') return undefined
  if (secret.length < 32) throw new Error(`${MAIL_SECRET_VARIABLE} must be at least 32 characters`)
  return unsubscribeFor(secret, origin)
}
