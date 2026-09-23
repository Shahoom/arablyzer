import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { vetEndpoint } from './classify'
import { egressError, type EgressError } from './errors'
import type { EgressPolicy } from './policy'

export interface ResolvedAddress {
  readonly address: string
  readonly family: 4 | 6
}

export type Resolver = (hostname: string) => Promise<readonly ResolvedAddress[]>

/** The operating system resolver (getaddrinfo), which is also what a browser would use. */
export const systemResolver: Resolver = async (hostname) => {
  const answers = await lookup(hostname, { all: true, verbatim: true })
  return answers.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }))
}

export type EndpointCheck =
  | { readonly ok: true; readonly addresses: readonly ResolvedAddress[] }
  | { readonly ok: false; readonly error: EgressError }

/** Resolve the host and vet every answer; one bad answer blocks the whole host (design §1). */
export async function resolveEndpoint(
  url: URL,
  host: string,
  port: number,
  policy: EgressPolicy,
  resolver: Resolver,
): Promise<EndpointCheck> {
  const family = isIP(host)
  let addresses: readonly ResolvedAddress[]
  if (family !== 0) {
    addresses = [{ address: host, family: family === 6 ? 6 : 4 }]
  } else {
    try {
      addresses = await resolver(host)
    } catch (error) {
      return {
        ok: false,
        error: egressError('dns-failed', url.href, `DNS lookup failed: ${describe(error)}`),
      }
    }
    if (addresses.length === 0) {
      return { ok: false, error: egressError('dns-failed', url.href, 'DNS returned no addresses') }
    }
  }
  for (const { address } of addresses) {
    const verdict = vetEndpoint(address, port, policy)
    if (!verdict.allowed) {
      return {
        ok: false,
        error: egressError(verdict.code, url.href, `${address} is not allowed (${verdict.range})`, {
          address,
          range: verdict.range,
        }),
      }
    }
  }
  return { ok: true, addresses }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
