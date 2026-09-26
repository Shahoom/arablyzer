import http from 'node:http'
import net from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createPolicy, type EgressPolicy } from '../../src/policy'
import { PROXY_LOG_LIMIT, startProxy, type EgressProxy, type ProxyOptions } from '../../src/proxy'
import type { ResolvedAddress, Resolver } from '../../src/resolve'
import { onlyServer, startServer, stubResolver, type TestServer } from '../helpers'

const cleanup: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function server(handler: http.RequestListener): Promise<TestServer> {
  const started = await startServer(handler)
  cleanup.push(() => started.close())
  return started
}

/** A local service the proxy must never reach; it counts every connection it gets. */
async function forbidden(): Promise<TestServer & { readonly hits: string[] }> {
  const hits: string[] = []
  const started = await server((req, res) => {
    hits.push(`${req.method ?? ''} ${req.url ?? ''}`)
    res.end('secret')
  })
  return { ...started, hits }
}

async function proxy(policy: EgressPolicy, options: ProxyOptions = {}): Promise<EgressProxy> {
  const started = await startProxy({ policy, ...options })
  cleanup.push(() => started.close())
  return started
}

function credentials(target: EgressProxy): string {
  return `Basic ${Buffer.from(`${target.username}:${target.password}`).toString('base64')}`
}

interface Answer {
  readonly status: number
  readonly headers: http.IncomingHttpHeaders
  readonly body: string
}

interface Via {
  readonly auth?: string | null
  readonly method?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
}

/** One request to the proxy, in whatever request-target form `target` is written in. */
function via(through: EgressProxy, target: string, options: Via = {}): Promise<Answer> {
  const auth = options.auth === undefined ? credentials(through) : options.auth
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port: Number(new URL(through.url).port),
        method: options.method ?? 'GET',
        path: target,
        agent: false,
        headers: { ...(auth === null ? {} : { 'proxy-authorization': auth }), ...options.headers },
      },
      (res) => {
        const chunks: Buffer[] = []
        const done = () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        }
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', done)
        // A connection the proxy cuts ends without 'end'; what arrived is still the answer.
        res.on('close', done)
        res.on('error', reject)
      },
    )
    request.on('error', reject)
    request.end(options.body)
  })
}

interface Tunnel {
  readonly status: number
  readonly headers: http.IncomingHttpHeaders
  readonly socket: net.Socket
}

function tunnel(through: EgressProxy, authority: string, auth?: string | null): Promise<Tunnel> {
  const header = auth === undefined ? credentials(through) : auth
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: Number(new URL(through.url).port),
      method: 'CONNECT',
      path: authority,
      agent: false,
      headers: header === null ? {} : { 'proxy-authorization': header },
    })
    request.on('connect', (res, socket) => {
      cleanup.push(async () => {
        socket.destroy()
        await Promise.resolve()
      })
      resolve({ status: res.statusCode ?? 0, headers: res.headers, socket })
    })
    request.on('error', reject)
    request.end()
  })
}

/** Plain HTTP inside a tunnel; resolves with everything the other end sends until it closes. */
function throughTunnel(socket: net.Socket, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    socket.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    socket.on('close', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    socket.on('error', reject)
    socket.write(`GET ${path} HTTP/1.1\r\nHost: inside\r\nConnection: close\r\n\r\n`)
  })
}

