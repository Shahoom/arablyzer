export type EgressErrorCode =
  | 'invalid-url'
  | 'unsupported-scheme'
  | 'url-too-long'
  | 'credentials-in-url'
  | 'port-not-allowed'
  | 'blocked-host'
  | 'blocked-address'
  | 'dns-failed'
  | 'connect-failed'
  | 'tls-failed'
  | 'timeout'
  | 'aborted'
  | 'too-many-redirects'
  | 'invalid-redirect'
  | 'too-large'
  | 'decode-failed'

export interface EgressError {
  readonly code: EgressErrorCode
  /** English detail for logs; user-facing text is mapped from `code`. */
  readonly message: string
  readonly url: string
  /** For blocked-address: the refused IP and the range it matched. */
  readonly address?: string
  readonly range?: string
}

export function egressError(
  code: EgressErrorCode,
  url: string,
  message: string,
  extra: { address?: string; range?: string } = {},
): EgressError {
  return { code, url, message, ...extra }
}
