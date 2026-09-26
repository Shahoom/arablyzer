import dgram from 'node:dgram'
import http from 'node:http'
import net from 'node:net'
import { ENGINES, type Engine } from '@arablyzer/collectors'
import { engineAvailable } from '../../src/index'

export interface Site {
  readonly port: number
  readonly origin: string
  url(pathname?: string): string
  close(): Promise<void>
}

/** An HTTP server on 127.0.0.1 for one test. */
export async function serve(handler: http.RequestListener): Promise<Site> {
  const server = http.createServer(handler)
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No port')
  const origin = `http://127.0.0.1:${address.port}`
  return {
    port: address.port,
    origin,
    url: (pathname = '/') => new URL(pathname, origin).href,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => {
          resolve()
        })
      }),
  }
}

/** Serves fixed pages: path → HTML, or → [status, headers, body]. */
export function pages(
  routes: Readonly<
    Record<string, string | readonly [number, Readonly<Record<string, string>>, string | Buffer]>
  >,
): http.RequestListener {
  return (req, res) => {
    const route = routes[new URL(req.url ?? '/', 'http://x').pathname]
    if (route === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('Not Found')
      return
    }
    if (typeof route === 'string') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(route)
      return
    }
    const [status, headers, body] = route
    res.writeHead(status, headers)
    res.end(body)
  }
}

export interface Trap {
  readonly port: number
  /** Every TCP connection and UDP packet that reached it. */
  readonly hits: string[]
  close(): Promise<void>
}

/**
 * A local service no scan may reach: TCP on 127.0.0.1 (and ::1 when this machine has IPv6
 * loopback) and UDP on the same port, for WebRTC. It records anything that arrives.
 */
export async function trap(): Promise<Trap> {
  const hits: string[] = []
  const onConnection = (socket: net.Socket) => {
    hits.push(`tcp ${socket.remoteAddress ?? ''}`)
    socket.end('HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nsecret')
  }
  const v4 = net.createServer(onConnection)
  await new Promise<void>((resolve) => {
    v4.listen(0, '127.0.0.1', resolve)
  })
  const address = v4.address()
  if (address === null || typeof address === 'string') throw new Error('No port')
  const port = address.port
  const v6 = net.createServer(onConnection)
  await new Promise<void>((resolve) => {
    v6.once('error', () => {
      resolve()
    })
    v6.listen(port, '::1', resolve)
  })
  const udp = dgram.createSocket('udp4')
  udp.on('message', (_message, remote) => hits.push(`udp ${remote.address}`))
  await new Promise<void>((resolve) => {
    udp.bind(port, '127.0.0.1', resolve)
  })
  return {
    port,
    hits,
    close: async () => {
      udp.close()
      await Promise.all(
        [v4, v6].map(
          (server) =>
            new Promise<void>((resolve) => {
              if (!server.listening) {
                resolve()
                return
              }
              server.close(() => {
                resolve()
              })
            }),
        ),
      )
    },
  }
}

/**
 * The engines to test: every engine that launches here. Engines named in
 * ARABLYZER_REQUIRE_ENGINES (CI names all three) must launch, so a missing one fails the run
 * instead of being skipped.
 */
export async function enginesUnderTest(): Promise<Engine[]> {
  const required = (process.env.ARABLYZER_REQUIRE_ENGINES ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
  const engines: Engine[] = []
  for (const engine of ENGINES) {
    if (await engineAvailable(engine)) engines.push(engine)
    else if (required.includes(engine)) {
      throw new Error(`${engine} is required by ARABLYZER_REQUIRE_ENGINES but does not launch`)
    }
  }
  if (engines.length === 0) {
    throw new Error(
      'No browser launches here: install Playwright browsers or set ARABLYZER_CHROMIUM_PATH',
    )
  }
  return engines
}
