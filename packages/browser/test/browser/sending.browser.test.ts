import type { Engine } from '@arablyzer/collectors'
import { createPolicy } from '@arablyzer/egress'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bypassesProxyForLoopback,
  renderPage,
  type RenderOptions,
  type RenderOutcome,
} from '../../src/index'
import { enginesUnderTest, pages, record, serve, type Recorder, type Site } from './helpers'

// M1 review (issue #29): a scanned page's own scripts run in our browsers, so whatever they ask a
// browser to send goes out from Arablyzer's address to any host they name. The review saw Chromium
// deliver a POST with a megabyte body, a form submission, a beacon and a WebSocket upgrade to a
// second server, and Firefox a form, a beacon and a WebSocket. A render needs no page to send data,
// so its browsers send none: every request that is not GET or HEAD is refused, whatever its
// destination, WebSockets are closed unopened, and the report counts them. What a route does not
// see is closed as well: the sockets and service workers of workers, WebSocketStream, fetchLater,
// what a page sends as it is dismissed (Chromium), what a pop-up sends as it opens (Firefox and
// WebKit) and a CSP report (Firefox). Each test below serves a page that tries, at a second
// loopback server standing in for another site, and says that the server was sent nothing; each
// failed for at least one engine before its part of the fix.

// WebKit never renders on macOS (LOOPBACK_BYPASS); CI measures it on Linux.
const engines = (await enginesUnderTest()).filter((engine) => !bypassesProxyForLoopback(engine))
const cleanup: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

/** Anything a page started when the render ended had reached its target by now. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 1_000))

function shell(body: string, head = ''): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">${head}</head>
<body style="margin: 0; font-family: serif">${body}</body></html>`
}

async function another(): Promise<Recorder> {
  const server = await record()
  cleanup.push(() => server.close())
  return server
}

async function own(
  routes: Parameters<typeof pages>[0],
  upgrade?: Parameters<typeof serve>[1],
): Promise<Site> {
  const site = await serve(pages(routes), upgrade)
  cleanup.push(() => site.close())
  return site
}

/** Renders `path` of the site, with these servers, and only these, open to the render. */
async function rendered(
  engine: Engine,
  site: Site,
  others: readonly Site[],
  options: Partial<RenderOptions> = {},
  path = '/',
): Promise<RenderOutcome> {
  const [outcome] = await renderPage(site.url(path), {
    engines: [engine],
    policy: createPolicy({
      allowTargets: [site, ...others].map((server) => ({
        address: '127.0.0.1',
        port: server.port,
      })),
    }),
    // These pages use no WebRTC, the one route that needs isolation (see the SSRF suite).
    networkIsolated: true,
    timeoutMs: 20_000,
    ...options,
  })
  if (outcome === undefined) throw new Error('No outcome')
  return outcome
}

/** What a second server got, for a failure to say which way out was open. */
const got = (server: Recorder) => [
  ...server.received.map((each) => `${each.method} ${each.url} (${String(each.bytes)} bytes)`),
  ...server.upgrades.map((path) => `WebSocket ${path}`),
]

/** A statement that runs `send` and lets whatever it throws or rejects with go, as a page does. */
const ATTEMPT = `const attempt = (send) => { try { Promise.resolve(send()).catch(() => {}) } catch (error) {} };`

