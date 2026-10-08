import { safeFetch, type EgressPolicy, type Resolver } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import { REVOKE_ENDPOINT, TOKEN_ENDPOINT } from './oauth'

/** Google's answer to one call: its status and body as JSON; both null when none came. */
export interface Answer {
  readonly status: number | null
  readonly body: unknown
}

export const SITES_URL = 'https://www.googleapis.com/webmasters/v3/sites'
export const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'

const TIMEOUT_MS = 10_000
const MAX_BYTES = 512 * 1024

export interface GoogleOptions {
  readonly policy: EgressPolicy
  readonly resolver?: Resolver
  /** Another way to fetch; tests pass their own, which answers for Google. */
  readonly fetcher?: typeof safeFetch
  /** Another place for each endpoint: tests' stand-in. Keys are the endpoints' production URLs. */
  readonly rewrite?: (url: string) => string
}

/**
 * Google's calls for the connection, all through the server's egress rules and never with more
 * than the time and size above. The access token goes in a header, and is never in a URL, a log,
 * an error or a result.
 */
export function googleApi(options: GoogleOptions) {
  const send = async (
    url: string,
    extra: { readonly json?: unknown; readonly form?: Record<string, string> },
    token?: string,
  ): Promise<Answer> => {
    try {
      const fetched = await (options.fetcher ?? safeFetch)(options.rewrite?.(url) ?? url, {
        userAgent: USER_AGENT,
        accept: 'application/json',
        policy: options.policy,
        ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
        timeoutMs: TIMEOUT_MS,
        maxBytes: MAX_BYTES,
        ...extra,
        ...(token === undefined ? {} : { headers: { authorization: `Bearer ${token}` } }),
      })
      const response = fetched.response
      if (response === null) return { status: null, body: null }
      let body: unknown = null
      try {
        body = JSON.parse(new TextDecoder().decode(response.body))
      } catch {
        // Not JSON: a status alone.
      }
      return { status: response.status, body }
    } catch {
      return { status: null, body: null }
    }
  }

  return {
    /** Trades the code, with the PKCE verifier, for an access token; null when Google refuses. */
    async exchange(options_: {
      readonly code: string
      readonly verifier: string
      readonly clientId: string
      readonly clientSecret: string
      readonly redirectUri: string
    }): Promise<string | null> {
      const answer = await send(TOKEN_ENDPOINT, {
        form: {
          grant_type: 'authorization_code',
          code: options_.code,
          code_verifier: options_.verifier,
          client_id: options_.clientId,
          client_secret: options_.clientSecret,
          redirect_uri: options_.redirectUri,
        },
      })
      const token =
        answer.status === 200 && typeof answer.body === 'object' && answer.body !== null
          ? (answer.body as { access_token?: unknown }).access_token
          : undefined
      return typeof token === 'string' && token !== '' ? token : null
    },
    /** Tells Google the token is no longer needed; best effort, whatever comes of it. */
    async revoke(token: string): Promise<void> {
      await send(REVOKE_ENDPOINT, { form: { token } })
    },
    sites: (token: string): Promise<Answer> => send(SITES_URL, {}, token),
    analytics: (token: string, siteUrl: string, body: unknown): Promise<Answer> =>
      send(
        `${SITES_URL}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        { json: body },
        token,
      ),
    inspect: (token: string, siteUrl: string, inspectionUrl: string): Promise<Answer> =>
      send(INSPECT_URL, { json: { inspectionUrl, siteUrl } }, token),
  }
}

export type GoogleApi = ReturnType<typeof googleApi>
