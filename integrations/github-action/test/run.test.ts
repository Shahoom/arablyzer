import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Sink } from '../src/github'
import { runAction, type RunDeps } from '../src/run'
import { golden, ID, json, KEY, ORIGIN, scanJson } from './fixtures'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

interface Seen {
  outputs: Record<string, string>
  summary: string[]
  errors: string[]
  info: string[]
  masked: string[]
  requests: { method: string; path: string; auth: string | undefined }[]
  workspace: string
}

/** Runs the Action against a stand-in API. `routes` answers by "METHOD path". */
async function run(
  inputs: Record<string, string>,
  routes: Record<string, (body: unknown) => Response>,
): Promise<{ code: number; seen: Seen }> {
  const workspace = mkdtempSync(join(tmpdir(), 'arablyzer-action-'))
  dirs.push(workspace)
  const seen: Seen = {
    outputs: {},
    summary: [],
    errors: [],
    info: [],
    masked: [],
    requests: [],
    workspace,
  }
  const sink: Sink = {
    info: (line) => seen.info.push(line),
    warning: () => undefined,
    error: (line) => seen.errors.push(line),
    output: (name, value) => {
      seen.outputs[name] = value
    },
    summary: (markdown) => seen.summary.push(markdown),
    mask: (secret) => seen.masked.push(secret),
  }
  let time = 0
  const deps: RunDeps = {
    env: {
      GITHUB_WORKSPACE: workspace,
      INPUT_API_KEY: KEY,
      INPUT_API_URL: ORIGIN,
      ...Object.fromEntries(
        Object.entries(inputs).map(([k, v]) => [`INPUT_${k.toUpperCase()}`, v]),
      ),
    },
    fetcher: (input, init) => {
      const url = new URL(input)
      const method = init?.method ?? 'GET'
      const headers = init?.headers as Record<string, string>
      seen.requests.push({ method, path: url.pathname, auth: headers.authorization })
      const route = routes[`${method} ${url.pathname}`]
      if (route === undefined)
        return Promise.resolve(json(404, { error: { code: 'not_found', message: 'x' } }))
      return Promise.resolve(
        route(init?.body === undefined ? undefined : JSON.parse(init.body as string)),
      )
    },
    sleep: (ms) => {
      time += ms
      return Promise.resolve()
    },
    now: () => time,
    writeFile: async (path, text) => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, text)
    },
    sink,
  }
  const code = await runAction(deps)
  return { code, seen }
}

const report = golden('10-')
const happy = (state = 'complete', score: number | null = 71) => ({
  'POST /api/v1/scans': () => json(202, { data: scanJson('queued') }),
  [`GET /api/v1/scans/${ID}`]: () => json(200, { data: scanJson(state, { score }) }),
  [`GET /api/v1/scans/${ID}/report`]: () => json(200, { data: report }),
})

