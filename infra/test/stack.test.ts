import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  apiBelievesTheProxyAlone,
  containersHardened,
  databaseRoles,
  dockerEngine,
  egressPorts,
  egressRefusals,
  egressRefusesTheServer,
  hostServicesOutOfReach,
  internalNetworks,
  noIpv6,
  scannerNetworkClosed,
  scannerReach,
  servicesUp,
  siteOnLoopback,
  valkeyAccess,
  workerReach,
} from '../checks/checks'
import { Stack, type HostProbe } from '../checks/stack'

// The stack as Compose runs it (M2.1 plan §5b), tested from outside, with compose.e2e.yaml's
// golden site. CI starts it; by hand:
//
//   docker compose -f infra/compose.yaml -f infra/compose.e2e.yaml up -d --build --wait
//   pnpm test:stack
//
// The isolation checks are infra/checks/checks.ts's, which infra/verify-deploy.ts runs on a stack
// that was deployed. It runs a listener on the host's own network while it runs, and at its end
// it stops the API for a moment, and starts it again. Beside another stack on the same Docker,
// COMPOSE_PROJECT_NAME, ARABLYZER_PORT and ARABLYZER_STACK_URL name its own.

const SITE = process.env.ARABLYZER_STACK_URL ?? 'http://127.0.0.1:8080'
/** Golden site 04, on the test network's public-looking subnet (compose.e2e.yaml). */
const FIXTURE_ADDRESS = '93.184.215.50'
const FIXTURE = `http://${FIXTURE_ADDRESS}/`
/** What Cloudflare's test site keys give, and its test secret accepts (infra/.env.example). */
const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'

const stack = new Stack({
  files: ['compose.yaml', 'compose.e2e.yaml'],
  project: process.env.COMPOSE_PROJECT_NAME ?? 'arablyzer',
  probe: FIXTURE_ADDRESS,
})
const compose = (...args: string[]) => stack.compose(...args)
const inspect = (service: string) => stack.inspect(service)

async function scanEvents(id: string): Promise<{ type: string }[]> {
  const response = await fetch(`${SITE}/api/scans/${id}/events`, {
    signal: AbortSignal.timeout(240_000),
  })
  expect(response.status).toBe(200)
  const body = response.body
  if (body === null) throw new Error('The stream has no body')
  const events: { type: string }[] = []
  let text = ''
  const decoder = new TextDecoder()
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    text += decoder.decode(chunk, { stream: true })
    for (let end = text.indexOf('\n\n'); end >= 0; end = text.indexOf('\n\n')) {
      const data = text
        .slice(0, end)
        .split('\n')
        .find((line) => line.startsWith('data:'))
      text = text.slice(end + 2)
      if (data === undefined) continue
      const event = JSON.parse(data.slice(5)) as { type: string }
      events.push(event)
      if (event.type === 'done' || event.type === 'error') return events
    }
  }
  return events
}

