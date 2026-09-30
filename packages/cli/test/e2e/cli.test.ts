import { execFile } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtureCaFile, serveSite, sitePath, type FixtureSite } from '@arablyzer/fixtures'
import schema from '@arablyzer/report-schema/report.schema.json' with { type: 'json' }
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'

// The bundle from the build task, which the root script runs first (see turbo.json).
const CLI = fileURLToPath(new URL('../../dist/arablyzer.mjs', import.meta.url))

// Built once by the root scripts (pnpm test:e2e, pnpm test:browser) before any test runs; two
// tasks building at once deleted each other's dist/ (2026-09-27).
if (!existsSync(CLI)) {
  throw new Error(
    `${CLI} is missing: run pnpm test:e2e or test:browser from the repository root, or pnpm --filter @arablyzer/cli build`,
  )
}
const RULES_DIR = fileURLToPath(new URL('../../../rules/src/rules/', import.meta.url))
const SHARED_SITES = fileURLToPath(new URL('../../../../fixtures/sites/', import.meta.url))

const ajv = new Ajv2020({ strict: true, allErrors: true })
addFormats(ajv)
const validate = ajv.compile(schema)

interface Result {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

function arablyzer(args: readonly string[], env: Record<string, string> = {}): Promise<Result> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { env: { PATH: process.env.PATH ?? '', ...env }, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === 'number' ? error.code : -1
        resolve({ code, stdout, stderr })
      },
    )
  })
}

