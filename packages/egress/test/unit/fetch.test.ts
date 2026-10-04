import { brotliCompressSync, deflateRawSync, deflateSync, gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { safeFetch } from '../../src/fetch'
import { createPolicy } from '../../src/policy'
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

describe('safeFetch: a JSON POST (the CrUX API, M1.3b)', () => {
  const KEY = 'test-key-7f3a'

  it('sends the body as JSON with the headers given, and reads the answer', async () => {
    let seen: { method?: string; type?: string; key?: string; body: string } = { body: '' }
    const local = await serve((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        seen = {
          ...(req.method === undefined ? {} : { method: req.method }),
          ...(req.headers['content-type'] === undefined
            ? {}
            : { type: req.headers['content-type'] }),
          ...(typeof req.headers['x-goog-api-key'] === 'string'
            ? { key: req.headers['x-goog-api-key'] }
            : {}),
          body: Buffer.concat(chunks).toString('utf8'),
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"record":{}}')
      })
    })
    const result = await safeFetch(`${local.origin}/v1/records:queryRecord`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      json: { url: 'https://example.com/ar', formFactor: 'PHONE' },
      headers: { 'x-goog-api-key': KEY },
    })
    expect(result.error).toBeNull()
    expect(text(result.response?.body)).toBe('{"record":{}}')
    expect(seen).toEqual({
      method: 'POST',
      type: 'application/json',
      key: KEY,
      body: '{"url":"https://example.com/ar","formFactor":"PHONE"}',
    })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it('posts a form body as an OAuth token endpoint takes it, and never with a JSON one', async () => {
    let seen: { type?: string; body: string } = { body: '' }
    const local = await serve((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        seen = {
          ...(req.headers['content-type'] === undefined
            ? {}
            : { type: req.headers['content-type'] }),
          body: Buffer.concat(chunks).toString('utf8'),
        }
        res.end('{}')
      })
    })
    const options = { userAgent: UA, policy: onlyServer(local.port) }
    const result = await safeFetch(`${local.origin}/token`, {
      ...options,
      form: { code: 'a b&c', grant_type: 'authorization_code' },
    })
    expect(result.error).toBeNull()
    expect(seen).toEqual({
      type: 'application/x-www-form-urlencoded',
      body: 'code=a+b%26c&grant_type=authorization_code',
    })
    await expect(
      safeFetch(`${local.origin}/token`, { ...options, form: {}, json: {} }),
    ).rejects.toThrow(TypeError)
  })

  it('never follows a redirect with the body and its key', async () => {
    let elsewhere = 0
    const other = await startServer((_req, res) => {
      elsewhere++
      res.end('{}')
    })
    try {
      const local = await serve((_req, res) => {
        res.writeHead(307, { location: `${other.origin}/steal` })
        res.end()
      })
      const result = await safeFetch(`${local.origin}/`, {
        userAgent: UA,
        policy: createPolicy({
          allowTargets: [
            { address: '127.0.0.1', port: local.port },
            { address: '127.0.0.1', port: other.port },
          ],
        }),
        json: {},
        headers: { 'x-goog-api-key': KEY },
      })
      expect(result.error?.code).toBe('too-many-redirects')
      expect(elsewhere).toBe(0)
      expect(JSON.stringify(result)).not.toContain(KEY)
    } finally {
      await other.close()
    }
  })

  it('never follows a redirect with an added header, whatever the method (M1.3b review)', async () => {
    let elsewhere = 0
    const other = await startServer((_req, res) => {
      elsewhere++
      res.end('{}')
    })
    try {
      const local = await serve((_req, res) => {
        res.writeHead(302, { location: `${other.origin}/steal` })
        res.end()
      })
      const result = await safeFetch(`${local.origin}/`, {
        userAgent: UA,
        policy: createPolicy({
          allowTargets: [
            { address: '127.0.0.1', port: local.port },
            { address: '127.0.0.1', port: other.port },
          ],
        }),
        headers: { 'x-goog-api-key': KEY },
      })
      expect(result.error?.code).toBe('too-many-redirects')
      expect(elsewhere).toBe(0)
    } finally {
      await other.close()
    }
  })

  it('keeps no header value in an error', async () => {
    const result = await safeFetch('http://127.0.0.1:9/', {
      userAgent: UA,
      policy: onlyServer(9),
      json: {},
      headers: { 'x-goog-api-key': KEY },
      timeoutMs: 2_000,
    })
    expect(result.error).not.toBeNull()
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it('refuses a body over its limit, and headers that are not its own to add', async () => {
    const options = { userAgent: UA, policy: onlyServer(9) }
    await expect(
      safeFetch('http://127.0.0.1:9/', { ...options, json: 'x'.repeat(70_000) }),
    ).rejects.toThrow(TypeError)
    const refused: Record<string, string>[] = [
      { 'user-agent': 'SomeoneElse' },
      { host: 'example.com' },
      { 'x-key': 'a\r\nx-injected: 1' },
      { 'bad name': 'a' },
    ]
    for (const headers of refused) {
      await expect(safeFetch('http://127.0.0.1:9/', { ...options, headers })).rejects.toThrow(
        TypeError,
      )
    }
  })
})

