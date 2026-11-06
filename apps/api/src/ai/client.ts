import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk'
import { safeFetch, type EgressPolicy, type Resolver } from '@arablyzer/egress'
import { USER_AGENT } from '@arablyzer/engine/identity'
import type { AiSettings } from './settings'

type Fetch = NonNullable<ClientOptions['fetch']>

/** The only address the assistant calls. Not read from the environment: nothing can send the key elsewhere. */
export const API_ORIGIN = 'https://api.anthropic.com'

/** The part of the SDK's client the assistant uses; tests hand it their own. */
export interface ModelClient {
  readonly messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>
  }
}

/** Headers the egress fetch sets itself (packages/egress): the SDK's own are left out. */
const FIXED_HEADERS: ReadonlySet<string> = new Set([
  'host',
  'user-agent',
  'accept',
  'accept-encoding',
  'content-type',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'upgrade',
  'expect',
  'te',
  'trailer',
  'cookie',
  'proxy-authorization',
  'proxy-connection',
])
/** The answer of the model is a few kilobytes; a megabyte is a bound, not an expectation. */
const MAX_RESPONSE_BYTES = 1024 * 1024

export interface EgressOptions {
  readonly policy: EgressPolicy
  readonly resolver?: Resolver
  readonly timeoutMs: number
  /** Another way to fetch; tests pass their own. */
  readonly fetcher?: typeof safeFetch
}

/**
 * The SDK's `fetch`, made of the egress fetch: the request to the model leaves the server as every
 * request does (the egress proxy where the server has one, the address rules, no redirect), and the
 * SDK never uses the global `fetch`. The SDK sends JSON by POST; anything else is refused.
 */
export function egressFetch(options: EgressOptions): Fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if ((init?.method ?? 'GET').toUpperCase() !== 'POST' || typeof init?.body !== 'string') {
      throw new TypeError('Only a JSON POST goes to the model')
    }
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((value, name) => {
      if (!FIXED_HEADERS.has(name)) headers[name] = value
    })
    const fetched = await (options.fetcher ?? safeFetch)(url, {
      userAgent: USER_AGENT,
      accept: 'application/json',
      policy: options.policy,
      ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
      timeoutMs: options.timeoutMs,
      maxBytes: MAX_RESPONSE_BYTES,
      json: JSON.parse(init.body) as unknown,
      headers,
      maxRedirects: 0,
      ...(init.signal == null ? {} : { signal: init.signal }),
    })
    const response = fetched.response
    // The SDK reads this as a connection that failed, and says nothing of why.
    if (response === null) throw new TypeError('The request to the model did not complete')
    const answer = new Headers()
    for (const [name, value] of response.headers) {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(name)) {
        answer.append(name, value)
      }
    }
    return new Response(new Uint8Array(response.body), { status: response.status, headers: answer })
  }
}

/** The SDK's client on the egress fetch, with the key and nothing else it could read from the environment. */
export function anthropicClient(settings: AiSettings, egress: Omit<EgressOptions, 'timeoutMs'>) {
  return new Anthropic({
    apiKey: settings.apiKey,
    baseURL: API_ORIGIN,
    fetch: egressFetch({ ...egress, timeoutMs: settings.timeoutMs }),
    // One try again at most on a busy model (429, 529, a dropped connection): an attempt that fails is not billed.
    maxRetries: 1,
    timeout: settings.timeoutMs,
  })
}
