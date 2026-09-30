import dgram from 'node:dgram'
import http from 'node:http'
import net from 'node:net'

/**
 * The browser SSRF suite's pieces (M1.1), shared with Lighthouse's (M1.3b): a local service no
 * scan may reach, and a hostile page that tries every way a browser can reach it. The resolver has
 * egress's Resolver shape, written out: egress's tests depend on this package, not the reverse.
 */

export interface Trap {
  readonly port: number
  /**
   * Every TCP connection and UDP packet that reached it, with what it carried: "stun" for STUN
   * and TURN messages (WebRTC), or the first line of anything else, such as an HTTP request.
   */
  readonly hits: string[]
  close(): Promise<void>
}

/** RFC 8489 §5: every STUN (and TURN) message carries this magic cookie in bytes 4 to 7. */
const STUN_MAGIC_COOKIE = 0x2112a442

function carried(data: Buffer): string {
  if (data.length >= 8 && data.readUInt32BE(4) === STUN_MAGIC_COOKIE) return 'stun'
  const line = data.toString('latin1').split(/\r?\n/, 1)[0] ?? ''
  return JSON.stringify(line.slice(0, 80))
}

/**
 * A local service no scan may reach: TCP on 127.0.0.1 (and ::1 when this machine has IPv6
 * loopback) and UDP on the same port, for WebRTC. It records anything that arrives.
 */