function postScan(url: string): Promise<Response> {
  return fetch(`${SITE}/api/scans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, turnstileToken: DUMMY_TOKEN }),
  })
}

/** A service on the host's own network, and the host's addresses, for the networks' tests. */
let host: HostProbe

beforeAll(async () => {
  host = await stack.startHostProbe()
})

afterAll(() => {
  host.stop()
})

describe('the deployment', () => {
  it('runs on Docker Engine 28 or later, where the internal networks give the host no address', () => {
    expect(dockerEngine()).toEqual([])
  })

  it('has every service up and healthy, and the database step finished', () => {
    expect(servicesUp(stack)).toEqual([])
  })
})

describe('the site server', () => {
  it('serves the pages compressed, with the security headers, and names no server', async () => {
    const response = await fetch(`${SITE}/`, { headers: { 'accept-encoding': 'gzip' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-encoding')).toBe('gzip')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000')
    // The one directive a page's own <meta> policy cannot carry.
    expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
    expect(response.headers.get('server')).toBeNull()
    expect(await response.text()).toContain('lang="ar"')
  })

  it('answers a page that is not there with the security headers too', async () => {
    const response = await fetch(`${SITE}/no-such-page`)
    expect(response.status).toBe(404)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
    expect(response.headers.get('server')).toBeNull()
  })

  it("answers it with the 404 page of the address's language, never indexed", async () => {
    for (const [path, lang] of [
      ['/no-such-page', 'ar'],
      ['/tools/no-such-tool', 'ar'],
      ['/en/no-such-page', 'en'],
    ] as const) {
      const response = await fetch(`${SITE}${path}`)
      expect(response.status, path).toBe(404)
      expect(response.headers.get('x-robots-tag'), path).toBe('noindex, nofollow')
      const html = await response.text()
      expect(html, path).toContain(`lang="${lang}"`)
      expect(html, path).toContain('content="noindex, nofollow"')
    }
  })

  it('opens every report link on its language page, never indexed', async () => {
    for (const [path, lang] of [
      ['/r/AbCdEfGhIjKlMnOpQrSt_-', 'ar'],
      ['/en/r/AbCdEfGhIjKlMnOpQrSt_-', 'en'],
      ['/r/', 'ar'],
      ['/en/r/', 'en'],
      // By its file's name, through the redirect to the page.
      ['/r/index', 'ar'],
      ['/en/r/index.html', 'en'],
    ] as const) {
      const response = await fetch(`${SITE}${path}`)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('x-robots-tag'), path).toBe('noindex, nofollow')
      expect(await response.text(), path).toContain(`lang="${lang}"`)
    }
  })

  it('serves every page at its clean address: the tools, and each tool', async () => {
    for (const [path, lang] of [
      ['/tools', 'ar'],
      ['/tools/rtl-check', 'ar'],
      ['/en/tools', 'en'],
      ['/en/tools/rtl-check', 'en'],
    ] as const) {
      const response = await fetch(`${SITE}${path}`)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('x-content-type-options'), path).toBe('nosniff')
      expect(await response.text(), path).toContain(`lang="${lang}"`)
    }
  })

  it("sends a page's other addresses to its own for good, with the security headers", async () => {
    for (const [path, own] of [
      // A slash after a page's address.
      ['/tools/', '/tools'],
      ['/tools/rtl-check/', '/tools/rtl-check'],
      ['/en/tools/', '/en/tools'],
      // A page's file, or a directory's index, by its name.
      ['/index', '/'],
      ['/index.html', '/'],
      ['/en/index', '/en/'],
      ['/en/index.html', '/en/'],
      ['/tools.html', '/tools'],
      ['/tools/rtl-check.html', '/tools/rtl-check'],
      ['/r/index', '/r/'],
      ['/en/r/index', '/en/r/'],
      // A directory's page without its slash.
      ['/en', '/en/'],
      // The query goes along: a tool page reads the address to scan from it.
      [
        '/tools/rtl-check/?url=https%3A%2F%2Fexample.com%2F',
        '/tools/rtl-check?url=https%3A%2F%2Fexample.com%2F',
      ],
    ] as const) {
      const response = await fetch(`${SITE}${path}`, { redirect: 'manual' })
      expect(response.status, path).toBe(308)
      expect(response.headers.get('location'), path).toBe(own)
      expect(response.headers.get('x-content-type-options'), path).toBe('nosniff')
      expect(response.headers.get('strict-transport-security'), path).toBe('max-age=31536000')
      expect(response.headers.get('server'), path).toBeNull()
    }
    // A directory's page keeps its slash.
    for (const path of ['/', '/en/']) {
      expect((await fetch(`${SITE}${path}`, { redirect: 'manual' })).status, path).toBe(200)
    }
  })

  it('serves robots.txt, the sitemaps and the pages’ images, for search engines and previews', async () => {
    // XML goes as either of its media types (RFC 7303): Caddy gives text/xml.
    const XML = /^(?:application|text)\/xml\b/
    for (const [path, type] of [
      ['/robots.txt', /^text\/plain\b/],
      ['/sitemap.xml', XML],
      ['/sitemaps/tools.xml', XML],
      ['/og/tools/rtl-check.png', /^image\/png$/],
      ['/og/en/index.png', /^image\/png$/],
    ] as const) {
      const response = await fetch(`${SITE}${path}`)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('content-type'), path).toMatch(type)
    }
    expect(await (await fetch(`${SITE}/robots.txt`)).text()).toContain('Sitemap: ')
  })

  it("is published on the host's loopback alone, for the host's own proxy", () => {
    expect(siteOnLoopback(stack)).toEqual([])
  })

  it('has timeouts for a request’s headers and body, and none for a response, which a scan’s events are one of', () => {
    const config = JSON.parse(
      compose('exec', '-T', 'web', 'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile'),
    ) as { apps: { http: { servers: Record<string, Record<string, number | undefined>> } } }
    const [server] = Object.values(config.apps.http.servers)
    const SECOND = 1_000_000_000
    expect(server?.read_header_timeout).toBe(10 * SECOND)
    expect(server?.read_timeout).toBe(30 * SECOND)
    expect(server?.idle_timeout).toBe(120 * SECOND)
    // A write timeout would cut a scan's event stream, which lasts minutes.
    expect(server?.write_timeout).toBeUndefined()
  })

  it('closes a connection that is slow to send its headers, within the timeout', () => {
    // From the API's container, which reaches the site's server on the edge network: a request
    // that is never finished, held open by nothing but the timeout.
    const closedAfterMs = Number(
      stack.inside(
        'api',
        `const s = require('net').connect(8080, 'web', () => s.write('GET / HTTP/1.1\\r\\nHost: slow\\r\\n'));
         s.on('error', () => {});
         const started = Date.now();
         s.on('close', () => { console.log(Date.now() - started); process.exit(0) });
         setTimeout(() => { console.log(-1); process.exit(0) }, 30000);`,
      ),
    )
    expect(closedAfterMs).toBeGreaterThanOrEqual(9_000)
    expect(closedAfterMs).toBeLessThan(15_000)
  })
})

describe('a scan through the whole stack', () => {
  it('goes from the API to the report: the worker, the scanner, the egress proxy, the site', async () => {
    const created = await postScan(FIXTURE)
    expect(created.status).toBe(202)
    const { id } = (await created.json()) as { id: string }
    const events = await scanEvents(id)
    expect(events[0]?.type).toBe('queued')
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['started', 'page', 'render', 'rules', 'done']),
    )
    const report = (await (await fetch(`${SITE}/api/reports/${id}`)).json()) as {
      target: { url: string; http: { status: number } }
      scan: { status: string; render: { engine: string; status: string }[] }
      rules: { id: string; status: string }[]
    }
    expect(report.target.url).toBe(FIXTURE)
    expect(report.target.http.status).toBe(200)
    expect(report.scan.render.map((run) => [run.engine, run.status])).toEqual([
      ['chromium', 'rendered'],
      ['firefox', 'rendered'],
      ['webkit', 'rendered'],
    ])
    // Golden site 04's own failures (fixtures/golden/reports/04-rtl-layout.json).
    const failed = report.rules.filter((rule) => rule.status === 'fail').map((rule) => rule.id)
    expect(failed).toEqual(
      expect.arrayContaining(['rtl-horizontal-overflow', 'ar-letter-spacing', 'rtl-physical-css']),
    )
  }, 300_000)

  it("runs a tool page's scan with the tool's rules alone, and no browser", async () => {
    const created = await fetch(`${SITE}/api/scans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: FIXTURE, turnstileToken: DUMMY_TOKEN, tool: 'rtl-check' }),
    })
    expect(created.status).toBe(202)
    const { id } = (await created.json()) as { id: string }
    const events = await scanEvents(id)
    expect(events.at(-1)?.type).toBe('done')
    expect(events.map((event) => event.type)).not.toContain('render-start')
    const summary = (await (await fetch(`${SITE}/api/scans/${id}`)).json()) as { tool?: string }
    expect(summary.tool).toBe('rtl-check')
    const report = (await (await fetch(`${SITE}/api/reports/${id}`)).json()) as {
      rules: { id: string }[]
    }
    expect(report.rules.map((rule) => rule.id).sort()).toEqual(['ar-html-lang', 'rtl-html-dir'])
  }, 120_000)

  it('leaves the scanner no browser and no zombie once the scan is over', () => {
    const left = stack.processes('scanner')
    expect(left.filter((running) => running.state === 'Z')).toEqual([])
    expect(
      left.filter((running) =>
        /chrom|firefox|forkserver|Socket Process|RDD Process|Utility Process|WPE|WebKit/i.test(
          running.name,
        ),
      ),
    ).toEqual([])
  })

  it('refuses a private address at the API, before anything is queued', async () => {
    const refused = await postScan('http://10.0.0.1/')
    expect(refused.status).toBe(422)
    expect(await refused.json()).toEqual({ error: 'blocked-address' })
  })
})