const dirs = (root: string) =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${root}${entry.name}`)
    : []

/**
 * The site's address on 127.0.0.1: the CLI resolves names with real DNS, which never answers a
 * fixture's .example name, and a fixture's certificate covers 127.0.0.1 too.
 */
function addressUrl(site: FixtureSite): string {
  const url = new URL(site.url('/'))
  url.hostname = '127.0.0.1'
  return url.href
}

/** Sites served over HTTPS carry certificates from the test authority, which the CLI must trust. */
const TRUST = { NODE_EXTRA_CA_CERTS: fixtureCaFile() }

/**
 * Whether a fixture site answers under several names (site.json `aliases`): it redirects to a
 * name real DNS cannot answer, so the CLI cannot follow it. The engine's fixture suite scans
 * those sites with the fixture server's own resolver.
 */
function servesSeveralNames(dir: string): boolean {
  const file = `${dir}/site.json`
  if (!existsSync(file)) return false
  const site = JSON.parse(readFileSync(file, 'utf8')) as { aliases?: unknown }
  return Array.isArray(site.aliases) && site.aliases.length > 0
}

/** Every fixture site: the shared ones and every rule's wrong and right sites, under one name. */
const SITES = [
  ...dirs(SHARED_SITES),
  ...dirs(RULES_DIR).flatMap((rule) => dirs(`${rule}/fixtures/`)),
].filter((dir) => !servesSeveralNames(dir))

/** Sites whose home page is a bot challenge (403, 202), or is not there (404). */
const ANSWER_NO_PAGE = ['/bot-challenge/fixtures/wrong', '/fixtures/sites/ssrf-redirects']

describe('arablyzer (built bundle)', () => {
  it('is built', () => {
    expect(existsSync(CLI)).toBe(true)
  })

  it.each(SITES.map((dir) => [dir.split('/').slice(-3).join('/'), dir]))(
    'scans %s with --json into a schema-valid report',
    async (_name, dir) => {
      const site = await serveSite(dir)
      try {
        const result = await arablyzer([addressUrl(site), '--json', '--allow-private'], TRUST)
        expect(result.stderr).toBe('')
        const report: unknown = JSON.parse(result.stdout)
        expect(validate(report), ajv.errorsText(validate.errors)).toBe(true)
        // A site that answers with a bot challenge, or an error, in place of the page was not
        // scanned: the scan is partial, which exits 2 (M2.3c).
        expect(result.code).toBe(ANSWER_NO_PAGE.some((name) => dir.includes(name)) ? 2 : 0)
      } finally {
        await site.close()
      }
    },
  )

  it('refuses loopback without --allow-private, with a JSON report and exit code 2', async () => {
    const site = await serveSite(sitePath('sample'))
    try {
      const result = await arablyzer([site.url('/'), '--json'])
      expect(result.code).toBe(2)
      const report = JSON.parse(result.stdout) as {
        scan: { status: string; notices: { code: string }[] }
      }
      expect(report.scan.status).toBe('failed')
      expect(report.scan.notices.map((notice) => notice.code)).toEqual(['port-not-allowed'])
    } finally {
      await site.close()
    }
  })

  it('prints a text report in the language of the environment', async () => {
    const site = await serveSite(sitePath('sample'))
    try {
      const english = await arablyzer([site.url('/'), '--allow-private'], { LANG: 'en_US.UTF-8' })
      expect(english.code).toBe(0)
      expect(english.stdout).toMatch(
        /^Arablyzer 0\.1\.0 · http:\/\/127\.0\.0\.1:\d+\/\nHTTP 200 · complete/,
      )
      const arabic = await arablyzer([site.url('/'), '--allow-private'], { LANG: 'ar_OM.UTF-8' })
      expect(arabic.stdout).toContain('HTTP 200 · مكتمل')
    } finally {
      await site.close()
    }
  })

  it('exits 2 with a message on stderr for invalid options', async () => {
    const result = await arablyzer(['--timeout', 'soon', 'example.com'])
    expect(result.code).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toMatch(/^arablyzer: --timeout must be/)
  })

  it('exits 1 only when a rule fails at --fail-on or above', async () => {
    // ar-html-lang is serious; the fixture fails nothing else.
    const site = await serveSite(`${RULES_DIR}ar-html-lang/fixtures/wrong`)
    try {
      const args = [site.url('/'), '--json', '--allow-private']
      expect((await arablyzer(args)).code).toBe(0)
      expect((await arablyzer([...args, '--fail-on', 'serious'])).code).toBe(1)
      expect((await arablyzer([...args, '--fail-on', 'critical'])).code).toBe(0)
    } finally {
      await site.close()
    }
  })

  it('runs only the rules named with --rules', async () => {
    const site = await serveSite(`${RULES_DIR}robots-blocks-googlebot/fixtures/wrong`)
    try {
      const result = await arablyzer([
        site.url('/'),
        '--json',
        '--allow-private',
        '--rules',
        'robots-blocks-googlebot,page-noindex',
      ])
      const report = JSON.parse(result.stdout) as { rules: { id: string; status: string }[] }
      expect(report.rules.map((rule) => [rule.id, rule.status])).toEqual([
        ['page-noindex', 'pass'],
        ['robots-blocks-googlebot', 'fail'],
      ])
    } finally {
      await site.close()
    }
  })

  it('prints each failure with its evidence in the text report', async () => {
    const site = await serveSite(`${RULES_DIR}whatsapp-link-format/fixtures/wrong`)
    try {
      const result = await arablyzer([site.url('/'), '--allow-private', '--lang', 'en'])
      expect(result.stdout).toContain('✗ serious  whatsapp-link-format')
      expect(result.stdout).toContain(
        '• The WhatsApp link number "0501234567" starts with 0; write it in full international format, starting with the country code.',
      )
      expect(result.stdout).toMatch(
        /body > main > ul > li:nth-of-type\(2\) > a · line 14 · <a href="https:\/\/wa\.me\/0501234567">/,
      )
    } finally {
      await site.close()
    }
  })

  it('never asks for a page its site keeps ArablyzerBot from, says so, and exits 2', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'arablyzer-cli-opt-out-'))
    writeFileSync(path.join(root, 'robots.txt'), 'User-agent: ArablyzerBot\nDisallow: /\n')
    writeFileSync(path.join(root, 'index.html'), '<p>مرحبا</p>')
    const site = await serveSite(root)
    try {
      const result = await arablyzer([site.url('/'), '--allow-private', '--lang', 'en'])
      expect(result.code).toBe(2)
      expect(result.stdout).toContain(
        `• The site’s robots.txt asks ArablyzerBot not to check this page, so it was not scanned. The rule “Disallow: /” is on line 2 of ${site.url('/robots.txt')}.`,
      )
      expect(site.requests).toEqual(['GET /robots.txt'])
    } finally {
      await site.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('arablyzer without its optional packages (M1.3b review)', () => {
  it('scans on, with notices and install hints, when Playwright and Lighthouse are missing', async () => {
    // The bundle alone, where no node_modules can give it Playwright, Lighthouse or puppeteer.
    const alone = mkdtempSync(path.join(tmpdir(), 'arablyzer-alone-'))
    cpSync(path.dirname(CLI), alone, { recursive: true })
    const site = await serveSite(sitePath('sample'))
    try {
      const result = await new Promise<Result>((resolve) => {
        execFile(
          process.execPath,
          [
            path.join(alone, 'arablyzer.mjs'),
            site.url('/'),
            '--allow-private',
            '--render',
            '--lab',
            '--json',
          ],
          { env: { PATH: process.env.PATH ?? '' }, maxBuffer: 16 * 1024 * 1024 },
          (error, stdout, stderr) => {
            const code = error === null ? 0 : typeof error.code === 'number' ? error.code : -1
            resolve({ code, stdout, stderr })
          },
        )
      })
      const report = JSON.parse(result.stdout) as {
        scan: { status: string; notices: { code: string }[]; render?: { status: string }[] }
        facts: { lab?: { status: string } }
      }
      expect(validate(report), ajv.errorsText(validate.errors)).toBe(true)
      expect(report.scan.render?.map((run) => run.status)).toEqual(['unavailable'])
      expect(report.facts.lab?.status).toBe('unavailable')
      expect(report.scan.notices.map((notice) => notice.code)).toEqual(
        expect.arrayContaining(['engine-unavailable', 'lab-unavailable']),
      )
      expect(result.stderr).toContain('npx playwright-core@1.63.0 install chromium')
      expect(result.stderr).toContain('lighthouse@13.5.0 and puppeteer-core@25.12.0')
      // Not rendered, so partial: exit 2, and never a crash.
      expect(result.code).toBe(2)
      expect(result.stderr).not.toContain('unexpected error')
    } finally {
      await site.close()
      rmSync(alone, { recursive: true, force: true })
    }
  })
})
