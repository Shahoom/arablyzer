import { safeFetch, type EgressPolicy, type Resolver } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import type { Answer, PlatformHttp, PlatformRequest } from './types'

const TIMEOUT_MS = 10_000
const MAX_BYTES = 512 * 1024

export interface PlatformHttpOptions {
  readonly policy: EgressPolicy
  readonly resolver?: Resolver
  /** Another way to fetch; tests pass their own, which answers for the platform. */
  readonly fetcher?: typeof safeFetch
}

/**
 * The platforms' calls, all through the server's egress rules and never with more than the time and
 * size above. A token goes in a header or a form, and is never in a URL, a log, an error or a
 * result: a call that fails answers a status, or none, and nothing of what was sent.
 */
export function platformHttp(options: PlatformHttpOptions): PlatformHttp {
  return async (request: PlatformRequest): Promise<Answer> => {
    try {
      const fetched = await (options.fetcher ?? safeFetch)(request.url, {
        userAgent: USER_AGENT,
        accept: 'application/json',
        policy: options.policy,
        ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
        timeoutMs: TIMEOUT_MS,
        maxBytes: MAX_BYTES,
        ...(request.json === undefined ? {} : { json: request.json }),
        ...(request.form === undefined ? {} : { form: request.form }),
        ...(request.headers === undefined ? {} : { headers: request.headers }),
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
}