describe.each(engines)('a page that asks the browser to send data: %s', (engine) => {
  it('sends none of it to another server: no POST, PUT, PATCH or DELETE, no form, beacon or WebSocket', async () => {
    const elsewhere = await another()
    const socket = `ws://127.0.0.1:${String(elsewhere.port)}`
    const site = await own({
      '/': shell(
        `<p>نص عربي</p><iframe name="sink"></iframe><script>
${ATTEMPT}
const other = 'http://127.0.0.1:${String(elsewhere.port)}';
attempt(() => fetch(other + '/fetch-post', { method: 'POST', mode: 'no-cors', body: 'x'.repeat(1000000) }));
attempt(() => fetch(other + '/fetch-put', { method: 'PUT', body: '{}' }));
attempt(() => fetch(other + '/fetch-patch', { method: 'PATCH', body: '{}' }));
attempt(() => fetch(other + '/fetch-delete', { method: 'DELETE' }));
attempt(() => fetch(other + '/fetch-keepalive', { method: 'POST', mode: 'no-cors', keepalive: true, body: 'x' }));
attempt(() => { const request = new XMLHttpRequest(); request.open('POST', other + '/xhr'); request.send('x') });
attempt(() => navigator.sendBeacon(other + '/beacon', 'x'));
attempt(() => {
  const link = document.createElement('a');
  link.href = '/plain';
  link.target = 'sink';
  link.setAttribute('ping', other + '/ping');
  document.body.append(link);
  link.click();
});
attempt(() => {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = other + '/form';
  form.target = 'sink';
  document.body.append(form);
  form.submit();
});
attempt(() => {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = other + '/form-requested';
  form.target = 'sink';
  document.body.append(form);
  form.requestSubmit();
});
attempt(() => new WebSocket('${socket}/websocket'));
attempt(() => {
  if (typeof WebSocketStream !== 'function') return;
  const stream = new WebSocketStream('${socket}/websocket-stream');
  stream.closed.catch(() => {});
  return stream.opened;
});
attempt(() => {
  if (typeof fetchLater !== 'function') return;
  fetchLater(other + '/fetch-later', { method: 'POST', body: 'x', mode: 'no-cors', activateAfter: 0 });
});
</script>`,
      ),
      '/plain': shell('<p>لا شيء</p>'),
    })
    const outcome = await rendered(engine, site, [elsewhere])
    await settle()

    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(got(elsewhere)).toEqual([])
    // The report counts what was refused, as it counts what the request limit refused: in the run's
    // request counts, and not in that limit (see the run in the engine).
    expect(outcome.pageRequests.sending).toBeGreaterThanOrEqual(7)
    expect(outcome.pageRequests.made).toBeGreaterThanOrEqual(outcome.pageRequests.sending)
    expect(outcome.pageRequests.overLimit).toBe(0)
    expect(outcome.requests.limited).toBe(false)
    // A refusal for sending data cuts no font or stylesheet: the rules that ask are not told so.
    expect(outcome.facts?.limited).toBe(false)
  })

  it('refuses its own site’s POST, beacon and PUT too, whatever the destination', async () => {
    const seen: string[] = []
    const site = await serve((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname
      if (path === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          shell(`<p>نص</p><script>
${ATTEMPT}
attempt(() => fetch('/own-post', { method: 'POST', body: 'x' }));
attempt(() => fetch('/own-put', { method: 'PUT', body: 'x' }));
attempt(() => navigator.sendBeacon('/own-beacon', 'x'));
attempt(() => { const request = new XMLHttpRequest(); request.open('DELETE', '/own-delete'); request.send() });
</script>`),
        )
        return
      }
      if (path !== '/favicon.ico') seen.push(`${req.method ?? ''} ${path}`)
      res.end('ok')
    })
    cleanup.push(() => site.close())
    const outcome = await rendered(engine, site, [])
    await settle()
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(seen).toEqual([])
    expect(outcome.pageRequests.sending).toBeGreaterThanOrEqual(4)
  })

  it('sends none of it from a frame, a pop-up or a worker either, where routing that reaches the page alone would miss it', async () => {
    const elsewhere = await another()
    const other = `http://127.0.0.1:${String(elsewhere.port)}`
    const socket = `ws://127.0.0.1:${String(elsewhere.port)}`
    // What a realm does to send: a POST, a beacon where it has one, and a WebSocket of each kind.
    const sends = (tag: string) => `
try { fetch('${other}/${tag}-fetch', { method: 'POST', mode: 'no-cors', body: 'x' }).catch(() => {}) } catch (error) {}
try { navigator.sendBeacon('${other}/${tag}-beacon', 'x') } catch (error) {}
try { new WebSocket('${socket}/${tag}-websocket') } catch (error) {}
try {
  const stream = new WebSocketStream('${socket}/${tag}-websocket-stream');
  stream.opened.catch(() => {});
  stream.closed.catch(() => {});
} catch (error) {}`
    // A worker also asks for a service worker, whose requests no route sees (M1.1 CI: Firefox and
    // WebKit let a dedicated worker register one).
    const workerSource = (tag: string) => `${sends(tag)}
try { navigator.serviceWorker.register(self.location.origin + '/sw.js?from=${tag}').catch(() => {}) } catch (error) {}`
    const site = await own({
      '/': shell(
        `<p>نص عربي</p><script>
${ATTEMPT}
const blob = (source) => URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
const frame = document.createElement('iframe');
document.body.append(frame);
const inFrame = frame.contentWindow;
attempt(() => inFrame.eval(${JSON.stringify(sends('frame'))}));
attempt(() => {
  const written = document.createElement('iframe');
  written.srcdoc = '<script>' + ${JSON.stringify(sends('srcdoc'))} + '<\\/script>';
  document.body.append(written);
});
attempt(() => {
  const popup = window.open('about:blank');
  popup.eval(${JSON.stringify(sends('popup'))});
});
attempt(() => new Worker('/worker.js'));
attempt(() => new Worker(blob(${JSON.stringify(workerSource('blob'))})));
attempt(() => new Worker('/module.js', { type: 'module' }));
attempt(() => new inFrame.Worker(blob(${JSON.stringify(workerSource('frame-worker'))})));
</script>`,
      ),
      '/worker.js': [200, { 'content-type': 'text/javascript' }, workerSource('worker')],
      '/module.js': [200, { 'content-type': 'text/javascript' }, workerSource('module')],
      '/sw.js': [
        200,
        { 'content-type': 'text/javascript' },
        `self.addEventListener('install', (event) => event.waitUntil(
  fetch('${other}/from-service-worker' + location.search, { method: 'POST', mode: 'no-cors', body: 'x' }).catch(() => {})
))`,
      ],
    })
    const outcome = await rendered(engine, site, [elsewhere])
    await settle()
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(got(elsewhere)).toEqual([])
  })

  it('runs no handler of the page as it is dismissed, so nothing is sent from one: not a beacon, a keepalive POST, a plain POST or fetchLater', async () => {
    // Chromium did not put a request made in pagehide or unload to the route at all, once the page
    // navigated or reloaded: a beacon, a keepalive POST and some plain POSTs and XHRs reached a
    // second server (measured for this test). No page's handler runs then; see SEND_GUARD.
    const elsewhere = await another()
    const other = `http://127.0.0.1:${String(elsewhere.port)}`
    const heard: string[] = []
    const dismissal = (tag: string) => `
${ATTEMPT}
const send = (where) => {
  fetch('/dismissed?' + where, { keepalive: true });
  attempt(() => navigator.sendBeacon('${other}/' + where + '-beacon', 'x'));
  attempt(() => fetch('${other}/' + where + '-keepalive', { method: 'POST', mode: 'no-cors', keepalive: true, body: 'x' }));
  attempt(() => fetch('${other}/' + where + '-plain', { method: 'POST', mode: 'no-cors', body: 'x' }));
  attempt(() => { const request = new XMLHttpRequest(); request.open('POST', '${other}/' + where + '-xhr'); request.send('x') });
  attempt(() => typeof fetchLater === 'function' && fetchLater('${other}/' + where + '-fetch-later', { method: 'POST', body: 'x', mode: 'no-cors', activateAfter: 0 }));
};
addEventListener('pagehide', () => send('${tag}-pagehide'));
addEventListener('unload', () => send('${tag}-unload'));
addEventListener('pageswap', () => send('${tag}-pageswap'));
addEventListener('visibilitychange', () => send('${tag}-visibility'));
onpagehide = () => send('${tag}-onpagehide');`
    const page = (tag: string, after: string) =>
      `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head>
<body onunload="send('${tag}-body-unload')" onpagehide="send('${tag}-body-pagehide')"><p>نص</p><script>
${dismissal(tag)}
${after}
</script></body></html>`
    const site = await serve((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      if (url.pathname === '/dismissed') heard.push(url.search)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      if (url.pathname === '/')
        res.end(page('navigate', "setTimeout(() => { location.href = '/next' }, 200);"))
      else if (url.pathname === '/reload') {
        res.end(
          page(
            'reload',
            "if (!sessionStorage.getItem('reloaded')) { sessionStorage.setItem('reloaded', 'yes'); setTimeout(() => location.reload(), 200) }",
          ),
        )
      } else if (url.pathname === '/blank') {
        res.end(page('blank', "setTimeout(() => { location.href = 'about:blank' }, 200);"))
      } else res.end(shell('<p>الصفحة التالية</p>'))
    })
    cleanup.push(() => site.close())
    for (const path of ['/', '/reload', '/blank']) {
      const outcome = await rendered(engine, site, [elsewhere], {}, path)
      expect(outcome.status, outcome.error ?? '').toBe('rendered')
    }
    await settle()
    expect(got(elsewhere)).toEqual([])
    // The handlers themselves never ran: not even a GET from one reached the page's own site.
    expect(heard).toEqual([])
  })

  it('sends nothing from a frame the page removes as it sends, or a pop-up it closes, or one it writes into', async () => {
    // A pop-up cannot be scripted at all: window.open gives back null, as a browser that blocks a
    // pop-up does. Before that, a beacon or a keepalive POST made in a pop-up the render closed at
    // once reached a second server in Firefox, and one written into a pop-up in Firefox and WebKit.
    const elsewhere = await another()
    const other = `http://127.0.0.1:${String(elsewhere.port)}`
    const heard: string[] = []
    const site = await serve((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          shell(`<p>نص</p><script>
${ATTEMPT}
fetch('/found?open=' + String(window.open('about:blank')));
attempt(() => {
  const popup = window.open('about:blank');
  popup.navigator.sendBeacon('${other}/popup-beacon', 'x');
  popup.fetch('${other}/popup-keepalive', { method: 'POST', mode: 'no-cors', keepalive: true, body: 'x' });
  popup.close();
});
attempt(() => {
  const popup = window.open('about:blank');
  popup.document.write('<script>navigator.sendBeacon("${other}/popup-write-beacon", "x")<\\/script>');
});
attempt(() => {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  frame.contentWindow.navigator.sendBeacon('${other}/frame-beacon', 'x');
  frame.contentWindow.fetch('${other}/frame-keepalive', { method: 'POST', mode: 'no-cors', keepalive: true, body: 'x' });
  frame.remove();
});
attempt(() => {
  const link = document.createElement('a');
  link.href = '${other}/link-target';
  link.target = '_blank';
  document.body.append(link);
  link.click();
});
</script>`),
        )
        return
      }
      if (url.pathname === '/found') heard.push(url.search)
      res.end('ok')
    })
    cleanup.push(() => site.close())
    const outcome = await rendered(engine, site, [elsewhere])
    await settle()
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(heard).toEqual(['?open=null'])
    // The one thing that may reach it is a link the page follows in a new window, which is a GET.
    expect(got(elsewhere).filter((each) => !each.startsWith('GET /link-target'))).toEqual([])
  })

  it.each([
    [
      'a CSP violation report, by report-uri',
      (report: string) => ({
        'content-security-policy': `default-src 'self' 'unsafe-inline'; img-src 'none'; report-uri ${report}/csp-report`,
      }),
    ],
    [
      'a CSP violation report-only, by report-uri',
      (report: string) => ({
        'content-security-policy-report-only': `default-src 'self' 'unsafe-inline'; img-src 'none'; report-uri ${report}/csp-report-only`,
      }),
    ],
    [
      'a CSP violation report, by report-to',
      (report: string) => ({
        'reporting-endpoints': `csp="${report}/csp-report-to"`,
        'content-security-policy': `default-src 'self' 'unsafe-inline'; img-src 'none'; report-to csp`,
      }),
    ],
  ])('sends no report of %s to the address the site names', async (_name, headers) => {
    // A report is the browser's own POST, which the page's headers ask for: Firefox sent it around
    // its route, so its own setting turns it off (see launchOptions).
    const elsewhere = await another()
    const site = await serve((req, res) => {
      if (new URL(req.url ?? '/', 'http://x').pathname === '/') {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          ...headers(`http://127.0.0.1:${String(elsewhere.port)}`),
        })
        res.end(shell('<p>نص عربي</p><img src="/blocked.png" alt="">'))
        return
      }
      res.writeHead(404)
      res.end()
    })
    cleanup.push(() => site.close())
    const outcome = await rendered(engine, site, [elsewhere])
    // Reports go out a moment after the violation.
    await settle()
    await settle()
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(got(elsewhere)).toEqual([])
  })

  it('still makes GET and HEAD requests, to its own site and to another', async () => {
    const elsewhere = await another()
    const other = `http://127.0.0.1:${String(elsewhere.port)}`
    const site = await own({
      '/': shell(`<p>نص</p><script>
${ATTEMPT}
attempt(() => fetch('/own-get'));
attempt(() => fetch('/own-head', { method: 'HEAD' }));
attempt(() => fetch('${other}/other-get', { mode: 'no-cors' }));
attempt(() => fetch('${other}/other-head', { method: 'HEAD', mode: 'no-cors' }));
attempt(() => { new Image().src = '${other}/other-image' });
</script>`),
      '/own-get': [200, { 'content-type': 'text/plain' }, 'ok'],
      '/own-head': [200, { 'content-type': 'text/plain' }, 'ok'],
    })
    const outcome = await rendered(engine, site, [elsewhere])
    await settle()
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(outcome.pageRequests.sending).toBe(0)
    expect(outcome.pageRequests.overHosts).toBe(0)
    expect(elsewhere.upgrades).toEqual([])
    expect(elsewhere.received.map((each) => `${each.method} ${each.url}`).sort()).toEqual([
      'GET /other-get',
      'GET /other-image',
      'HEAD /other-head',
    ])
  })

  it('submits no form the page submits after it loaded, and measures the page as it was', async () => {
    // A form's navigation, refused with any error but ERR_ABORTED, left Chromium's own error page in
    // its place, which the render then measured as the site's page (measured for this test). No
    // form is submitted at all now (see SEND_GUARD), and the page stays as it was.
    const elsewhere = await another()
    const site = await own({
      '/': shell(
        `<p id="original">الصفحة الأصلية كما كتبها صاحبها</p>
<form id="f" method="post" action="http://127.0.0.1:${String(elsewhere.port)}/login"><input name="q" value="x"></form>
<script>addEventListener('load', () => setTimeout(() => document.getElementById('f').submit(), 100))</script>`,
      ),
    })
    const outcome = await rendered(engine, site, [elsewhere])
    await settle()
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(outcome.facts?.url).toBe(site.url('/'))
    expect(outcome.facts?.arabicText.map((block) => block.selector)).toEqual(['#original'])
    expect(got(elsewhere)).toEqual([])
  })

  it.each([
    ['as it loads, the review’s own page', "document.getElementById('f').submit()"],
    ['by a click on its button', "document.getElementById('b').click()"],
    ['by requestSubmit', "document.getElementById('f').requestSubmit()"],
    [
      'by the prototype’s own submit',
      "HTMLFormElement.prototype.submit.call(document.getElementById('f'))",
    ],
  ])('loads a page that submits a form %s, whole, and submits nothing', async (_how, submit) => {
    // Chromium and WebKit stop parsing a page when its script starts a navigation, and once that
    // is refused they never say the page has loaded: with the review's own page the render waited
    // out its whole budget and ended in a timeout with no facts (measured for this test). No form
    // is submitted now (see SEND_GUARD), and every engine loads the page and measures it.
    const elsewhere = await another()
    const site = await own({
      '/': shell(
        `<p id="original">الصفحة الأصلية</p>
<form id="f" method="post" action="http://127.0.0.1:${String(elsewhere.port)}/login"><input name="q" value="x"><button id="b">إرسال</button></form>
<script>${submit}</script>
<p id="after">ما بعد السكربت</p>`,
      ),
    })
    const outcome = await rendered(engine, site, [elsewhere])
    await settle()
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(outcome.durationMs).toBeLessThan(15_000)
    expect(outcome.facts?.url).toBe(site.url('/'))
    // The whole page: the paragraph after the script is there too, and the button.
    expect(outcome.facts?.arabicText.map((block) => block.selector)).toEqual([
      '#original',
      '#b',
      '#after',
    ])
    expect(got(elsewhere)).toEqual([])
  })

  it('closes a WebSocket the page opens, without connecting it, and the page hears that it closed', async () => {
    const elsewhere = await another()
    const heard: string[] = []
    const site = await serve((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x')
      if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(
          shell(`<p>نص</p><script>
const socket = new WebSocket('ws://127.0.0.1:${String(elsewhere.port)}/websocket');
socket.addEventListener('close', (event) => {
  new Image().src = '/closed?state=' + socket.readyState + '&code=' + event.code;
});
</script>`),
        )
        return
      }
      if (url.pathname === '/closed') heard.push(url.search)
      res.end('ok')
    })
    cleanup.push(() => site.close())
    const outcome = await rendered(engine, site, [elsewhere])
    await settle()
    expect(outcome.status, outcome.error ?? '').toBe('rendered')
    expect(elsewhere.upgrades).toEqual([])
    // CLOSED (3), with the code of a policy violation (1008), as a server that refused it would say.
    expect(heard).toEqual(['?state=3&code=1008'])
    expect(outcome.pageRequests.sending).toBe(1)
  })
})

