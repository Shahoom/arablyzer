import { afterEach, expect, it } from 'vitest'
import { safeFetch } from '../../src/fetch'
import type { ResolvedAddress, Resolver } from '../../src/resolve'
import { onlyServer, startServer, UA, type TestServer } from '../helpers'

let server: TestServer | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

it('connects only to the address it vetted; a later DNS answer is never used', async () => {
  let hostHeader = ''
  const local = await startServer((req, res) => {
    hostHeader = req.headers.host ?? ''
    res.end('ok')
  })
  server = local
  let lookups = 0
  const answer = (address: string): readonly ResolvedAddress[] => [{ address, family: 4 }]
  // First answer passes the check (the test server); any later answer would be cloud metadata.
  const rebinding: Resolver = () => {
    lookups += 1
    return Promise.resolve(lookups === 1 ? answer('127.0.0.1') : answer('169.254.169.254'))
  }

  const result = await safeFetch(`http://rebind.example:${local.port}/`, {
    userAgent: UA,
    policy: onlyServer(local.port),
    resolver: rebinding,
  })

  expect(result.error).toBeNull()
  expect(result.response?.remoteAddress).toBe('127.0.0.1')
  expect(Buffer.from(result.response?.body ?? new Uint8Array()).toString('utf8')).toBe('ok')
  expect(hostHeader).toBe(`rebind.example:${local.port}`)
  expect(lookups).toBe(1)
})