export async function trap(): Promise<Trap> {
  const hits: string[] = []
  const sockets = new Set<net.Socket>()
  const onConnection = (socket: net.Socket) => {
    const hit = hits.push(`tcp ${socket.remoteAddress ?? ''}`) - 1
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.once('data', (data: Buffer) => {
      hits[hit] = `${hits[hit] ?? ''} ${carried(data)}`
      socket.end('HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\nsecret')
    })
    socket.on('error', () => undefined)
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
  udp.on('message', (message, remote) => hits.push(`udp ${remote.address} ${carried(message)}`))
  await new Promise<void>((resolve) => {
    udp.bind(port, '127.0.0.1', resolve)
  })
  return {
    port,
    hits,
    close: async () => {
      udp.close()
      // A client that keeps its end open (TURN over TCP does) would hold server.close() forever.
      for (const socket of sockets) socket.destroy()
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

/** internal.test is a public-looking name that resolves to loopback. */
export const SSRF_RESOLVER = (
  hostname: string,
): Promise<readonly { readonly address: string; readonly family: 4 | 6 }[]> =>
  hostname === 'internal.test'
    ? Promise.resolve([{ address: '127.0.0.1', family: 4 as const }])
    : Promise.reject(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }))

/** WebRTC towards the trap: STUN, and TURN over UDP and over TCP. */
export function webrtcScript(port: number): string {
  return `
try {
  const pc = new RTCPeerConnection({ iceServers: [
    { urls: 'stun:127.0.0.1:${port}' },
    { urls: 'turn:127.0.0.1:${port}?transport=udp', username: 'a', credential: 'b' },
    { urls: 'turn:127.0.0.1:${port}?transport=tcp', username: 'a', credential: 'b' },
  ] });
  pc.createDataChannel('x');
  pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => {});
} catch {}`
}

/**
 * Every way this page can make a browser send a request, towards a local service: the trap's
 * port on 127.0.0.1, localhost, [::1] and a name that resolves to loopback, plus the metadata
 * address and loopback on port 80, which the proxy log must show refused. Engines that render
 * only where the network is isolated get it without WebRTC, which they send around the proxy.
 */
export function hostilePage(port: number, withWebrtc: boolean): string {
  const at = (path: string) => `http://127.0.0.1:${port}${path}`
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css">
<link rel="prefetch" href="${at('/prefetch')}">
<link rel="preload" as="image" href="${at('/preload')}">
<link rel="preconnect" href="${at('')}">
<link rel="dns-prefetch" href="http://internal.test">
<link rel="icon" href="${at('/icon')}">
</head><body>
<p>صفحة تحاول الوصول إلى خدمات داخلية.</p>
<img src="${at('/img')}">
<img src="http://localhost:${port}/localhost">
<img src="http://[::1]:${port}/ipv6">
<img src="http://internal.test:${port}/dns">
<img src="http://internal.test/dns-80">
<img src="http://127.0.0.1/loopback-80">
<img src="http://169.254.169.254/latest/meta-data/">
<img src="/redirect">
<img srcset="${at('/srcset')} 2x">
<iframe src="${at('/iframe')}"></iframe>
<video src="${at('/video')}"></video>
<audio src="${at('/audio')}"></audio>
<object data="${at('/object')}"></object>
<embed src="${at('/embed')}">
<a href="${at('/link')}" ping="${at('/ping')}">link</a>
<form action="${at('/form')}" method="post"><input name="q" value="x"></form>
<script>
const port = ${port};
const at = (path) => 'http://127.0.0.1:' + port + path;
fetch(at('/fetch')).catch(() => {});
fetch(at('/fetch-post'), { method: 'POST', body: 'x', mode: 'no-cors' }).catch(() => {});
try { const x = new XMLHttpRequest(); x.open('GET', at('/xhr')); x.send(); } catch {}
try { new WebSocket('ws://127.0.0.1:' + port + '/ws'); } catch {}
try { new EventSource(at('/sse')); } catch {}
try { navigator.sendBeacon(at('/beacon'), 'x'); } catch {}
try { new Worker('/worker.js'); } catch {}
try { navigator.serviceWorker.register('/sw.js').catch(() => {}); } catch {}
try { import(at('/module.js')).catch(() => {}); } catch {}
try { new WebTransport('https://127.0.0.1:' + port + '/webtransport').ready.catch(() => {}); } catch {}
${withWebrtc ? webrtcScript(port) : ''}
try { window.open(at('/popup')); } catch {}
</script></body></html>`
}

/** A route of the hostile site: a page's HTML, or a status, headers and body. */
type Route = string | readonly [number, Readonly<Record<string, string>>, string]

/**
 * The routes of the hostile site: the page, and what it loads, redirects to and navigates to.
 */
export function hostileRoutes(port: number, withWebrtc: boolean): Readonly<Record<string, Route>> {
  const at = (path: string) => `http://127.0.0.1:${port}${path}`
  return {
    '/': hostilePage(port, withWebrtc),
    '/webrtc': `<!doctype html><p>نص</p><script>${webrtcScript(port)}</script>`,
    '/style.css': [
      200,
      { 'content-type': 'text/css' },
      `@import url(${at('/import.css')}); body { background: url(${at('/background')}); }
         @font-face { font-family: Trap; src: url(${at('/font.woff2')}); }
         p { font-family: Trap, serif; }`,
    ],
    '/redirect': [302, { location: at('/redirected') }, ''],
    '/worker.js': [
      200,
      { 'content-type': 'text/javascript' },
      `fetch('${at('/from-worker')}').catch(() => {})`,
    ],
    '/sw.js': [200, { 'content-type': 'text/javascript' }, ''],
    '/refresh': `<!doctype html><meta http-equiv="refresh" content="0;url=${at('/refreshed')}"><p>نص</p>`,
    '/navigate': `<!doctype html><p>نص</p><script>location.href = '${at('/navigated')}'</script>`,
    '/leave': [302, { location: at('/') }, ''],
  }
}

export interface HostileSite {
  readonly port: number
  url(pathname?: string): string
  close(): Promise<void>
}

/** The hostile site on 127.0.0.1, for the SSRF suites of the render and of Lighthouse. */
export async function serveHostileSite(
  trapPort: number,
  withWebrtc: boolean,
): Promise<HostileSite> {
  const routes = hostileRoutes(trapPort, withWebrtc)
  const server = http.createServer((req, res) => {
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
  })
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
