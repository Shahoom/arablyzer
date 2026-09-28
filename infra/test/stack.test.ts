import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The stack as Compose runs it (M2.1 plan §5b), tested from outside, with compose.e2e.yaml's
// golden site. CI starts it; by hand:
//
//   docker compose -f infra/compose.yaml -f infra/compose.e2e.yaml up -d --build --wait
//   pnpm test:stack

const SITE = process.env.ARABLYZER_STACK_URL ?? 'http://localhost:8080'
/** Golden site 04, on the test network's public-looking subnet (compose.e2e.yaml). */
const FIXTURE = 'http://93.184.215.50/'
/** What Cloudflare's test site keys give, and its test secret accepts (infra/.env.example). */
const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'
const INFRA = fileURLToPath(new URL('..', import.meta.url))
/** A name the container's networks do not have: Docker's DNS knows it not, or cannot ask on. */
const UNRESOLVED = /^(?:ENOTFOUND|EAI_AGAIN)$/

/** A Node script run in one of the stack's containers; its standard output. */
function inside(service: string, script: string): string {
  return execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'compose.yaml',
      '-f',
      'compose.e2e.yaml',
      'exec',
      '-T',
      service,
      'node',
      '-e',
      script,
    ],
    { cwd: INFRA, encoding: 'utf8', timeout: 60_000 },
  ).trim()
}

/** A TCP connection from a container: 'open', or the error's code. */
function reach(service: string, host: string, port: number): string {
  return inside(
    service,
    `const s = require('net').connect(${port}, ${JSON.stringify(host)});
     s.setTimeout(3000, () => { console.log('timeout'); process.exit(0) });
     s.on('connect', () => { console.log('open'); process.exit(0) });
     s.on('error', (e) => { console.log(e.code || e.message); process.exit(0) });`,
  )
}

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

  it('opens every report link on its language page, never indexed', async () => {
    for (const [path, lang] of [
      ['/r/AbCdEfGhIjKlMnOpQrSt_-', 'ar'],
      ['/en/r/AbCdEfGhIjKlMnOpQrSt_-', 'en'],
      ['/r/', 'ar'],
    ] as const) {
      const response = await fetch(`${SITE}${path}`)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('x-robots-tag'), path).toBe('noindex, nofollow')
      expect(await response.text(), path).toContain(`lang="${lang}"`)
    }
  })
})

describe('a scan through the whole stack', () => {
  it('goes from the API to the report: the worker, the scanner, the egress proxy, the site', async () => {
    const created = await fetch(`${SITE}/api/scans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: FIXTURE, turnstileToken: DUMMY_TOKEN }),
    })
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

  it('refuses a private address at the API, before anything is queued', async () => {
    const refused = await fetch(`${SITE}/api/scans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://10.0.0.1/', turnstileToken: DUMMY_TOKEN }),
    })
    expect(refused.status).toBe(422)
    expect(await refused.json()).toEqual({ error: 'blocked-address' })
  })
})

describe('the networks', () => {
  it('give the scanner the egress proxy and the worker alone: no store, no site', () => {
    expect(reach('scanner', 'egress', 4750)).toBe('open')
    for (const [host, port] of [
      ['valkey', 6379],
      ['postgres', 5432],
      ['api', 8787],
      ['web', 8080],
    ] as const) {
      expect(reach('scanner', host, port), host).toMatch(UNRESOLVED)
    }
    expect(reach('scanner', '93.184.215.50', 80)).not.toBe('open')
  })

  it('give the worker the stores and the scanner, and no way out', () => {
    expect(reach('worker', 'scanner', 8788)).toBe('open')
    expect(reach('worker', 'valkey', 6379)).toBe('open')
    expect(reach('worker', 'egress', 4750)).toMatch(UNRESOLVED)
    expect(reach('worker', '93.184.215.50', 80)).not.toBe('open')
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
})
