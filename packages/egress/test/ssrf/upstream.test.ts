import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { serveDoh } from '@arablyzer/fixtures'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDohTxtResolver } from '../../src/doh'
import { safeFetch } from '../../src/fetch'
import { createPolicy, type EgressPolicy } from '../../src/policy'
import { startProxy, type EgressProxy } from '../../src/proxy'
import { serverPolicy } from '../../src/server-policy'
import { openTunnel } from '../../src/upstream'
import { startServer, stubResolver, UA, type TestServer } from '../helpers'

// The egress package in front of Smokescreen (M2.1 plan §5b): with `upstream` in the policy,
// every connection is a CONNECT tunnel through it, a name goes to it unresolved, an address is
// still vetted here, and its refusals come back as the codes every other refusal uses.

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

/**
 * Where a fake Smokescreen sends a CONNECT: a local port, the answer Smokescreen gives, or a 200
 * followed at once by bytes no tunnel's far end would send first.
 */
type Route =
  number | { readonly status: number; readonly error: string } | { readonly early: string }

interface FakeSmokescreen {
  readonly url: string
  /** Every CONNECT's authority, as it arrived. */
  readonly connects: string[]
  /** Headers of the CONNECTs, lowercased. */
  readonly headers: http.IncomingHttpHeaders[]
}

/**
 * A stand-in for Smokescreen: a CONNECT to an authority it has a route for is tunnelled to that
 * local port; any other is refused as Smokescreen refuses an address (407).
 */
async function fakeSmokescreen(routes: Readonly<Record<string, Route>>): Promise<FakeSmokescreen> {
  const connects: string[] = []
  const headers: http.IncomingHttpHeaders[] = []
  const sockets = new Set<net.Socket>()
  const server = http.createServer((_req, res) => {
    res.writeHead(400).end()
  })
  server.on('connect', (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
    sockets.add(client)
    const authority = req.url ?? ''
    connects.push(authority)
    headers.push(req.headers)
    const route = routes[authority] ?? {
      status: 407,
      error: `Request rejected by proxy: ${authority} is not allowed`,
    }
    if (typeof route !== 'number' && 'early' in route) {
      client.end(`HTTP/1.1 200 Connection Established\r\n\r\n${route.early}`)
      return
    }
    if (typeof route !== 'number') {
      client.end(
        `HTTP/1.1 ${route.status} Refused\r\nX-Smokescreen-Error: ${route.error}\r\n` +
          'Content-Length: 0\r\nConnection: close\r\n\r\n',
      )
      return
    }
    const target = net.connect(route, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) target.write(head)
      target.pipe(client)
      client.pipe(target)
    })
    sockets.add(target)
    target.on('error', () => client.destroy())
    client.on('error', () => target.destroy())
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No port')
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => {
          resolve()
        })
      }),
  )
  return { url: `http://127.0.0.1:${address.port}`, connects, headers }
}

async function server(handler: http.RequestListener): Promise<TestServer> {
  const started = await startServer(handler)
  cleanup.push(() => started.close())
  return started
}

/** A policy whose connections all go through the fake Smokescreen. */
function through(smokescreen: FakeSmokescreen, overrides: Partial<EgressPolicy> = {}) {
  return createPolicy({ upstream: smokescreen.url, ...overrides })
}

