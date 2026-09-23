import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { safeFetch } from '../../src/fetch'
import { onlyServer, startServer, UA, type TestServer } from '../helpers'

let server: TestServer | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

describe('size and time limits', () => {
  it('stops reading a body past maxBytes', async () => {
    const local = await startServer((_req, res) => {
      res.write(Buffer.alloc(1024, 'a'))
      res.end(Buffer.alloc(1024, 'b'))
    })
    server = local
    const result = await safeFetch(`${local.origin}/`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      maxBytes: 1500,
    })
    expect(result.error?.code).toBe('too-large')
  })

  it('refuses early when Content-Length is over the limit', async () => {
    const local = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '4096' })
      res.end(Buffer.alloc(4096))
    })
    server = local
    const result = await safeFetch(`${local.origin}/`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      maxBytes: 1000,
    })
    expect(result.error?.code).toBe('too-large')
  })

  it('stops a gzip bomb at maxBytes of decoded data', async () => {
    const bomb = gzipSync(Buffer.alloc(8 * 1024 * 1024))
    const local = await startServer((_req, res) => {
      res.writeHead(200, { 'content-encoding': 'gzip' })
      res.end(bomb)
    })
    server = local
    const result = await safeFetch(`${local.origin}/`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      maxBytes: 1024 * 1024,
    })
    expect(result.error?.code).toBe('too-large')
  })

  it('keeps the first maxBytes when asked to truncate (robots.txt parse limit)', async () => {
    const local = await startServer((_req, res) => {
      res.end(Buffer.alloc(2048, 'x'))
    })
    server = local
    const result = await safeFetch(`${local.origin}/`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      maxBytes: 1000,
      onTooLarge: 'truncate',
    })
    expect(result.error).toBeNull()
    expect(result.response?.body.length).toBe(1000)
    expect(result.response?.truncated).toBe(true)
  })

  it('times out a server that never finishes', async () => {
    const local = await startServer((_req, res) => {
      res.writeHead(200)
      res.write('partial')
    })
    server = local
    const result = await safeFetch(`${local.origin}/`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      timeoutMs: 200,
    })
    expect(result.error?.code).toBe('timeout')
  })

  it('times out DNS that never answers', async () => {
    const result = await safeFetch('https://slow-dns.example/', {
      userAgent: UA,
      resolver: () => new Promise<never>(() => undefined),
      timeoutMs: 100,
    })
    expect(result.error?.code).toBe('timeout')
  })

  // Security review 2026-09-24: the cap must also hold for bytes on the wire.
  it('caps compressed bytes too (endless deflate blocks that decode to nothing)', async () => {
    // A stored deflate block with no data: 5 bytes on the wire, 0 bytes decoded.
    const emptyBlock = Buffer.from([0x00, 0x00, 0x00, 0xff, 0xff])
    const chunk = Buffer.concat(Array.from({ length: 2048 }, () => emptyBlock))
    const local = await startServer((_req, res) => {
      let open = true
      res.on('close', () => {
        open = false
      })
      const pump = () => {
        while (open && res.write(chunk)) {
          // keep writing until the socket pushes back
        }
      }
      res.writeHead(200, { 'content-encoding': 'deflate' })
      res.on('drain', pump)
      pump()
    })
    server = local
    const started = Date.now()
    const result = await safeFetch(`${local.origin}/`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      maxBytes: 64 * 1024,
      timeoutMs: 5000,
    })
    expect(result.error?.code).toBe('too-large')
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('refuses early when a compressed body declares a length over the limit', async () => {
    const local = await startServer((_req, res) => {
      res.writeHead(200, { 'content-encoding': 'gzip', 'content-length': '4096' })
      res.end(Buffer.alloc(4096))
    })
    server = local
    const result = await safeFetch(`${local.origin}/`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      maxBytes: 1000,
    })
    expect(result.error?.code).toBe('too-large')
  })

  it.each([
    { maxBytes: Number.NaN },
    { maxBytes: -1 },
    { maxBytes: 26 * 1024 * 1024 },
    { maxRedirects: Number.NaN },
    { maxRedirects: 1.5 },
    { timeoutMs: Number.NaN },
    { timeoutMs: 2 ** 32 },
  ])('rejects invalid limits before any network access: %o', async (limits) => {
    const noNetwork = () => Promise.reject(new Error('the resolver must not be reached'))
    await expect(
      safeFetch('https://example.com/', { userAgent: UA, resolver: noNetwork, ...limits }),
    ).rejects.toThrow(TypeError)
  })
})
