import type { Engine } from '@arablyzer/collectors'
import { createPolicy, type ResolvedAddress, type Resolver } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import { NEEDS_ISOLATION, renderPage, type RenderOutcome } from '../../src/index'
import { enginesUnderTest, pages, serve, trap, type Site, type Trap } from './helpers'

const engines = await enginesUnderTest()
const cleanup: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

/** internal.test is a public-looking name that resolves to loopback. */
const dns: Resolver = (hostname) =>
  hostname === 'internal.test'
    ? Promise.resolve<readonly ResolvedAddress[]>([{ address: '127.0.0.1', family: 4 }])
    : Promise.reject(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }))

/** WebRTC towards the trap: STUN, and TURN over UDP and over TCP. */
function webrtc(port: number): string {
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
function hostilePage(port: number, withWebrtc: boolean): string {
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
${withWebrtc ? webrtc(port) : ''}
try { window.open(at('/popup')); } catch {}
</script></body></html>`
}

async function hostileSite(port: number, withWebrtc: boolean): Promise<Site> {
  const at = (path: string) => `http://127.0.0.1:${port}${path}`
  const site = await serve(
    pages({
      '/': hostilePage(port, withWebrtc),
      '/webrtc': `<!doctype html><p>نص</p><script>${webrtc(port)}</script>`,
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
    }),
  )
  cleanup.push(() => site.close())
  return site
}

/**
 * This machine's network is not isolated. Engines that need isolation are rendered here all the
 * same, because their pages leave out the one route they send around the proxy (WebRTC); the
 * last suite shows that route still leaks, which is why they need isolation.
 */
async function render(site: Site, path: string, engine: Engine) {
  const [outcome] = await renderPage(site.url(path), {
    engines: [engine],
    policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
    resolver: dns,
    timeoutMs: 20_000,
    networkIsolated: true,
  })
  if (outcome === undefined) throw new Error('No outcome')
  return outcome
}

/** Waits up to `ms` for anything to reach the trap. */
async function hitsWithin(local: Trap, ms: number): Promise<string[]> {
  const until = performance.now() + ms
  while (local.hits.length === 0 && performance.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return local.hits
}

async function withTrap(): Promise<Trap> {
  const opened = await trap()
  cleanup.push(() => opened.close())
  return opened
}

function refusedTargets(outcome: RenderOutcome): string[] {
  return outcome.requests.refusals.map((refusal) => refusal.target)
}

describe.each(engines)('browser SSRF suite: %s', (engine) => {
  const withWebrtc = !NEEDS_ISOLATION.includes(engine)

  it('reaches no local service from a hostile page, by any route, and the proxy saw them all', async () => {
    const local = await withTrap()
    const site = await hostileSite(local.port, withWebrtc)
    const outcome = await render(site, '/', engine)
    // Give anything the page started (WebRTC gathering, retries) time to show up.
    await new Promise((resolve) => setTimeout(resolve, 1500))

    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(local.hits).toEqual([])
    const refused = refusedTargets(outcome)
    for (const target of [
      `http://127.0.0.1:${local.port}/img`,
      `http://localhost:${local.port}/localhost`,
      `http://internal.test:${local.port}/dns`,
      'http://internal.test/dns-80',
      'http://127.0.0.1/loopback-80',
      'http://169.254.169.254/latest/meta-data/',
      `http://127.0.0.1:${local.port}/redirected`,
      `http://127.0.0.1:${local.port}/fetch`,
    ]) {
      expect(refused, target).toContain(target)
    }
    expect(
      outcome.requests.refusals.find((refusal) => refusal.target === 'http://internal.test/dns-80'),
    ).toMatchObject({ code: 'blocked-address', address: '127.0.0.1', range: 'loopback' })
    expect(
      outcome.requests.refusals.find(
        (refusal) => refusal.target === 'http://169.254.169.254/latest/meta-data/',
      ),
    ).toMatchObject({ code: 'blocked-address', range: 'link-local' })
  })

  it.each(['/refresh', '/navigate', '/leave'])(
    'reaches no local service when the page navigates away (%s)',
    async (path) => {
      const local = await withTrap()
      const site = await hostileSite(local.port, withWebrtc)
      await render(site, path, engine)
      expect(local.hits).toEqual([])
    },
  )
})

// If this starts failing, the engine may have stopped sending WebRTC around the proxy: run the
// full suite above with WebRTC for it, and if that passes, take it out of NEEDS_ISOLATION.
describe.each(engines.filter((engine) => NEEDS_ISOLATION.includes(engine)))(
  'why %s renders only where the network is isolated',
  (engine) => {
    it('sends WebRTC to a local service around the proxy', async () => {
      const local = await withTrap()
      const site = await hostileSite(local.port, false)
      const outcome = await render(site, '/webrtc', engine)
      expect(outcome.status, outcome.error ?? '').toBe('rendered')
      expect(await hitsWithin(local, 10_000)).toContainEqual(expect.stringMatching(/ stun$/))
    })
  },
)