describe('safeFetch through an egress proxy', () => {
  it('sends a name to the proxy unresolved, and reads the page through its tunnel', async () => {
    const site = await server((req, res) => {
      res.end(`host ${req.headers.host ?? ''} path ${req.url ?? ''}`)
    })
    const smokescreen = await fakeSmokescreen({ 'shop.example.test:80': site.port })
    const resolver = stubResolver({})
    const result = await safeFetch('http://shop.example.test/page?q=1', {
      userAgent: UA,
      policy: through(smokescreen),
      resolver,
    })
    expect(result.error).toBeNull()
    expect(new TextDecoder().decode(result.response?.body)).toBe(
      'host shop.example.test path /page?q=1',
    )
    expect(result.response?.remoteAddress).toBeNull()
    expect(resolver.calls).toEqual([])
    expect(smokescreen.connects).toEqual(['shop.example.test:80'])
    // Only the tunnel's request: nothing a proxy could take for a request of its own to follow.
    expect(Object.keys(smokescreen.headers[0] ?? {})).toEqual(['host'])
  })

  it('sends a HEAD through the tunnel as it is, and a GET whose body it leaves (M2.3c)', async () => {
    const methods: string[] = []
    const site = await server((req, res) => {
      methods.push(req.method ?? '')
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end(req.method === 'HEAD' ? undefined : 'not found')
    })
    const smokescreen = await fakeSmokescreen({ 'shop.example.test:80': site.port })
    const ask = (method: 'GET' | 'HEAD') =>
      safeFetch('http://shop.example.test/gone', {
        userAgent: UA,
        policy: through(smokescreen),
        method,
        discardBody: true,
      })
    for (const method of ['HEAD', 'GET'] as const) {
      const result = await ask(method)
      expect(result.error).toBeNull()
      expect(result.response?.status).toBe(404)
      expect(result.response?.body).toHaveLength(0)
    }
    expect(methods).toEqual(['HEAD', 'GET'])
    expect(smokescreen.connects).toEqual(['shop.example.test:80', 'shop.example.test:80'])
  })

  it('still refuses here what needs no DNS: a refused address, a port, an internal name', async () => {
    const smokescreen = await fakeSmokescreen({})
    const policy = through(smokescreen)
    const code = async (url: string) =>
      (await safeFetch(url, { userAgent: UA, policy })).error?.code
    expect(await code('http://10.0.0.5/')).toBe('blocked-address')
    expect(await code('http://169.254.169.254/latest/meta-data/')).toBe('blocked-address')
    expect(await code('http://[::1]/')).toBe('blocked-address')
    expect(await code('http://[::ffff:127.0.0.1]/')).toBe('blocked-address')
    expect(await code('http://shop.example.test:22/')).toBe('port-not-allowed')
    expect(await code('http://intranet/')).toBe('blocked-host')
    expect(await code('http://localhost/')).toBe('blocked-host')
    expect(smokescreen.connects).toEqual([])
  })

  it('sends an address it vetted as an address', async () => {
    const site = await server((_req, res) => {
      res.end('by address')
    })
    const smokescreen = await fakeSmokescreen({ '93.184.215.14:80': site.port })
    const result = await safeFetch('http://93.184.215.14/', {
      userAgent: UA,
      policy: through(smokescreen),
    })
    expect(new TextDecoder().decode(result.response?.body)).toBe('by address')
    expect(smokescreen.connects).toEqual(['93.184.215.14:80'])
  })

  it("gives the proxy's refusals the codes every refusal has", async () => {
    const smokescreen = await fakeSmokescreen({
      'private.example.test:80': {
        status: 407,
        error: 'Request rejected by proxy: resolves to private address 10.0.0.5',
      },
      'nowhere.example.test:80': {
        status: 502,
        error: 'Failed to resolve remote hostname: lookup nowhere.example.test: no such host',
      },
      'down.example.test:80': {
        status: 502,
        error: 'Failed to connect to remote host: connection refused',
      },
      'slow.example.test:80': { status: 504, error: 'Timed out connecting to remote host' },
      'busy.example.test:80': { status: 429, error: 'too many concurrent tunnels' },
    })
    const policy = through(smokescreen)
    const code = async (host: string) =>
      (await safeFetch(`http://${host}/`, { userAgent: UA, policy })).error?.code
    expect(await code('private.example.test')).toBe('blocked-address')
    expect(await code('nowhere.example.test')).toBe('dns-failed')
    expect(await code('down.example.test')).toBe('connect-failed')
    expect(await code('slow.example.test')).toBe('timeout')
    expect(await code('busy.example.test')).toBe('connect-failed')
  })

  it('refuses a tunnel whose far end speaks before the client does', async () => {
    const smokescreen = await fakeSmokescreen({
      'eager.example.test:80': { early: 'HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nforged' },
    })
    const result = await safeFetch('http://eager.example.test/', {
      userAgent: UA,
      policy: through(smokescreen),
    })
    expect(result.response).toBeNull()
    expect(result.error?.code).toBe('connect-failed')
  })

  it('fails to connect, and says so, when the proxy is not there', async () => {
    const closed = await startServer((_req, res) => res.end())
    const port = closed.port
    await closed.close()
    const result = await safeFetch('http://shop.example.test/', {
      userAgent: UA,
      policy: createPolicy({ upstream: `http://127.0.0.1:${port}` }),
    })
    expect(result.error?.code).toBe('connect-failed')
  })

  it('follows a redirect to another name through the proxy, and refuses one to an address', async () => {
    const second = await server((_req, res) => {
      res.end('second')
    })
    const first = await server((req, res) => {
      const to = req.url === '/private' ? 'http://10.0.0.1/' : 'http://second.example.test/'
      res.writeHead(302, { location: to }).end()
    })
    const smokescreen = await fakeSmokescreen({
      'first.example.test:80': first.port,
      'second.example.test:80': second.port,
    })
    const policy = through(smokescreen)
    const followed = await safeFetch('http://first.example.test/', { userAgent: UA, policy })
    expect(new TextDecoder().decode(followed.response?.body)).toBe('second')
    const refused = await safeFetch('http://first.example.test/private', { userAgent: UA, policy })
    expect(refused.error?.code).toBe('blocked-address')
    expect(smokescreen.connects).toEqual([
      'first.example.test:80',
      'second.example.test:80',
      'first.example.test:80',
    ])
  })

  it('sends a JSON body through the tunnel', async () => {
    const received: string[] = []
    const api = await server((req, res) => {
      let body = ''
      req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
      req.on('end', () => {
        received.push(`${req.method ?? ''} ${req.headers['content-type'] ?? ''} ${body}`)
        res.end('{"ok":true}')
      })
    })
    const smokescreen = await fakeSmokescreen({ 'api.example.test:80': api.port })
    const result = await safeFetch('http://api.example.test/v1', {
      userAgent: UA,
      policy: through(smokescreen),
      json: { url: 'https://example.com/' },
    })
    expect(result.error).toBeNull()
    expect(received).toEqual(['POST application/json {"url":"https://example.com/"}'])
  })
})