describe.each(engines)('the hosts a page may contact: %s', (engine) => {
  /** Every name ends in .test, which this resolver sends to the local server the policy allows. */
  const resolver = (hostname: string) =>
    Promise.resolve(
      hostname.endsWith('.test') ? [{ address: '127.0.0.1', family: 4 as const }] : [],
    )

  it('refuses requests to hosts past the limit, and lets the hosts it has through go on', async () => {
    const hosts: string[] = []
    const names = Array.from({ length: 12 }, (_, index) => `host${String(index)}.test`)
    const site = await serve((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname
      if (path === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        // Twelve other hosts, one image each, and one image of the page's own host.
        const port = req.headers.host?.split(':')[1] ?? ''
        res.end(
          shell(
            names
              .map(
                (name) =>
                  `<img src="http://${name}:${port}/${name}.png" width="1" height="1" alt="">`,
              )
              .join('') + `<img src="/own.png" width="1" height="1" alt="">`,
          ),
        )
        return
      }
      if (path.endsWith('.png')) hosts.push(req.headers.host?.split(':')[0] ?? '')
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(Buffer.alloc(10))
    })
    cleanup.push(() => site.close())
    // The page's own host is one of the four, so three of the twelve can be reached.
    const [outcome] = await renderPage(`http://start.test:${String(site.port)}/`, {
      engines: [engine],
      policy: createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] }),
      resolver,
      networkIsolated: true,
      timeoutMs: 20_000,
      maxHosts: 4,
    })
    await settle()
    expect(outcome?.status, outcome?.error ?? '').toBe('rendered')
    const reached = names.filter((name) => hosts.includes(name))
    expect(reached).toHaveLength(3)
    expect(hosts.filter((host) => host === 'start.test')).toEqual(['start.test'])
    expect(outcome?.pageRequests.overHosts).toBe(9)
    expect(outcome?.pageRequests.overLimit).toBe(0)
    expect(outcome?.pageRequests.sending).toBe(0)
    // It cut the page's loading, so a rule that asks whether a font was cut by us is told so; the
    // request limit was not reached, and the report's request-limit notice does not say it was.
    expect(outcome?.facts?.limited).toBe(true)
    expect(outcome?.requests.limited).toBe(false)
  })
})
