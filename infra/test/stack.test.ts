import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The stack as Compose runs it (M2.1 plan §5b), tested from outside, with compose.e2e.yaml's
// golden site. CI starts it; by hand:
//
//   docker compose -f infra/compose.yaml -f infra/compose.e2e.yaml up -d --build --wait
//   pnpm test:stack
//
// It runs a listener on the host's own network while it runs, and at its end it stops the API
// for a moment, and starts it again.

const SITE = process.env.ARABLYZER_STACK_URL ?? 'http://127.0.0.1:8080'
/** Golden site 04, on the test network's public-looking subnet (compose.e2e.yaml). */
const FIXTURE = 'http://93.184.215.50/'
/** What Cloudflare's test site keys give, and its test secret accepts (infra/.env.example). */
const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'
const INFRA = fileURLToPath(new URL('..', import.meta.url))
/** A name the container's networks do not have: Docker's DNS knows it not, or cannot ask on. */
const UNRESOLVED = /^(?:ENOTFOUND|EAI_AGAIN)$/
/** The networks without a way out, compose.yaml's and the test's own. */
const INTERNAL = ['data', 'scan', 'isolated', 'testnet'] as const
const SERVICES = ['web', 'api', 'worker', 'scanner', 'egress', 'valkey', 'postgres'] as const
/** The services that run Node, which reaps no process it did not start. */
const NODE_SERVICES = ['api', 'worker', 'scanner'] as const

interface Container {
  readonly Config: { readonly Image: string; readonly Env: readonly string[] }
  readonly State: { readonly Health?: { readonly Status: string } }
  readonly HostConfig: {
    readonly NanoCpus: number
    readonly PidsLimit: number | null
    readonly Memory: number
    readonly MemorySwap: number
    readonly ReadonlyRootfs: boolean
    readonly CapDrop: readonly string[] | null
    readonly SecurityOpt: readonly string[] | null
    readonly Init: boolean | null
    readonly LogConfig: { readonly Type: string; readonly Config: Readonly<Record<string, string>> }
  }
}

interface Network {
  readonly Internal: boolean
  readonly Options: Readonly<Record<string, string>>
  readonly IPAM: {
    readonly Config: readonly { readonly Subnet: string; readonly Gateway?: string }[]
  }
}

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 120_000 }).trim()
}

/** docker compose, on the stack: its standard output. */
function compose(...args: string[]): string {
  return execFileSync(
    'docker',
    ['compose', '-f', 'compose.yaml', '-f', 'compose.e2e.yaml', ...args],
    {
      cwd: INFRA,
      encoding: 'utf8',
      timeout: 120_000,
    },
  ).trim()
}

function only<T>(items: readonly T[], what: string): T {
  const [item] = items
  if (item === undefined || items.length !== 1) throw new Error(`Not one ${what}`)
  return item
}

/** What `docker inspect` says of a service's container. */
function inspect(service: string): Container {
  return only(
    JSON.parse(docker('inspect', compose('ps', '--quiet', service))) as Container[],
    service,
  )
}

function network(name: string): Network {
  return only(JSON.parse(docker('network', 'inspect', `arablyzer_${name}`)) as Network[], name)
}

/** A Node script run in one of the stack's containers: its standard output. */
function inside(service: string, script: string): string {
  return compose('exec', '-T', service, 'node', '-e', script)
}

/** TCP connections from a container, all at once: 'open', 'timeout' or the error's code, by host. */
function reach(service: string, hosts: readonly string[], port: number): Record<string, string> {
  return JSON.parse(
    inside(
      service,
      `const net = require('net');
       Promise.all(${JSON.stringify(hosts)}.map((host) => new Promise((done) => {
         const s = net.connect(${String(port)}, host);
         s.setTimeout(3000, () => { s.destroy(); done([host, 'timeout']) });
         s.on('connect', () => { s.destroy(); done([host, 'open']) });
         s.on('error', (e) => done([host, e.code || e.message]));
       }))).then((all) => console.log(JSON.stringify(Object.fromEntries(all))));`,
    ),
  ) as Record<string, string>
}

const reachOne = (service: string, host: string, port: number) => reach(service, [host], port)[host]