// M2.3c review: behind the proxy a scan resolves no name of its own, so its TXT lookups are DNS
// over HTTPS, asked through the proxy like every other request.
describe('TXT lookups over DoH through an egress proxy', () => {
  const never = new AbortController().signal

  it('go through the proxy with the resolver’s name unresolved here', async () => {
    const doh = await serveDoh({ 'mail.example.test': { txt: ['v=spf1 -all'] } })
    cleanup.push(() => doh.close())
    const smokescreen = await fakeSmokescreen({ 'doh.example.test:80': doh.port })
    const resolver = stubResolver({})
    const resolve = createDohTxtResolver({
      url: 'http://doh.example.test/dns-query',
      userAgent: UA,
      policy: through(smokescreen),
      resolver,
    })
    expect(await resolve('mail.example.test', never)).toEqual({
      outcome: 'found',
      records: ['v=spf1 -all'],
    })
    expect(smokescreen.connects).toEqual(['doh.example.test:80'])
    expect(resolver.calls).toEqual([])
    expect(doh.questions).toEqual(['mail.example.test TXT'])
  })

  it('fail when the proxy refuses the resolver, and ask no other way', async () => {
    const smokescreen = await fakeSmokescreen({
      'doh.example.test:80': {
        status: 407,
        error: 'Request rejected by proxy: resolves to private address 10.0.0.5',
      },
    })
    const resolver = stubResolver({})
    const resolve = createDohTxtResolver({
      url: 'http://doh.example.test/dns-query',
      userAgent: UA,
      policy: through(smokescreen),
      resolver,
    })
    expect(await resolve('mail.example.test', never)).toEqual({ outcome: 'failed', records: [] })
    expect(smokescreen.connects).toEqual(['doh.example.test:80'])
    expect(resolver.calls).toEqual([])
  })

  it('still refuse here what needs no DNS: an address, a port, an internal name', async () => {
    const smokescreen = await fakeSmokescreen({})
    for (const url of [
      'https://10.0.0.5/dns-query',
      'https://169.254.169.254/dns-query',
      'https://dns.example.test:22/dns-query',
      'https://intranet/dns-query',
    ]) {
      const resolve = createDohTxtResolver({ url, userAgent: UA, policy: through(smokescreen) })
      expect(await resolve('mail.example.test', never), url).toEqual({
        outcome: 'failed',
        records: [],
      })
    }
    expect(smokescreen.connects).toEqual([])
  })
})

