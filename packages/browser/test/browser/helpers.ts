import http from 'node:http'
import type { Duplex } from 'node:stream'
import { ENGINES, type Engine } from '@arablyzer/collectors'
import { engineAvailable } from '../../src/index'

export interface Site {
  readonly port: number
  readonly origin: string
  url(pathname?: string): string
  close(): Promise<void>
}

/** An HTTP server on 127.0.0.1 for one test; `upgrade` gets each WebSocket handshake it is sent. */
export async function serve(
  handler: http.RequestListener,
  upgrade?: (req: http.IncomingMessage, socket: Duplex) => void,
): Promise<Site> {
  const server = http.createServer(handler)
  if (upgrade !== undefined) server.on('upgrade', upgrade)
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

/** What a recording server was sent: the method, the path and query, and the size of the body. */
export interface Received {
  readonly method: string
  readonly url: string
  readonly bytes: number
}

export interface Recorder extends Site {
  /** Every request that reached it. */
  readonly received: Received[]
  /** The path of every WebSocket handshake that reached it. */
  readonly upgrades: string[]
}

/**
 * A server on 127.0.0.1 that stands in for another site: it answers everything, allows every
 * origin, and records all that reaches it, so that a test can say that nothing did.
 */
export async function record(): Promise<Recorder> {
  const received: Received[] = []
  const upgrades: string[] = []
  const site = await serve(
    (req, res) => {
      let bytes = 0
      req.on('data', (chunk: Buffer) => {
        bytes += chunk.length
      })
      req.on('end', () => {
        received.push({ method: req.method ?? '', url: req.url ?? '', bytes })
        res.writeHead(200, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': '*',
          'access-control-allow-headers': '*',
          'content-type': 'text/plain',
        })
        res.end('ok')
      })
    },
    (req, socket) => {
      upgrades.push(req.url ?? '')
      socket.destroy()
    },
  )
  return { ...site, received, upgrades }
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