/** A CONNECT through the egress proxy, from the scanner: the proxy's status line. */
function tunnel(authority: string): string {
  return inside(
    'scanner',
    `const s = require('net').connect(4750, 'egress', () =>
       s.write('CONNECT ${authority} HTTP/1.1\\r\\nHost: ${authority}\\r\\n\\r\\n'));
     let seen = '';
     s.on('data', (d) => { seen += d; if (seen.includes('\\r\\n')) { console.log(seen.split('\\r\\n')[0]); process.exit(0) } });
     s.on('error', (e) => { console.log(e.code); process.exit(0) });
     setTimeout(() => { console.log('timeout'); process.exit(0) }, 15000);`,
  )
}

/** The processes in a container, by the kernel's name for each, and their state. */
function processes(service: string): { name: string; state: string }[] {
  return JSON.parse(
    inside(
      service,
      `const fs = require('fs');
       const all = [];
       for (const pid of fs.readdirSync('/proc').filter((entry) => /^\\d+$/.test(entry))) {
         try {
           const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
           const close = stat.lastIndexOf(')');
           all.push({ name: stat.slice(stat.indexOf('(') + 1, close), state: stat.slice(close + 2, close + 3) });
         } catch {}
       }
       console.log(JSON.stringify(all));`,
    ),
  ) as { name: string; state: string }[]
}

const addressNumber = (address: string) =>
  address.split('.').reduce((number, part) => number * 256 + Number(part), 0)

function inSubnet(address: string, cidr: string): boolean {
  const [base = '', bits = '32'] = cidr.split('/')
  const size = 2 ** (32 - Number(bits))
  const start = Math.floor(addressNumber(base) / size) * size
  const number = addressNumber(address)
  return number >= start && number < start + size
}

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
const host = { listener: '', port: 0, addresses: [] as string[] }

beforeAll(async () => {
  const image = inspect('api').Config.Image
  host.listener = docker(
    'run',
    '--detach',
    '--rm',
    '--network',
    'host',
    '--entrypoint',
    'node',
    image,
    '-e',
    "const s = require('net').createServer((c) => c.end('host\\n')); s.listen(0, () => console.log(s.address().port))",
  )
  for (let tries = 0; host.port === 0 && tries < 100; tries++) {
    const logged = docker('logs', host.listener)
    if (/^\d+$/.test(logged)) host.port = Number(logged)
    else await new Promise((resolve) => setTimeout(resolve, 100))
  }
  host.addresses = JSON.parse(
    docker(
      'run',
      '--rm',
      '--network',
      'host',
      '--entrypoint',
      'node',
      image,
      '-e',
      "console.log(JSON.stringify(Object.values(require('os').networkInterfaces()).flat().filter((a) => a.family === 'IPv4' && !a.internal).map((a) => a.address)))",
    ),
  ) as string[]
})

afterAll(() => {
  if (host.listener !== '') docker('rm', '--force', host.listener)
})