describe('egress proxy: credentials and request forms', () => {
  it('listens on 127.0.0.1 with a random password of its own', async () => {
    const first = await proxy(createPolicy())
    const second = await proxy(createPolicy())
    expect(new URL(first.url).hostname).toBe('127.0.0.1')
    expect(first.password.length).toBeGreaterThanOrEqual(32)
    expect(first.password).not.toBe(second.password)
  })

  it('answers 407 without credentials or with wrong ones, and reaches nothing', async () => {
    const target = await forbidden()
    const through = await proxy(onlyServer(target.port))
    for (const auth of [null, 'Basic d3Jvbmc6d3Jvbmc=', `${credentials(through)}x`]) {
      const answer = await via(through, `${target.origin}/`, { auth })
      expect(answer.status).toBe(407)
      expect(answer.headers['proxy-authenticate']).toMatch(/^Basic /)
      expect((await tunnel(through, `127.0.0.1:${target.port}`, auth)).status).toBe(407)
    }
    expect(target.hits).toEqual([])
    expect(through.stats().requests).toBe(0)
  })

  it('refuses origin-form requests: it is a proxy, not a web server', async () => {
    const through = await proxy(createPolicy())
    const answer = await via(through, '/')
    expect(answer.status).toBe(400)
    expect(answer.headers['x-arablyzer-refused']).toBe('bad-request')
  })

  it('refuses absolute https URLs, which browsers send through CONNECT', async () => {
    const target = await forbidden()
    const through = await proxy(onlyServer(target.port))
    const answer = await via(through, `https://127.0.0.1:${target.port}/`)
    expect(answer.status).toBe(400)
    expect(target.hits).toEqual([])
  })

  it('refuses CONNECT targets that are not host:port', async () => {
    const through = await proxy(createPolicy())
    for (const authority of ['example.com', 'http://example.com:443', 'user@example.com:443']) {
      expect((await tunnel(through, authority)).status).toBe(400)
    }
  })
})

describe('egress proxy: forwarding', () => {
  it('forwards to an allowed target with Host taken from the URL and proxy headers dropped', async () => {
    let seen: http.IncomingHttpHeaders = {}
    let method = ''
    let body = ''
    const target = await server((req, res) => {
      seen = req.headers
      method = req.method ?? ''
      req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
      req.on('end', () => {
        res.setHeader('set-cookie', ['a=1', 'b=2'])
        res.end('ok')
      })
    })
    const through = await proxy(onlyServer(target.port))
    const answer = await via(through, `${target.origin}/path?q=1`, {
      method: 'POST',
      body: 'x=1',
      headers: {
        host: 'evil.example',
        'proxy-connection': 'keep-alive',
        'x-custom': 'kept',
        'content-type': 'application/x-www-form-urlencoded',
      },
    })
    expect(answer).toMatchObject({ status: 200, body: 'ok' })
    expect(answer.headers['set-cookie']).toEqual(['a=1', 'b=2'])
    expect(method).toBe('POST')
    expect(body).toBe('x=1')
    expect(seen.host).toBe(`127.0.0.1:${target.port}`)
    expect(seen['x-custom']).toBe('kept')
    expect(seen['proxy-authorization']).toBeUndefined()
    expect(seen['proxy-connection']).toBeUndefined()
    expect(through.stats()).toMatchObject({ requests: 1, refused: 0 })
  })

  it('opens a tunnel to an allowed target and passes bytes both ways', async () => {
    const target = await server((_req, res) => res.end('inside-ok'))
    const through = await proxy(onlyServer(target.port))
    const opened = await tunnel(through, `127.0.0.1:${target.port}`)
    expect(opened.status).toBe(200)
    expect(await throughTunnel(opened.socket, '/inside')).toContain('inside-ok')
    expect(through.stats().bytes).toBeGreaterThan(0)
  })
})

