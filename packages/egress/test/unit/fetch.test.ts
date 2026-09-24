import { brotliCompressSync, deflateRawSync, deflateSync, gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { safeFetch } from '../../src/fetch'
import { onlyServer, startServer, UA, type TestServer } from '../helpers'

let server: TestServer | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
})

async function serve(handler: Parameters<typeof startServer>[0]): Promise<TestServer> {
  server = await startServer(handler)
  return server
}

function fetchFrom(local: TestServer, path = '/', signal?: AbortSignal) {
  return safeFetch(`${local.origin}${path}`, {
    userAgent: UA,
    policy: onlyServer(local.port),
    ...(signal === undefined ? {} : { signal }),
  })
}

const text = (body: Uint8Array | undefined) =>
  Buffer.from(body ?? new Uint8Array()).toString('utf8')

/** Node writes header text as latin1; this is how a server sends UTF-8 bytes. */
const utf8Header = (value: string) => Buffer.from(value, 'utf8').toString('latin1')

describe('safeFetch', () => {
  it('returns status, body and raw headers with repeats kept in order', async () => {
    const local = await serve((_req, res) => {
      res.setHeader('X-Robots-Tag', ['noindex', 'googlebot: nofollow'])
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end('<html lang="ar"></html>')
    })
    const result = await fetchFrom(local)
    expect(result.error).toBeNull()
    expect(result.privateAccess).toBe(false)
    expect(result.response?.status).toBe(200)
    expect(result.response?.headers.filter(([name]) => name === 'x-robots-tag')).toEqual([
      ['x-robots-tag', 'noindex'],
      ['x-robots-tag', 'googlebot: nofollow'],
    ])
    expect(text(result.response?.body)).toBe('<html lang="ar"></html>')
  })

  it('identifies itself and sends no cookies or Accept-Language', async () => {
    let seen: Record<string, string | string[] | undefined> = {}
    const local = await serve((req, res) => {
      seen = req.headers
      res.end()
    })
    await fetchFrom(local)
    expect(seen['user-agent']).toBe(UA)
    expect(seen['accept-encoding']).toBe('gzip, deflate, br')
    expect(seen['accept-language']).toBeUndefined()
    expect(seen.cookie).toBeUndefined()
  })

  it.each([
    ['gzip', gzipSync],
    ['deflate', deflateSync],
    ['br', brotliCompressSync],
  ] as const)('decodes %s bodies', async (encoding, compress) => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'content-encoding': encoding })
      res.end(compress(Buffer.from('مرحبا بالعالم')))
    })
    expect(text((await fetchFrom(local)).response?.body)).toBe('مرحبا بالعالم')
  })

  it.each([600, 999])('reports the non-HTTP status %i as invalid-status', async (status) => {
    const local = await serve((_req, res) => {
      res.writeHead(status)
      res.end('denied')
    })
    const result = await fetchFrom(local)
    expect(result.response).toBeNull()
    expect(result.error?.code).toBe('invalid-status')
  })

  it('reports a corrupt compressed body as decode-failed', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'content-encoding': 'gzip' })
      res.end('this is not gzip')
    })
    expect((await fetchFrom(local)).error?.code).toBe('decode-failed')
  })

  it('treats 404 and 500 as responses, not errors', async () => {
    const local = await serve((req, res) => {
      res.writeHead(req.url === '/missing' ? 404 : 500)
      res.end()
    })
    expect((await fetchFrom(local, '/missing')).response?.status).toBe(404)
    expect((await fetchFrom(local, '/broken')).response?.status).toBe(500)
  })

  it('decodes UTF-8 Location headers (Arabic paths) before following them', async () => {
    const local = await serve((req, res) => {
      if (req.url === '/old') {
        res.writeHead(301, { location: utf8Header('/منتجات/') })
        res.end()
        return
      }
      res.end(req.url)
    })
    const result = await fetchFrom(local, '/old')
    expect(result.response?.url).toBe(`${local.origin}/%D9%85%D9%86%D8%AA%D8%AC%D8%A7%D8%AA/`)
    expect(result.redirects[0]?.location).toBe(result.response?.url)
  })

  it('decodes UTF-8 header values such as Link', async () => {
    const local = await serve((_req, res) => {
      res.setHeader('Link', utf8Header('</منتجات/>; rel="canonical"'))
      res.end()
    })
    const result = await fetchFrom(local)
    expect(result.response?.headers).toContainEqual(['link', '</منتجات/>; rel="canonical"'])
  })

  it('returns a 3xx without Location as the final response', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(302)
      res.end()
    })
    const result = await fetchFrom(local)
    expect(result.response?.status).toBe(302)
    expect(result.redirects).toEqual([])
  })

  it('stops when the caller aborts', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200)
      res.write('partial')
    })
    const controller = new AbortController()
    setTimeout(() => {
      controller.abort()
    }, 50)
    expect((await fetchFrom(local, '/', controller.signal)).error?.code).toBe('aborted')
  })

  it('records when the fetch started and how long it took', async () => {
    const local = await serve((_req, res) => {
      res.end('ok')
    })
    const result = await fetchFrom(local)
    expect(Number.isNaN(Date.parse(result.startedAt))).toBe(false)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  // Security review 2026-09-24: bodies that browsers and curl accept must not fail.
  it.each([
    ['a 204 that names an encoding', 204, 'gzip', undefined],
    ['a 200 with Content-Length: 0', 200, 'gzip', '0'],
    ['an empty br body', 200, 'br', undefined],
  ] as const)('returns an empty body for %s', async (_name, status, encoding, length) => {
    const local = await serve((_req, res) => {
      res.writeHead(status, {
        'content-encoding': encoding,
        ...(length === undefined ? {} : { 'content-length': length }),
      })
      res.end()
    })
    const result = await fetchFrom(local)
    expect(result.error).toBeNull()
    expect(result.response?.body.length).toBe(0)
  })

  it('decodes raw deflate (no zlib header), as browsers do', async () => {
    const local = await serve((_req, res) => {
      res.writeHead(200, { 'content-encoding': 'deflate' })
      res.end(deflateRawSync(Buffer.from('مرحبا بالعالم')))
    })
    expect(text((await fetchFrom(local)).response?.body)).toBe('مرحبا بالعالم')
  })

  it('never echoes credentials from the requested URL', async () => {
    const result = await safeFetch('https://admin:hunter2@example.com/', { userAgent: UA })
    expect(result.error?.code).toBe('credentials-in-url')
    expect(JSON.stringify(result)).not.toContain('hunter2')
  })
})
