import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { serveSite, sitePath } from '@arablyzer/fixtures'
import schema from '@arablyzer/report-schema/report.schema.json' with { type: 'json' }
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'

// The bundle built by `pnpm build` (test:e2e builds it first).
const CLI = fileURLToPath(new URL('../../dist/arablyzer.mjs', import.meta.url))
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

/** Every fixture site: the shared ones and every rule's wrong and right sites. */
const SITES = [
  ...dirs(SHARED_SITES),
  ...dirs(RULES_DIR).flatMap((rule) => dirs(`${rule}/fixtures/`)),
]

describe('arablyzer (built bundle)', () => {
  it('is built', () => {
    expect(existsSync(CLI)).toBe(true)
  })

  it.each(SITES.map((dir) => [dir.split('/').slice(-3).join('/'), dir]))(
    'scans %s over HTTP with --json into a schema-valid report',
    async (_name, dir) => {
      const site = await serveSite(dir)
      try {
        const result = await arablyzer([site.url('/'), '--json', '--allow-private'])
        expect(result.stderr).toBe('')
        const report: unknown = JSON.parse(result.stdout)
        expect(validate(report), ajv.errorsText(validate.errors)).toBe(true)
        expect(result.code).toBe(0)
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
})