describe('the networks', () => {
  it('give the scanner the egress proxy and the worker alone: no store, no site', () => {
    expect(scannerReach(stack)).toEqual([])
  })

  it('give the worker the stores and the scanner, and no way out', () => {
    expect(workerReach(stack)).toEqual([])
  })

  it('give the host no address on the internal ones', () => {
    expect(host.addresses.length).toBeGreaterThan(0)
    expect(internalNetworks(stack, host)).toEqual([])
    // The test's own network is one of them.
    expect(stack.internalNetworks()).toEqual(['data', 'isolated', 'scan', 'testnet'])
  })

  it("keep the host's own services out of the scanner's and the worker's reach", () => {
    expect(host.port).toBeGreaterThan(0)
    // The edge network has a way out, through the host: there, the listener answers.
    expect(Object.values(stack.reach('api', host.addresses, host.port))).toContain('open')
    expect(hostServicesOutOfReach(stack, host)).toEqual([])
  })

  it('give the scanner and the worker no IPv6 address but loopback', () => {
    expect(noIpv6(stack)).toEqual([])
  })
})

describe('the scanner', () => {
  it('refuses to start where its network has a way out, though it is told the network is isolated', () => {
    const { Config: scanner } = inspect('scanner')
    expect(scanner.Env).toContain('ARABLYZER_NETWORK_ISOLATED=1')
    // Its own image and settings, on the edge network, which has a way out through the host.
    const started = spawnSync(
      'docker',
      [
        ...['run', '--rm', '--network', `${stack.options.project}_edge`, '--read-only'],
        ...['--tmpfs', '/tmp', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true'],
        ...scanner.Env.flatMap((entry) => ['--env', entry]),
        ...['--entrypoint', 'node', scanner.Image, '--import', 'tsx', 'apps/scanner/src/main.ts'],
      ],
      { encoding: 'utf8', timeout: 60_000 },
    )
    expect(started.status).toBe(1)
    expect(started.stderr).toMatch(/ARABLYZER_NETWORK_ISOLATED is set, but .* not isolated/)
    expect(started.stderr).toContain('default route')
    expect(started.stdout).not.toContain('Scanner on port')
  })

  it('has no way out where it runs: no default route, and no outside name that resolves', () => {
    expect(scannerNetworkClosed(stack)).toEqual([])
  })
})

describe('the egress proxy', () => {
  it('opens a public address on 80 and 443 alone', () => {
    expect(egressPorts(stack)).toEqual([])
  })

  it('refuses every private, local and metadata address, and the stack itself', () => {
    expect(egressRefusals(stack)).toEqual([])
  })

  it("refuses the server's own addresses, IPv4 and IPv6, which the API, the scanner and it are all given", () => {
    const cidrs = (stack.env('egress', 'ARABLYZER_DENY_CIDRS') ?? '')
      .split(',')
      .map((cidr) => cidr.trim())
    // CI's list has both: the address of the test network, and an IPv6 one.
    expect(cidrs.some((cidr) => /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(cidr))).toBe(true)
    expect(cidrs.some((cidr) => /^[0-9a-f:]+\/\d+$/i.test(cidr))).toBe(true)
    // Each range of the list, and each address the host has.
    expect(egressRefusesTheServer(stack, host)).toEqual([])
  })

  it("is not the only one to refuse them: the API refuses a scan of the server's own addresses", async () => {
    for (const cidr of (stack.env('api', 'ARABLYZER_DENY_CIDRS') ?? '').split(',')) {
      const address = cidr.trim().split('/')[0] ?? ''
      const refused = await postScan(`http://${address.includes(':') ? `[${address}]` : address}/`)
      expect(refused.status, cidr).toBe(422)
      expect(await refused.json(), cidr).toEqual({ error: 'blocked-address' })
    }
  })

  it("carries the API's Turnstile check, like every request the stack makes", () => {
    // The scan above passed Turnstile's check; the check went out through the proxy.
    expect(compose('logs', '--no-color', 'egress')).toContain('challenges.cloudflare.com')
  })
})

describe('the API', () => {
  it("believes the address in X-Forwarded-For only of a request with the site server's secret", () => {
    // Without the secret, whoever reaches the API's port could be any visitor: none is believed,
    // and no scan starts. With it, the address is taken, and the request goes on to Turnstile's
    // check, which an empty token fails before any request is made: nothing is queued.
    expect(apiBelievesTheProxyAlone(stack)).toEqual([])
  })
})

describe('the stores', () => {
  it('give the API and the worker a role that reads, writes and deletes scans and changes nothing else', () => {
    expect(databaseRoles(stack)).toEqual([])
  })

  it('give the application user of Valkey the queue’s commands, and not the dangerous ones', () => {
    expect(valkeyAccess(stack)).toEqual([])
  })

  // `openssl rand -base64` makes a password with a `/` one time in three, and ioredis prints the
  // URL it cannot read, password and all, in the error of a process that dies of it.
  it('start no service on a URL they cannot read, and print nothing of its password', () => {
    const password = `${'ab12'.repeat(8)}/${'cd34'.repeat(8)}`
    for (const [service, entry, variable] of [
      ['api', 'apps/api/src/server.ts', 'VALKEY_URL'],
      ['worker', 'apps/worker/src/main.ts', 'VALKEY_URL'],
    ] as const) {
      const { Config: config } = inspect(service)
      const started = spawnSync(
        'docker',
        [
          ...['run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp'],
          ...['--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true'],
          ...config.Env.filter((entry) => !entry.startsWith(`${variable}=`)).flatMap((entry) => [
            '--env',
            entry,
          ]),
          ...['--env', `${variable}=redis://arablyzer:${password}@valkey:6379`],
          ...['--entrypoint', 'node', config.Image, '--import', 'tsx', entry],
        ],
        { encoding: 'utf8', timeout: 60_000 },
      )
      expect(started.status, service).toBe(1)
      expect(started.stderr, service).toContain(`${variable} is not a URL of the form`)
      expect(started.stderr + started.stdout, service).not.toContain(password)
      expect(started.stderr + started.stdout, service).not.toContain('ab12ab12')
    }
  })
})

describe('the containers', () => {
  it('run read-only, unprivileged, with caps on CPU, processes, memory and logs', () => {
    expect(containersHardened(stack)).toEqual([])
  })
})

// Last: it stops the API for a moment.
describe("the site server's log", () => {
  it("keeps no visitor's address and no header, even of a request that failed", async () => {
    compose('stop', 'api')
    try {
      const failed = await fetch(`${SITE}/api/scans/AbCdEfGhIjKlMnOpQrSt_-`, {
        headers: { 'x-forwarded-for': '198.51.100.77', 'user-agent': 'arablyzer-stack-test' },
      })
      expect(failed.status).toBe(502)
      expect(failed.headers.get('x-content-type-options')).toBe('nosniff')
      expect(failed.headers.get('server')).toBeNull()
    } finally {
      compose('up', '--detach', '--wait', '--no-deps', 'api')
    }
    expect(inspect('api').State.Health?.Status).toBe('healthy')
    // An error the site's server answers is logged at the debug level alone, which is off.
    const logs = compose('logs', '--no-color', 'web')
    for (const kept of [
      '198.51.100.77',
      'arablyzer-stack-test',
      'remote_ip',
      'client_ip',
      '"headers"',
    ]) {
      expect(logs, kept).not.toContain(kept)
    }
    // One it cannot answer is logged with the request: the running server's filter takes these.
    const config = JSON.parse(
      compose('exec', '-T', 'web', 'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile'),
    ) as {
      logging: { logs: { default: { encoder: { fields: Record<string, { filter: string }> } } } }
    }
    expect(config.logging.logs.default.encoder.fields).toEqual({
      'request>remote_ip': { filter: 'delete' },
      'request>remote_port': { filter: 'delete' },
      'request>client_ip': { filter: 'delete' },
      'request>headers': { filter: 'delete' },
      'request>tls': { filter: 'delete' },
    })
  })
})
