import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveSite, sitePath } from '@arablyzer/fixtures'
import schema from '@arablyzer/report-schema/report.schema.json' with { type: 'json' }
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The bundle from the build task, which the root script runs first (see turbo.json).
const CLI = fileURLToPath(new URL('../../dist/arablyzer.mjs', import.meta.url))

// Built once by the root scripts (pnpm test:e2e, pnpm test:browser) before any test runs; two
// tasks building at once deleted each other's dist/ (2026-09-27).
if (!existsSync(CLI)) {
  throw new Error(
    `${CLI} is missing: run pnpm test:e2e or test:browser from the repository root, or pnpm --filter @arablyzer/cli build`,
  )
}

const ajv = new Ajv2020({ strict: true, allErrors: true })
addFormats(ajv)
const validate = ajv.compile(schema)

/** What the browser needs from this environment, and nothing else. */
const PASS = ['PATH', 'HOME', 'PLAYWRIGHT_BROWSERS_PATH', 'ARABLYZER_CHROMIUM_PATH']

function arablyzer(args: readonly string[], env: Record<string, string> = {}) {
  const base = Object.fromEntries(
    PASS.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]])),
  ) as Record<string, string>
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      {
        env: { ...base, PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK: '1', ...env },
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : -1
        resolve({ code, stdout, stderr })
      },
    )
  })
}

let site: Awaited<ReturnType<typeof serveSite>>
let shots: string

beforeAll(async () => {
  site = await serveSite(sitePath('sample'))
  shots = mkdtempSync(path.join(tmpdir(), 'arablyzer-shots-'))
})

afterAll(async () => {
  await site.close()
  rmSync(shots, { recursive: true, force: true })
})

describe('arablyzer --render (built bundle)', () => {
  it('renders in Chromium, reports the run, and saves the screenshot', async () => {
    const result = await arablyzer([
      site.url('/'),
      '--allow-private',
      '--json',
      '--screenshots',
      shots,
    ])
    const report = JSON.parse(result.stdout) as {
      scan: { render?: { engine: string; status: string }[] }
    }
    expect(validate(report), ajv.errorsText(validate.errors)).toBe(true)
    expect(report.scan.render).toEqual([
      expect.objectContaining({ engine: 'chromium', status: 'rendered' }),
    ])
    const png = path.join(shots, 'chromium.png')
    expect(existsSync(png)).toBe(true)
    expect(readFileSync(png).subarray(1, 4).toString('latin1')).toBe('PNG')
  })

  it('names the command that installs a missing browser, and exits 2', async () => {
    const result = await arablyzer([site.url('/'), '--allow-private', '--render', '--lang', 'en'], {
      ARABLYZER_CHROMIUM_PATH: '/nonexistent/chromium',
    })
    expect(result.code).toBe(2)
    expect(result.stdout).toContain('Chromium · not installed')
    expect(result.stderr).toMatch(
      /install it with: npx playwright-core@\d+\.\d+\.\d+ install chromium/,
    )
  })
})

describe('arablyzer --lab (built bundle, M1.3b)', () => {
  it('loads Lighthouse from outside the bundle, and prints its metrics as information', async () => {
    const result = await arablyzer([site.url('/'), '--allow-private', '--lab', '--lang', 'en'])
    expect(result.stderr).toBe('')
    expect(result.stdout).toMatch(/Lighthouse 13\.5\.0 \(lab, information only\) · performance \d+/)
    const json = await arablyzer([site.url('/'), '--allow-private', '--lab', '--json'])
    const report = JSON.parse(json.stdout) as { facts: { lab?: { status: string } } }
    expect(validate(report), ajv.errorsText(validate.errors)).toBe(true)
    expect(report.facts.lab?.status).toBe('measured')
  })
})