describe('the site server', () => {
  it('serves the pages compressed, with the security headers, and names no server', async () => {
    const response = await fetch(`${SITE}/`, { headers: { 'accept-encoding': 'gzip' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-encoding')).toBe('gzip')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000')
    expect(response.headers.get('server')).toBeNull()
    expect(await response.text()).toContain('lang="ar"')
  })

  it('answers a page that is not there with the security headers too', async () => {
    const response = await fetch(`${SITE}/no-such-page`)
    expect(response.status).toBe(404)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('server')).toBeNull()
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

  it("is published on the host's loopback alone, for the host's own proxy", () => {
    expect(compose('port', 'web', '8080')).toMatch(/^127\.0\.0\.1:\d+$/)
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
    const left = processes('scanner')
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
    expect(reachOne('scanner', 'egress', 4750)).toBe('open')
    for (const [name, port] of [
      ['valkey', 6379],
      ['postgres', 5432],
      ['api', 8787],
      ['web', 8080],
    ] as const) {
      expect(reachOne('scanner', name, port), name).toMatch(UNRESOLVED)
    }
    expect(reachOne('scanner', '93.184.215.50', 80)).not.toBe('open')
  })

  it('give the worker the stores and the scanner, and no way out', () => {
    expect(reachOne('worker', 'scanner', 8788)).toBe('open')
    expect(reachOne('worker', 'valkey', 6379)).toBe('open')
    expect(reachOne('worker', 'egress', 4750)).toMatch(UNRESOLVED)
    expect(reachOne('worker', '93.184.215.50', 80)).not.toBe('open')
  })

  it('give the host no address on the internal ones', () => {
    expect(host.addresses.length).toBeGreaterThan(0)
    for (const name of INTERNAL) {
      const internal = network(name)
      expect(internal.Internal, name).toBe(true)
      expect(internal.Options['com.docker.network.bridge.gateway_mode_ipv4'], name).toBe('isolated')
      for (const { Subnet } of internal.IPAM.Config) {
        expect(
          host.addresses.filter((address) => inSubnet(address, Subnet)),
          `${name} ${Subnet}`,
        ).toEqual([])
      }
    }
  })

  it("keep the host's own services out of the scanner's and the worker's reach", () => {
    expect(host.port).toBeGreaterThan(0)
    // The edge network has a way out, through the host: there, the listener answers.
    expect(Object.values(reach('api', host.addresses, host.port))).toContain('open')
    for (const service of ['scanner', 'worker']) {
      for (const [address, outcome] of Object.entries(reach(service, host.addresses, host.port))) {
        // Refused would mean the host answered: an address of its, reached.
        expect(outcome, `${service} → ${address}`).not.toMatch(/^(?:open|ECONNREFUSED)$/)
      }
    }
  })

  it('give the scanner and the worker no IPv6 address but loopback', () => {
    for (const service of ['scanner', 'worker']) {
      const table = inside(
        service,
        "try { console.log(require('fs').readFileSync('/proc/net/if_inet6', 'utf8')) } catch { console.log('') }",
      )
      const interfaces = table
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => line.trim().split(/\s+/).at(-1))
      expect(
        interfaces.filter((name) => name !== 'lo'),
        service,
      ).toEqual([])
    }
  })
})

describe('the egress proxy', () => {
  it('opens a public address on 80 and 443 alone', () => {
    expect(tunnel('93.184.215.50:80')).toMatch(/^HTTP\/1\.[01] 200/)
    expect(tunnel('93.184.215.50:8080')).toMatch(/^HTTP\/1\.1 500/)
  })

  it('refuses every private, local and metadata address, and the stack itself', () => {
    for (const authority of [
      '10.0.0.1:80',
      '127.0.0.1:80',
      '169.254.169.254:80',
      '172.17.0.1:80',
      '192.168.1.1:443',
      '100.64.0.1:80',
      '[::1]:80',
      '[fd00::1]:443',
      'valkey:6379',
      'postgres:80',
      'api:80',
    ]) {
      expect(tunnel(authority), authority).toMatch(/^HTTP\/1\.1 (407|502)/)
    }
  })

  it("refuses the server's own address, which the API, the scanner and it are all given", async () => {
    const given = (['egress', 'api', 'scanner'] as const).map(
      (service) =>
        inspect(service)
          .Config.Env.find((entry) => entry.startsWith('ARABLYZER_DENY_CIDRS='))
          ?.slice('ARABLYZER_DENY_CIDRS='.length) ?? '',
    )
    expect(new Set(given).size).toBe(1)
    const cidr = given[0]?.split(',')[0]?.trim() ?? ''
    expect(cidr).toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/)
    const address = cidr.split('/')[0] ?? ''
    // Refused for the rule, not unreachable: 407 is the refusal's own answer.
    expect(tunnel(`${address}:80`)).toMatch(/^HTTP\/1\.1 407/)
    const refused = await postScan(`http://${address}/`)
    expect(refused.status).toBe(422)
    expect(await refused.json()).toEqual({ error: 'blocked-address' })
  })

  it("carries the API's Turnstile check, like every request the stack makes", () => {
    // The scan above passed Turnstile's check; the check went out through the proxy.
    expect(compose('logs', '--no-color', 'egress')).toContain('challenges.cloudflare.com')
  })
})

describe('the containers', () => {
  it('run read-only, unprivileged, with caps on CPU, processes, memory and logs', () => {
    for (const service of SERVICES) {
      const { HostConfig: config } = inspect(service)
      expect(config.ReadonlyRootfs, service).toBe(true)
      expect(config.CapDrop, service).toEqual(['ALL'])
      expect(config.SecurityOpt, service).toContain('no-new-privileges:true')
      expect(config.NanoCpus, service).toBeGreaterThan(0)
      expect(config.PidsLimit ?? 0, service).toBeGreaterThan(0)
      expect(config.Memory, service).toBeGreaterThan(0)
      // No swap past the memory limit.
      expect(config.MemorySwap, service).toBe(config.Memory)
      expect(config.LogConfig, service).toEqual({
        Type: 'json-file',
        Config: { 'max-file': '3', 'max-size': '10m' },
      })
    }
    for (const service of NODE_SERVICES)
      expect(inspect(service).HostConfig.Init, service).toBe(true)
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
