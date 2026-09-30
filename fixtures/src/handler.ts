import http from 'node:http'

/** A server on 127.0.0.1 that answers as a handler says: see serveHandler. */
export interface HandlerSite {
  readonly port: number
  url(pathname?: string): string
  close(): Promise<void>
}

/**
 * A server on 127.0.0.1 for a test whose site must answer by who asks or by what came before,
 * which a fixture site's fixed routes cannot: a site that gives the scan's own fetch the page and
 * a browser a bot challenge, say. The sites of fixtures/ are served from files (serveSite).
 */
export async function serveHandler(handler: http.RequestListener): Promise<HandlerSite> {
  const server = http.createServer(handler)
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No port')
  return {
    port: address.port,
    url: (pathname = '/') => `http://127.0.0.1:${address.port}${pathname}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => {
          resolve()
        })
      }),
  }
}
