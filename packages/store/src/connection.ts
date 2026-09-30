import { MIN_SECRET_LENGTH } from './secrets'

export interface ConnectionUrlOptions {
  /** The schemes the URL may have, as `URL.protocol` writes them: `['redis:', 'rediss:']`. */
  readonly protocols: readonly string[]
  /**
   * Refuse a password shorter than this, or none; unset, the password is not looked at (the
   * stores' tests run on services with none). Production entrypoints ask for MIN_SECRET_LENGTH.
   */
  readonly passwordMinimum?: number
}

/**
 * A connection URL from the environment, read before any client is given it, so that what is
 * wrong with it is said by the variable's name and never by its text. ioredis and pg put the URL
 * they cannot read, password and all, in the `input` of the error they throw, which Node prints
 * whole when nothing catches it, into a log that Docker keeps: a password with a `/` in it, as
 * `openssl rand -base64` makes one in one of three, is enough. Nothing here echoes the value.
 *
 * Returns the URL as given (trimmed), for the client to read again.
 */
export function connectionUrl(
  name: string,
  value: string | undefined,
  options: ConnectionUrlOptions,
): string {
  const text = value?.trim() ?? ''
  if (text === '') throw new Error(`${name} must be set`)
  const shape = `${options.protocols.join(' or ')}//user:password@host:port`
  let url: URL
  try {
    url = new URL(text)
  } catch {
    // No `cause`: the parser's error holds the text.
    throw new Error(
      `${name} is not a URL of the form ${shape}: a password that holds one of / @ : # ? must be percent-encoded, or made of hexadecimal digits alone (openssl rand -hex 32)`,
    )
  }
  if (!options.protocols.includes(url.protocol)) {
    throw new Error(`${name} must be a URL of the form ${shape}`)
  }
  if (url.hostname === '') throw new Error(`${name} has no host: ${shape}`)
  if (options.passwordMinimum !== undefined) {
    let password: string
    try {
      password = decodeURIComponent(url.password)
    } catch {
      throw new Error(`${name} has a password with a percent-escape that is not one`)
    }
    if (password === '') throw new Error(`${name} has no password: ${shape}`)
    if (password.length < options.passwordMinimum) {
      throw new Error(
        `${name}'s password must be ${options.passwordMinimum} characters or more (openssl rand -hex 32 makes one)`,
      )
    }
  }
  return text
}

/** connectionUrl as production asks for it: the password at least MIN_SECRET_LENGTH long. */
export function productionUrl(
  name: string,
  value: string | undefined,
  protocols: readonly string[],
): string {
  return connectionUrl(name, value, { protocols, passwordMinimum: MIN_SECRET_LENGTH })
}

/** The schemes of a Valkey URL (TLS: `rediss`) and of a PostgreSQL one. */
export const VALKEY_PROTOCOLS: readonly string[] = ['redis:', 'rediss:']
export const POSTGRES_PROTOCOLS: readonly string[] = ['postgres:', 'postgresql:']