describe('TLS through an egress proxy', () => {
  let dir = ''
  let secure: https.Server
  let port = 0
  const names: string[] = []

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'arablyzer-upstream-'))
    const key = path.join(dir, 'key.pem')
    const cert = path.join(dir, 'cert.pem')
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
      ].concat(['-keyout', key, '-out', cert]),
      { stdio: 'ignore' },
    )
    secure = https.createServer(
      {
        key: readFileSync(key),
        cert: readFileSync(cert),
        SNICallback: (name, done) => {
          names.push(name)
          done(null)
        },
      },
      (_req, res) => {
        res.end('should not be read')
      },
    )
    await new Promise<void>((resolve) => {
      secure.listen(0, '127.0.0.1', resolve)
    })
    const address = secure.address()
    port = typeof address === 'object' && address !== null ? address.port : 0
  })

  afterAll(() => {
    secure.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('speaks TLS over the tunnel with the name for SNI, and refuses a certificate that does not verify', async () => {
    const smokescreen = await fakeSmokescreen({ 'secure.example.test:443': port })
    const result = await safeFetch('https://secure.example.test/', {
      userAgent: UA,
      policy: through(smokescreen),
    })
    expect(result.response).toBeNull()
    expect(result.error?.code).toBe('tls-failed')
    expect(names).toContain('secure.example.test')
  })
})

describe("the browsers' proxy through an egress proxy", () => {
  async function proxy(policy: EgressPolicy): Promise<EgressProxy> {
    const started = await startProxy({ policy })
    cleanup.push(() => started.close())
    return started
  }

  const auth = (target: EgressProxy) =>
    `Basic ${Buffer.from(`${target.username}:${target.password}`).toString('base64')}`

  function request(target: EgressProxy, url: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: Number(new URL(target.url).port),
          path: url,
          agent: false,
          headers: { 'proxy-authorization': auth(target) },
        },
        (res) => {
          let body = ''
          res.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, body })
          })
        },
      )
      req.on('error', reject)
      req.end()
    })
  }

  function connect(
    target: EgressProxy,
    authority: string,
  ): Promise<{ status: number; refused: string | undefined; socket: net.Socket }> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: Number(new URL(target.url).port),
        method: 'CONNECT',
        path: authority,
        agent: false,
        headers: { 'proxy-authorization': auth(target) },
      })
      req.on('connect', (res, socket) => {
        cleanup.push(async () => {
          socket.destroy()
          await Promise.resolve()
        })
        const refused = res.headers['x-arablyzer-refused']
        resolve({
          status: res.statusCode ?? 0,
          refused: Array.isArray(refused) ? refused[0] : refused,
          socket,
        })
      })
      req.on('error', reject)
      req.end()
    })
  }

  it("forwards a plain request, and opens a browser's tunnel, through the egress proxy", async () => {
    const site = await server((req, res) => {
      res.end(`page ${req.url ?? ''}`)
    })
    const smokescreen = await fakeSmokescreen({ 'shop.example.test:80': site.port })
    const browsersProxy = await proxy(through(smokescreen))
    expect(await request(browsersProxy, 'http://shop.example.test/a')).toEqual({
      status: 200,
      body: 'page /a',
    })
    const opened = await connect(browsersProxy, 'shop.example.test:80')
    expect(opened.status).toBe(200)
    const answer = await new Promise<string>((resolve) => {
      let text = ''
      opened.socket.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')))
      opened.socket.on('close', () => {
        resolve(text)
      })
      opened.socket.write('GET /b HTTP/1.1\r\nHost: shop.example.test\r\nConnection: close\r\n\r\n')
    })
    expect(answer).toMatch(/page \/b$/)
    expect(smokescreen.connects).toEqual(['shop.example.test:80', 'shop.example.test:80'])
    expect(browsersProxy.stats().requests).toBe(2)
  })

  it("passes the egress proxy's refusal on to the browser, logged with its code", async () => {
    const smokescreen = await fakeSmokescreen({
      'nowhere.example.test:443': { status: 502, error: 'Failed to resolve remote hostname' },
    })
    const browsersProxy = await proxy(through(smokescreen))
    expect(await connect(browsersProxy, 'private.example.test:443')).toMatchObject({
      status: 403,
      refused: 'blocked-address',
    })
    expect(await connect(browsersProxy, 'nowhere.example.test:443')).toMatchObject({
      status: 502,
      refused: 'dns-failed',
    })
    expect(browsersProxy.stats().refusals.map((refusal) => refusal.code)).toEqual([
      'blocked-address',
      'dns-failed',
    ])
  })

  it('still refuses here an address, a port or an internal name, before the egress proxy', async () => {
    const smokescreen = await fakeSmokescreen({})
    const browsersProxy = await proxy(through(smokescreen))
    expect((await connect(browsersProxy, '10.0.0.1:443')).refused).toBe('blocked-address')
    expect((await connect(browsersProxy, '[fd00::1]:443')).refused).toBe('blocked-address')
    expect((await connect(browsersProxy, 'shop.example.test:22')).refused).toBe('port-not-allowed')
    expect((await connect(browsersProxy, 'redis:6379')).refused).toBe('port-not-allowed')
    expect((await connect(browsersProxy, 'intranet:443')).refused).toBe('blocked-host')
    expect((await request(browsersProxy, 'http://127.0.0.1:8080/')).status).toBe(403)
    expect(smokescreen.connects).toEqual([])
  })
})

