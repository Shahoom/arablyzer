import { createServer, type Server } from 'node:http'

export interface ConnectProbe {
  readonly port: number
  /** Each `CONNECT host:port` the proxy was asked for, in order. */
  readonly seen: string[]
  close(): Promise<void>
}

/**
 * A stand-in egress proxy for a test of who reaches the network around it: it records the target
 * of every `CONNECT` and refuses it with a 403, so nothing leaves the machine. A request made
 * without it shows up as the absence of a line here (and a connection to the real host).
 */
export async function startConnectProbe(): Promise<ConnectProbe> {
  const seen: string[] = []
  const server: Server = createServer((_request, response) => {
    response.writeHead(403).end()
  })
  server.on('connect', (request, socket) => {
    seen.push(`CONNECT ${request.url ?? ''}`)
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('The probe has no port')
  return {
    port: address.port,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => {
          resolve()
        })
      }),
  }
}