describe('egress proxy: refusals, for both request forms', () => {
  it('refuses a loopback port that is not a test target, as safeFetch does, before DNS', async () => {
    const allowed = await server((_req, res) => res.end('ok'))
    const target = await forbidden()
    const through = await proxy(onlyServer(allowed.port))
    const answer = await via(through, `${target.origin}/`)
    expect(answer.status).toBe(403)
    expect(answer.headers['x-arablyzer-refused']).toBe('port-not-allowed')
    expect((await tunnel(through, `127.0.0.1:${target.port}`)).status).toBe(403)
    expect(target.hits).toEqual([])
    expect(through.stats().refusals).toEqual([
      { target: `${target.origin}/`, code: 'port-not-allowed' },
      { target: `127.0.0.1:${target.port}`, code: 'port-not-allowed' },
    ])
  })

  it('refuses loopback on the ports it does allow', async () => {
    const through = await proxy(createPolicy())
    const answer = await via(through, 'http://127.0.0.1/')
    expect(answer.headers['x-arablyzer-refused']).toBe('blocked-address')
    expect((await tunnel(through, '127.0.0.1:443')).status).toBe(403)
    expect(through.stats().refusals).toEqual([
      {
        target: 'http://127.0.0.1/',
        code: 'blocked-address',
        address: '127.0.0.1',
        range: 'loopback',
      },
      { target: '127.0.0.1:443', code: 'blocked-address', address: '127.0.0.1', range: 'loopback' },
    ])
  })

  it.each([
    ['10.0.0.1', 'private-10'],
    ['100.64.0.1', 'shared-cgnat'],
    ['169.254.169.254', 'link-local'],
    ['0.0.0.0', 'this-network'],
    ['::1', 'loopback'],
    ['fe80::1', 'link-local'],
    ['fd00:ec2::254', 'metadata-aws'],
    ['::ffff:127.0.0.1', 'loopback'],
    ['64:ff9b::7f00:1', 'loopback'],
    ['2002:7f00:1::', 'loopback'],
  ])('refuses a name that resolves to %s (%s)', async (address, range) => {
    const through = await proxy(createPolicy(), {
      resolver: stubResolver({ 'internal.example': [address] }),
    })
    const answer = await via(through, 'http://internal.example/')
    expect(answer.status).toBe(403)
    expect((await tunnel(through, 'internal.example:443')).status).toBe(403)
    expect(through.stats().refusals.map((refusal) => [refusal.code, refusal.range])).toEqual([
      ['blocked-address', range],
      ['blocked-address', range],
    ])
  })

  it('refuses a host when any of its DNS answers is internal', async () => {
    const through = await proxy(createPolicy(), {
      resolver: stubResolver({ 'mixed.example': ['93.184.215.14', '10.0.0.7'] }),
    })
    expect((await via(through, 'http://mixed.example/')).status).toBe(403)
    expect((await tunnel(through, 'mixed.example:443')).status).toBe(403)
  })

  it('refuses IP literals in private ranges without DNS', async () => {
    const dns = stubResolver({})
    const through = await proxy(createPolicy(), { resolver: dns })
    expect((await via(through, 'http://169.254.169.254/latest/meta-data/')).status).toBe(403)
    expect((await via(through, 'http://[::1]/')).status).toBe(403)
    expect((await tunnel(through, '[::1]:443')).status).toBe(403)
    expect((await tunnel(through, '10.0.0.1:443')).status).toBe(403)
    expect(dns.calls).toEqual([])
  })

  it('refuses internal host names without asking DNS', async () => {
    const dns = stubResolver({})
    const through = await proxy(createPolicy(), { resolver: dns })
    for (const target of ['http://localhost/', 'http://api.localhost/', 'http://redis/']) {
      const answer = await via(through, target)
      expect(answer.status).toBe(403)
      expect(answer.headers['x-arablyzer-refused']).toBe('blocked-host')
    }
    expect((await tunnel(through, 'localhost:443')).status).toBe(403)
    expect(dns.calls).toEqual([])
  })

  it('refuses ports other than 80 and 443 on public addresses', async () => {
    const through = await proxy(createPolicy(), {
      resolver: stubResolver({ 'public.example': ['93.184.215.14'] }),
    })
    const answer = await via(through, 'http://public.example:8080/')
    expect(answer.status).toBe(403)
    expect(answer.headers['x-arablyzer-refused']).toBe('port-not-allowed')
    expect((await tunnel(through, 'public.example:22')).status).toBe(403)
  })

  it('refuses URLs that carry credentials, and keeps them out of its log', async () => {
    const target = await forbidden()
    const through = await proxy(onlyServer(target.port))
    const answer = await via(through, `http://user:secret@127.0.0.1:${target.port}/`)
    expect(answer.status).toBe(403)
    expect(answer.headers['x-arablyzer-refused']).toBe('credentials-in-url')
    expect(JSON.stringify(through.stats())).not.toContain('secret')
    expect(target.hits).toEqual([])
  })

  it('answers 502 when DNS fails', async () => {
    const through = await proxy(createPolicy(), { resolver: stubResolver({}) })
    const answer = await via(through, 'http://nxdomain.example/')
    expect(answer.status).toBe(502)
    expect(answer.headers['x-arablyzer-refused']).toBe('dns-failed')
    expect((await tunnel(through, 'nxdomain.example:443')).status).toBe(502)
  })
})