describe('the egress proxy in the policy', () => {
  it('is plain http://host:port', () => {
    expect(createPolicy({ upstream: 'http://smokescreen:4750' }).upstream).toBe(
      'http://smokescreen:4750',
    )
    expect(createPolicy({ upstream: 'http://smokescreen:4750/' }).upstream).toBe(
      'http://smokescreen:4750',
    )
    for (const bad of [
      'https://smokescreen:4750',
      'http://user:pass@smokescreen:4750',
      'http://smokescreen:4750/path',
      'http://smokescreen:4750/?q',
      'smokescreen:4750',
      'not a url',
    ]) {
      expect(() => createPolicy({ upstream: bad }), bad).toThrow(TypeError)
    }
    expect(createPolicy().upstream).toBeUndefined()
  })

  it('comes from ARABLYZER_EGRESS_PROXY, and keeps every refusal of the server policy', () => {
    const policy = serverPolicy({ ARABLYZER_EGRESS_PROXY: ' http://smokescreen:4750 ' }, {})
    expect(policy.upstream).toBe('http://smokescreen:4750')
    expect(policy.allowPrivate).toBe(false)
    expect(serverPolicy({}, {}).upstream).toBeUndefined()
    expect(() => serverPolicy({ ARABLYZER_EGRESS_PROXY: 'socks5://proxy:1080' }, {})).toThrow(
      TypeError,
    )
  })
})

/**
 * A proxy that answers every CONNECT with these pieces, one after another, and then waits: the
 * answers Smokescreen never gives, which openTunnel must still survive.
 */
async function answeringProxy(pieces: readonly string[], gapMs = 20): Promise<URL> {
  const sockets = new Set<net.Socket>()
  const proxy = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => undefined)
    socket.once('data', () => {
      void (async () => {
        for (const piece of pieces) {
          if (socket.destroyed) return
          socket.write(piece)
          await new Promise((resolve) => setTimeout(resolve, gapMs))
        }
      })()
    })
  })
  await new Promise<void>((resolve) => {
    proxy.listen(0, '127.0.0.1', resolve)
  })
  const address = proxy.address()
  if (address === null || typeof address === 'string') throw new Error('No port')
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy()
        proxy.close(() => {
          resolve()
        })
      }),
  )
  return new URL(`http://127.0.0.1:${String(address.port)}`)
}

describe('openTunnel', () => {
  const never = new AbortController().signal

  it('reads an answer that comes in pieces, the blank line last', async () => {
    const proxy = await answeringProxy(['HTTP/1.1 2', '00 Connection Established\r\n', '\r\n'])
    const tunnel = await openTunnel(proxy, 'shop.example.test', 443, never)
    expect(tunnel.ok).toBe(true)
    if (tunnel.ok) tunnel.socket.destroy()
  })

  it('refuses an answer that never ends, past its size', async () => {
    const header = `X-Filler: ${'x'.repeat(1000)}\r\n`
    const proxy = await answeringProxy([
      'HTTP/1.1 200 Connection Established\r\n',
      header.repeat(20),
    ])
    expect(await openTunnel(proxy, 'shop.example.test', 443, never)).toEqual({
      ok: false,
      code: 'connect-failed',
      detail: 'The egress proxy answer is too long',
    })
  })

  it('gives up on a proxy that does not answer, and on one that answers too slowly', async () => {
    const silent = await answeringProxy([])
    expect(await openTunnel(silent, 'shop.example.test', 443, never, 100)).toMatchObject({
      ok: false,
      code: 'timeout',
    })
    const slow = await answeringProxy(['HTTP/1.1 200 Connection Established\r\n', '\r\n'], 300)
    expect(await openTunnel(slow, 'shop.example.test', 443, never, 100)).toMatchObject({
      ok: false,
      code: 'timeout',
    })
  })

  it('stops waiting when its signal ends', async () => {
    const silent = await answeringProxy([])
    const stop = new AbortController()
    const waiting = openTunnel(silent, 'shop.example.test', 443, stop.signal)
    stop.abort(new Error('The scan ended'))
    await expect(waiting).rejects.toThrow('The scan ended')
  })
})
