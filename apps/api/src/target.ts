import type { UrlErrorCode } from '@arablyzer/api-contract/codes'
import {
  checkUrl,
  resolveEndpoint,
  type EgressErrorCode,
  type EgressPolicy,
  type Resolver,
} from '@arablyzer/egress'

export interface ParsedTarget {
  readonly url: URL
  /** The host as DNS is asked for it, lowercased. */
  readonly host: string
  readonly port: number
}

export type TargetResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: UrlErrorCode }

/** What needs no network: scheme, length, credentials, port, internal names (the CLI's checks). */
export function parseTarget(input: string, policy: EgressPolicy): TargetResult<ParsedTarget> {
  const checked = checkUrl(input, policy)
  if (!checked.ok) return { ok: false, code: urlCode(checked.error.code) }
  return {
    ok: true,
    value: { url: checked.url, host: checked.host.toLowerCase(), port: checked.port },
  }
}

/**
 * DNS, and every address it answers vetted by the policy: one private, loopback, link-local,
 * CGNAT, metadata or own address refuses the host (egress design §1). The worker's scan checks
 * again at connect time, so a name that changes its answer later gains nothing.
 */
export async function resolveTarget(
  target: ParsedTarget,
  policy: EgressPolicy,
  resolver: Resolver,
  timeoutMs = 5_000,
): Promise<TargetResult<string>> {
  const endpoint = await resolveEndpoint(
    target.url,
    target.host,
    target.port,
    policy,
    resolver,
    AbortSignal.timeout(timeoutMs),
  )
  if (!endpoint.ok) return { ok: false, code: urlCode(endpoint.error.code) }
  return { ok: true, value: target.url.href }
}

/** The refusal the page names; a DNS lookup that timed out or was cut short is a DNS failure. */
function urlCode(code: EgressErrorCode): UrlErrorCode {
  switch (code) {
    case 'invalid-url':
    case 'unsupported-scheme':
    case 'url-too-long':
    case 'credentials-in-url':
    case 'port-not-allowed':
    case 'blocked-host':
    case 'blocked-address':
    case 'dns-failed':
      return code
    default:
      return 'dns-failed'
  }
}