/** First answer: the test server. Any later answer: cloud metadata. */
function rebinding(): Resolver & { lookups: () => number } {
  let count = 0
  const answer = (address: string): readonly ResolvedAddress[] => [{ address, family: 4 }]
  const resolve: Resolver = () => {
    count += 1
    return Promise.resolve(answer(count === 1 ? '127.0.0.1' : '169.254.169.254'))
  }
  return Object.assign(resolve, { lookups: () => count })
}

describe('egress proxy: DNS rebinding', () => {
  it('connects to the address it vetted; a later DNS answer is never used', async () => {
    let hostHeader = ''
    const target = await server((req, res) => {
      hostHeader = req.headers.host ?? ''
      res.end('vetted')
    })
    const forRequest = rebinding()
    const first = await proxy(onlyServer(target.port), { resolver: forRequest })
    const response = await via(first, `http://rebind.example:${target.port}/`)
    expect(response).toMatchObject({ status: 200, body: 'vetted' })
    expect(hostHeader).toBe(`rebind.example:${target.port}`)
    expect(forRequest.lookups()).toBe(1)

    const forTunnel = rebinding()
    const second = await proxy(onlyServer(target.port), { resolver: forTunnel })
    const opened = await tunnel(second, `rebind.example:${target.port}`)
    expect(opened.status).toBe(200)
    expect(await throughTunnel(opened.socket, '/')).toContain('vetted')
    expect(forTunnel.lookups()).toBe(1)
  })
})

describe('egress proxy: limits', () => {
  it('refuses requests and tunnels past maxRequests', async () => {
    let hits = 0
    const target = await server((_req, res) => {
      hits += 1
      res.end('ok')
    })
    const through = await proxy(onlyServer(target.port), { maxRequests: 2 })
    expect((await via(through, `${target.origin}/1`)).status).toBe(200)
    expect((await via(through, `${target.origin}/2`)).status).toBe(200)
    const third = await via(through, `${target.origin}/3`)
    expect(third.status).toBe(403)
    expect(third.headers['x-arablyzer-refused']).toBe('request-limit')
    expect((await tunnel(through, `127.0.0.1:${target.port}`)).status).toBe(403)
    expect(hits).toBe(2)
    expect(through.stats()).toMatchObject({ requests: 2, refused: 2 })
  })

  it('cuts responses and tunnels past maxBytes', async () => {
    const target = await server((_req, res) => res.end(Buffer.alloc(64 * 1024, 'a')))
    const through = await proxy(onlyServer(target.port), { maxBytes: 16 * 1024 })
    const answer = await via(through, `${target.origin}/`).catch((error: unknown) => error)
    expect(answer instanceof Error || (answer as Answer).body.length < 64 * 1024).toBe(true)
    expect(through.stats().refusals.map((refusal) => refusal.code)).toEqual(['too-large'])
  })

  it('logs the first refusals only, and counts them all', async () => {
    const through = await proxy(createPolicy())
    for (let i = 0; i < PROXY_LOG_LIMIT + 5; i++) await via(through, `http://127.0.0.1/${i}`)
    const stats = through.stats()
    expect(stats.refusals).toHaveLength(PROXY_LOG_LIMIT)
    expect(stats.refused).toBe(PROXY_LOG_LIMIT + 5)
  })

  it('rejects limits that are not whole numbers in range', async () => {
    await expect(startProxy({ maxRequests: 0 })).rejects.toThrow(TypeError)
    await expect(startProxy({ maxBytes: Number.NaN })).rejects.toThrow(TypeError)
  })
})

describe('egress proxy: closing', () => {
  it('ends open tunnels and stops listening', async () => {
    const target = await server((_req, res) => res.end('ok'))
    const through = await startProxy({ policy: onlyServer(target.port) })
    const opened = await tunnel(through, `127.0.0.1:${target.port}`)
    const ended = new Promise<void>((resolve) =>
      opened.socket.on('close', () => {
        resolve()
      }),
    )
    await through.close()
    await ended
    const port = Number(new URL(through.url).port)
    await expect(
      new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1', () => {
          resolve(socket)
        })
        socket.on('error', reject)
      }),
    ).rejects.toThrow(/ECONNREFUSED/)
  })
})
