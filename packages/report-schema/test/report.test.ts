import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { Report, SCHEMA_VERSION, reportJsonSchema } from '../src/index'

function validReport(): Report {
  return {
    schemaVersion: SCHEMA_VERSION,
    generator: { name: 'arablyzer', version: '0.1.0', rulesetVersion: '0.1.0' },
    target: {
      url: 'http://example.com',
      finalUrl: 'https://example.com/',
      fetchedAt: '2026-09-24T10:00:00.000Z',
      userAgent: 'ArablyzerBot/1.0 (+https://arablyzer.com/bot)',
      http: {
        status: 200,
        contentType: 'text/html; charset=utf-8',
        redirects: [{ url: 'http://example.com/', status: 301 }],
      },
    },
    scan: {
      status: 'partial',
      durationMs: 1200,
      notices: [],
      render: [
        {
          engine: 'chromium',
          version: '153.0.8010.12',
          status: 'rendered',
          durationMs: 2400,
          requests: { total: 31, refused: 2 },
        },
        {
          engine: 'firefox',
          version: null,
          status: 'unavailable',
          durationMs: 5,
          requests: { total: 0, refused: 0 },
        },
        {
          engine: 'webkit',
          version: null,
          status: 'refused',
          durationMs: 0,
          requests: { total: 0, refused: 0 },
        },
      ],
    },
    page: { lang: 'en', dir: null, dominantScript: 'arabic' },
    summary: {
      pass: 0,
      fail: 1,
      needsReview: 0,
      notApplicable: 0,
      error: 0,
      bySeverity: { critical: 0, serious: 1, moderate: 0, minor: 0, info: 0 },
    },
    rules: [
      {
        id: 'ar-html-lang',
        version: '1.0.0',
        category: 'intl',
        severity: 'serious',
        wcag: ['3.1.1'],
        status: 'fail',
        title: {
          ar: 'لغة الصفحة المعلنة ليست العربية',
          en: 'Arabic page declares a non-Arabic language',
        },
      },
    ],
    findings: [
      {
        ruleId: 'ar-html-lang',
        severity: 'serious',
        fingerprint: '0123456789abcdef',
        message: {
          ar: 'المحتوى عربي لكن الصفحة تعلن lang="en"',
          en: 'Content is mostly Arabic, but <html lang="en">',
        },
        evidence: {
          url: 'https://example.com/',
          selector: 'html',
          snippet: '<html lang="en">',
          engines: ['chromium', 'firefox'],
          box: { x: -210, y: 0, width: 600, height: 40 },
          values: { declaredLang: 'en', arabicLetters: 912, latinLetters: 41 },
        },
      },
    ],
    facts: {
      robots: {
        url: 'https://example.com/robots.txt',
        status: 200,
        aiCrawlers: [{ token: 'GPTBot', purpose: 'training', allowed: false }],
      },
    },
  }
}

type JsonObject = Record<string, unknown>

/** A deep copy of the valid report with one value replaced. */
function withChange(path: readonly (string | number)[], value: unknown): unknown {
  const copy = structuredClone(validReport()) as unknown as JsonObject
  let node: JsonObject = copy
  for (const key of path.slice(0, -1)) node = node[String(key)] as JsonObject
  node[String(path.at(-1))] = value
  return copy
}

const INVALID: readonly [string, readonly (string | number)[], unknown][] = [
  ['an unknown top-level key', ['extra'], true],
  ['another schema version', ['schemaVersion'], '9.9.9'],
  ['an empty Arabic title', ['rules', 0, 'title', 'ar'], ''],
  ['a non-string English message', ['findings', 0, 'message', 'en'], 42],
  ['an unknown severity', ['findings', 0, 'severity'], 'high'],
  ['a rule id that is not kebab-case', ['rules', 0, 'id'], 'AR_Lang'],
  ['an unknown category', ['rules', 0, 'category'], 'seo'],
  ['an unknown rule status', ['rules', 0, 'status'], 'passed'],
  ['a malformed fingerprint', ['findings', 0, 'fingerprint'], 'xyz'],
  ['a snippet over 300 characters', ['findings', 0, 'evidence', 'snippet'], 'x'.repeat(301)],
  ['a negative count', ['summary', 'pass'], -1],
  ['a timestamp with a UTC offset', ['target', 'fetchedAt'], '2026-09-24T13:00:00+03:00'],
  ['an unknown AI crawler purpose', ['facts', 'robots', 'aiCrawlers', 0, 'purpose'], 'ads'],
  // M1.1: rendering.
  ['an unknown engine', ['scan', 'render', 0, 'engine'], 'edge'],
  ['an unknown render status', ['scan', 'render', 0, 'status'], 'crashed'],
  ['a negative request count', ['scan', 'render', 0, 'requests', 'refused'], -1],
  ['an empty engine list', ['findings', 0, 'evidence', 'engines'], []],
  ['a fractional box coordinate', ['findings', 0, 'evidence', 'box', 'x'], 1.5],
  ['a negative box width', ['findings', 0, 'evidence', 'box', 'width'], -1],
]

describe('Report (Zod)', () => {
  it('accepts a complete report', () => {
    expect(Report.safeParse(validReport()).success).toBe(true)
  })

  it.each(INVALID)('rejects %s', (_name, path, value) => {
    expect(Report.safeParse(withChange(path, value)).success).toBe(false)
  })
})

describe('report.schema.json (Ajv, independent of Zod)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true })
  addFormats(ajv)
  const validate = ajv.compile(reportJsonSchema())

  it('accepts the same complete report', () => {
    expect(validate(validReport())).toBe(true)
  })

  it.each(INVALID)('rejects %s', (_name, path, value) => {
    expect(validate(withChange(path, value))).toBe(false)
  })

  it('matches the committed file (run `pnpm schema:gen` after changing the contract)', () => {
    const committed: unknown = JSON.parse(
      readFileSync(new URL('../report.schema.json', import.meta.url), 'utf8'),
    )
    expect(committed).toEqual(reportJsonSchema())
  })
})