// M2.4 plan §2: the engine reads the next page's robots.txt before a redirect takes it there.
describe('safeFetch: beforeRedirect', () => {
  /** /a → /b → /c, then the path it was asked for. */
  const chain = (requests: string[] = []) =>
    serve((req, res) => {
      requests.push(req.url ?? '')
      const next = { '/a': '/b', '/b': '/c' }[req.url ?? '']
      if (next !== undefined) {
        res.writeHead(req.url === '/a' ? 301 : 302, { location: next })
        res.end()
        return
      }
      res.end(req.url)
    })

  it('asks before each redirect, with where it leads and the chain’s private access', async () => {
    const local = await chain()
    const asked: [string, boolean][] = []
    const ask = (policy: ReturnType<typeof onlyServer>) =>
      safeFetch(`${local.origin}/a`, {
        userAgent: UA,
        policy,
        beforeRedirect: (to, hop) => {
          asked.push([to, hop.privateAccess])
          return Promise.resolve(true)
        },
      })
    const result = await ask(onlyServer(local.port))
    expect(asked).toEqual([
      [`${local.origin}/b`, false],
      [`${local.origin}/c`, false],
    ])
    expect(text(result.response?.body)).toBe('/c')
    // A chain that started on a private address under --allow-private keeps it open.
    asked.length = 0
    await ask(createPolicy({ allowPrivate: true }))
    expect(asked.map(([, open]) => open)).toEqual([true, true])
  })

  it('ends the fetch at a redirect it declines, which is never followed', async () => {
    const requests: string[] = []
    const local = await chain(requests)
    const result = await safeFetch(`${local.origin}/a`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      beforeRedirect: (to) => Promise.resolve(!to.endsWith('/c')),
    })
    expect(result).toMatchObject({ response: null, error: null })
    expect(result.redirects).toEqual([
      { url: `${local.origin}/a`, status: 301, location: `${local.origin}/b` },
      { url: `${local.origin}/b`, status: 302, location: `${local.origin}/c` },
    ])
    expect(requests).toEqual(['/a', '/b'])
  })

  it('gives the hook the fetch’s own time, and ends when that runs out', async () => {
    const local = await chain()
    let given: AbortSignal | undefined
    const result = await safeFetch(`${local.origin}/a`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      timeoutMs: 200,
      beforeRedirect: (_to, hop) => {
        given = hop.signal
        return new Promise<boolean>(() => undefined)
      },
    })
    expect(result.error?.code).toBe('timeout')
    expect(given?.aborted).toBe(true)
  })
})

// M2.3c: link-broken asks for each of a page's links with HEAD, then GET where HEAD answers an
// error, and needs the status alone.
describe('safeFetch: HEAD, and a response whose body is left unread', () => {
  it('sends HEAD when asked, redirects included, and reads nothing after the headers', async () => {
    const methods: string[] = []
    const local = await serve((req, res) => {
      methods.push(`${req.method ?? ''} ${req.url ?? ''}`)
      if (req.url === '/old') {
        res.writeHead(301, { location: '/gone' })
        res.end()
        return
      }
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end(req.method === 'HEAD' ? undefined : 'not found')
    })
    const result = await safeFetch(`${local.origin}/old`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      method: 'HEAD',
    })
    expect(result.error).toBeNull()
    expect(result.response).toMatchObject({ status: 404, truncated: false })
    expect(result.response?.body).toHaveLength(0)
    expect(methods).toEqual(['HEAD /old', 'HEAD /gone'])
  })

  it('leaves a body it is told not to read unread, and undecoded', async () => {
    let sent = 0
    const local = await serve((_req, res) => {
      // Past every limit were it read, and not the gzip it says it is.
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' })
      const chunk = Buffer.alloc(64 * 1024, 0x61)
      const write = () => {
        while (sent < 64 * 1024 * 1024) {
          sent += chunk.length
          if (!res.write(chunk)) {
            res.once('drain', write)
            return
          }
        }
        res.end()
      }
      write()
    })
    const result = await safeFetch(`${local.origin}/`, {
      userAgent: UA,
      policy: onlyServer(local.port),
      discardBody: true,
    })
    expect(result.error).toBeNull()
    expect(result.response).toMatchObject({ status: 200, truncated: false })
    expect(result.response?.body).toHaveLength(0)
    expect(sent).toBeLessThan(64 * 1024 * 1024)
  })

  it('refuses HEAD with a JSON body, which only POST sends', async () => {
    await expect(
      safeFetch('http://127.0.0.1:9/', {
        userAgent: UA,
        policy: onlyServer(9),
        method: 'HEAD',
        json: {},
      }),
    ).rejects.toThrow(TypeError)
  })
})