describe('the Action', () => {
  it('scans, waits, writes the summary and the SARIF, and sets the outputs', async () => {
    const { code, seen } = await run({ url: 'https://shop.example/', lang: 'en' }, happy())
    expect(code).toBe(0)
    expect(seen.masked).toEqual([KEY])
    expect(seen.requests.every((r) => r.auth === `Bearer ${KEY}`)).toBe(true)
    expect(seen.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/v1/scans',
      `GET /api/v1/scans/${ID}`,
      `GET /api/v1/scans/${ID}/report`,
    ])
    expect(seen.outputs.score).toBe('71')
    expect(seen.outputs.result).toBe('pass')
    expect(JSON.parse(seen.outputs.scores ?? '')).toEqual({ 'https://shop.example/': 71 })
    expect(JSON.parse(seen.outputs.report_urls ?? '')).toEqual([`${ORIGIN}/r/${ID}`])
    expect(JSON.parse(seen.outputs.findings ?? '')).toEqual(report.summary.bySeverity)
    expect(seen.summary[0]).toContain('Score: **71 of 100**')

    const dir = seen.outputs.sarif_dir ?? ''
    expect(dir).toBe(join(seen.workspace, 'arablyzer-sarif'))
    const files = readdirSync(dir)
    expect(files).toEqual(['01-shop.example.sarif'])
    const sarif = JSON.parse(readFileSync(join(dir, files[0] ?? ''), 'utf8')) as { version: string }
    expect(sarif.version).toBe('2.1.0')
  })

  it('fails the step at fail_on, and not below it', async () => {
    // Report 10 has 2 critical findings and some serious ones.
    const failing = await run({ url: 'https://shop.example/', fail_on: 'critical' }, happy())
    expect(failing.code).toBe(1)
    expect(failing.seen.outputs.result).toBe('fail')
    expect(failing.seen.errors[0]).toContain('2 findings at critical severity or worse')

    const clean = structuredClone(report)
    clean.summary.bySeverity = { critical: 0, serious: 0, moderate: 1, minor: 0, info: 0 }
    const passing = await run(
      { url: 'https://shop.example/', fail_on: 'serious' },
      { ...happy(), [`GET /api/v1/scans/${ID}/report`]: () => json(200, { data: clean }) },
    )
    expect(passing.code).toBe(0)
    expect(passing.seen.outputs.result).toBe('pass')
  })

  it('does not wait when wait is false: no report, no SARIF', async () => {
    const { code, seen } = await run({ url: 'https://shop.example/', wait: 'false' }, happy())
    expect(code).toBe(0)
    expect(seen.requests).toHaveLength(1)
    expect(seen.outputs.result).toBe('started')
    expect(seen.outputs.sarif_dir).toBe('')
    expect(seen.summary[0]).toContain('not waited for')
  })

  it('polls until the scan is final, taking a reused scan at once', async () => {
    let asked = 0
    const slow = {
      ...happy(),
      [`GET /api/v1/scans/${ID}`]: () =>
        json(200, { data: scanJson(++asked < 3 ? 'running' : 'complete', { score: 71 }) }),
    }
    const waited = await run({ url: 'https://shop.example/' }, slow)
    expect(waited.code).toBe(0)
    expect(asked).toBe(3)

    const reused = await run(
      { url: 'https://shop.example/' },
      {
        ...happy(),
        'POST /api/v1/scans': () =>
          json(200, { data: scanJson('complete', { reused: true, score: 71 }) }),
      },
    )
    expect(reused.seen.requests.map((r) => r.method + r.path)).not.toContain(
      `GET/api/v1/scans/${ID}`,
    )
    expect(reused.seen.info.join('\n')).toContain('reused')
  })

  it('scans several pages and reports the lowest score', async () => {
    let n = 0
    const { code, seen } = await run(
      { urls: 'https://a.example/\nhttps://b.example/x', lang: 'ar' },
      {
        'POST /api/v1/scans': () => {
          const id = `AbCdEfGhIjKlMnOpQrSt_${n++ === 0 ? '-' : '_'}`
          return json(202, {
            data: scanJson('complete', {
              id,
              links: { status: '', report: '', page: `${ORIGIN}/r/${id}` },
            }),
          })
        },
        [`GET /api/v1/scans/AbCdEfGhIjKlMnOpQrSt_-/report`]: () =>
          json(200, { data: golden('01-') }),
        [`GET /api/v1/scans/AbCdEfGhIjKlMnOpQrSt__/report`]: () => json(200, { data: report }),
      },
    )
    expect(code).toBe(0)
    expect(seen.outputs.score).toBe('71')
    expect(Object.keys(JSON.parse(seen.outputs.scores ?? '') as object)).toHaveLength(2)
    expect(readdirSync(seen.outputs.sarif_dir ?? '').sort()).toEqual([
      '01-a.example.sarif',
      '02-b.example-x.sarif',
    ])
    expect(seen.summary[0]?.startsWith('<div dir="rtl">')).toBe(true)
  })

  it('explains a refusal in the language asked for and fails, keeping the key out of the log', async () => {
    const denied = await run(
      { url: 'https://shop.example/', lang: 'en' },
      {
        'POST /api/v1/scans': () =>
          json(401, { error: { code: 'unauthorized', message: `bad key ${KEY}` } }),
      },
    )
    expect(denied.code).toBe(1)
    expect(denied.seen.outputs.result).toBe('error')
    expect(denied.seen.errors[0]).toBe(
      'https://shop.example/: The API key is not valid, or was revoked. Make a key on your account page.',
    )
    expect(JSON.stringify(denied.seen)).not.toContain(`bad key`)

    const limited = await run(
      { url: 'https://shop.example/', lang: 'ar' },
      {
        'POST /api/v1/scans': () =>
          json(429, {
            error: { code: 'rate_limited', message: 'x', details: { retryAfterSeconds: 40 } },
          }),
      },
    )
    expect(limited.code).toBe(1)
    expect(limited.seen.summary[0]).toContain('حاول بعد 40 ثانية')
  })

  it('goes on with the other pages when one fails, but fails the run', async () => {
    let n = 0
    const { code, seen } = await run(
      { urls: 'https://a.example/\nhttps://b.example/' },
      {
        'POST /api/v1/scans': () =>
          n++ === 0
            ? json(422, { error: { code: 'blocked_target', message: 'x' } })
            : json(202, { data: scanJson('complete', { score: 71 }) }),
        [`GET /api/v1/scans/${ID}/report`]: () => json(200, { data: report }),
      },
    )
    expect(code).toBe(1)
    expect(seen.outputs.result).toBe('error')
    expect(seen.outputs.score).toBe('71')
  })

  it('stops at once for a failed scan or a wait that runs out', async () => {
    const failed = await run({ url: 'https://shop.example/' }, happy('failed', null))
    expect(failed.code).toBe(1)
    expect(failed.seen.errors[0]).toContain('The scan ended in failure')

    const never = await run(
      { url: 'https://shop.example/', timeout_seconds: '30' },
      happy('running', null),
    )
    expect(never.code).toBe(1)
    expect(never.seen.errors[0]).toContain('timeout_seconds')
  })

  it('refuses a bad setting before any request', async () => {
    const { code, seen } = await run({ url: 'https://shop.example/', fail_on: 'huge' }, happy())
    expect(code).toBe(1)
    expect(seen.requests).toEqual([])
    expect(seen.errors[0]).toContain('fail_on')
  })
})
