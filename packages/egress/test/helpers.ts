import http from 'node:http'
import { createPolicy, type EgressPolicy } from '../src/policy'
import type { ResolvedAddress, Resolver } from '../src/resolve'

export const UA = 'ArablyzerBot/1.0 (+https://arablyzer.com/bot)'

export interface TestServer {
  readonly port: number
  readonly origin: string
  close(): Promise<void>
}

export async function startServer(handler: http.RequestListener): Promise<TestServer> {
  const server = http.createServer(handler)
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Test server has no port')
  return {
    port: address.port,
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

/** A policy that opens exactly one local test server and nothing else. */
export function onlyServer(port: number, overrides: Partial<EgressPolicy> = {}): EgressPolicy {
  return createPolicy({ allowTargets: [{ address: '127.0.0.1', port }], ...overrides })
}

export type StubResolver = Resolver & { readonly calls: string[] }

/** Fake DNS: hostname → answers. Unknown names fail like NXDOMAIN. */
export function stubResolver(table: Readonly<Record<string, readonly string[]>>): StubResolver {
  const calls: string[] = []
  const resolve = (hostname: string): Promise<readonly ResolvedAddress[]> => {
    calls.push(hostname)
    const answers = table[hostname]
    if (answers === undefined) {
      const error = Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
        code: 'ENOTFOUND',
      })
      return Promise.reject(error)
    }
    return Promise.resolve(
      answers.map((address): ResolvedAddress => ({
        address,
        family: address.includes(':') ? 6 : 4,
      })),
    )
  }
  return Object.assign(resolve, { calls })
}
