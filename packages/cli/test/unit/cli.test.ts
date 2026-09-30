import { SCHEMA_VERSION, type Report } from '@arablyzer/report-schema'
import { describe, expect, it } from 'vitest'
import { parseCliArgs, UsageError } from '../../src/args'
import { cliPolicy, exitCode, run } from '../../src/cli'
import { clean, formatJson, formatReport } from '../../src/format'
import { langFromEnv, STRINGS } from '../../src/i18n'

describe('parseCliArgs', () => {
  it('has the documented defaults', () => {
    expect(parseCliArgs(['https://example.com/'], {})).toEqual({
      url: 'https://example.com/',
      json: false,
      lang: 'en',
      ruleIds: undefined,
      failOn: undefined,
      timeoutMs: 30_000,
      allowPrivate: false,
      render: null,
      help: false,
      version: false,
    })
  })

  it('renders in Chromium with --render, in the engines asked for, and --screenshots implies it', () => {
    const render = (...flags: string[]) => parseCliArgs(['x.test', ...flags], {}).render
    expect(render('--render')).toEqual({
      engines: ['chromium'],
      screenshotsDir: null,
      networkIsolated: false,
    })
    expect(render('--engines', 'firefox, chromium,firefox')).toMatchObject({
      engines: ['firefox', 'chromium'],
    })
    expect(render('--screenshots', 'shots')).toMatchObject({
      engines: ['chromium'],
      screenshotsDir: 'shots',
    })
  })

  it('runs WebKit only where the network is isolated: by name it is refused, and all leaves it out', () => {
    const render = (env: Record<string, string>, ...flags: string[]) =>
      parseCliArgs(['x.test', ...flags], env, 'linux').render
    expect(render({}, '--engines', 'all')).toEqual({
      engines: ['chromium', 'firefox'],
      screenshotsDir: null,
      networkIsolated: false,
    })
    expect(() => render({}, '--engines', 'chromium,webkit')).toThrow(
      /webkit sends WebRTC around the egress proxy.*ARABLYZER_NETWORK_ISOLATED=1/,
    )
    const isolated = { ARABLYZER_NETWORK_ISOLATED: '1' }
    expect(render(isolated, '--engines', 'all')).toEqual({
      engines: ['chromium', 'firefox', 'webkit'],
      screenshotsDir: null,
      networkIsolated: true,
    })
    expect(render(isolated, '--engines', 'webkit')).toMatchObject({ engines: ['webkit'] })
  })

  it('never runs WebKit on macOS, where it reaches loopback around the proxy', () => {
    const isolated = { ARABLYZER_NETWORK_ISOLATED: '1' }
    const render = (...flags: string[]) =>
      parseCliArgs(['x.test', ...flags], isolated, 'darwin').render
    expect(render('--engines', 'all')).toMatchObject({ engines: ['chromium', 'firefox'] })
    expect(() => render('--engines', 'webkit')).toThrow(
      /webkit reaches loopback addresses around the egress proxy on macOS/,
    )
  })

  it('adds https:// to a bare host and leaves other schemes for egress to refuse', () => {
    expect(parseCliArgs(['example.com/ar'], {}).url).toBe('https://example.com/ar')
    expect(parseCliArgs(['ftp://example.com/'], {}).url).toBe('ftp://example.com/')
  })

  it('reads every option', () => {
    const options = parseCliArgs(
      [
        'https://x.test',
        '--json',
        '--lang',
        'ar',
        '--fail-on',
        'serious',
        '--timeout',
        '10',
        '--allow-private',
      ],
      {},
    )
    expect(options).toMatchObject({
      json: true,
      lang: 'ar',
      failOn: 'serious',
      timeoutMs: 10_000,
      allowPrivate: true,
    })
  })

  it.each([
    [[], /a URL is required/],
    [['a', 'b'], /exactly one URL/],
    [['x.test', '--lang', 'fr'], /--lang must be ar or en/],
    [['x.test', '--fail-on', 'high'], /--fail-on must be one of critical, serious/],
    [['x.test', '--timeout', '0'], /--timeout must be/],
    [['x.test', '--timeout', '121'], /--timeout must be/],
    [['x.test', '--timeout', '1.5'], /--timeout must be/],
    [['x.test', '--rules', 'nope'], /unknown rule id: nope/],
    [['x.test', '--rules', ' , '], /at least one rule id/],
    [['x.test', '--bogus'], /Unknown option '--bogus'/],
    [['x.test', '--rules', 'ar-letter-spacing'], /ar-letter-spacing need the page rendered/],
    [
      ['x.test', '--rules', 'ar-font-no-arabic', '--engines', 'firefox'],
      /ar-font-no-arabic reads what only chromium reports: add it to --engines/,
    ],
    [['x.test', '--engines', 'edge'], /unknown engine: edge/],
    [['x.test', '--engines', ' , '], /at least one engine/],
    [['x.test', '--screenshots', ''], /--screenshots needs a directory/],
  ])('rejects %j', (argv, error) => {
    expect(() => parseCliArgs(argv, {})).toThrow(UsageError)
    expect(() => parseCliArgs(argv, {})).toThrow(error)
  })
})

describe('request counts in the text report', () => {
  it('agree with their number in English and in Arabic', () => {
    expect([1, 2, 31].map((total) => STRINGS.en.requests(total, 0))).toEqual([
      '1 request',
      '2 requests',
      '31 requests',
    ])
    expect(STRINGS.en.requests(31, 2)).toBe('31 requests, 2 refused')
    expect([1, 2, 3, 10, 11, 99, 100, 103].map((total) => STRINGS.ar.requests(total, 0))).toEqual([
      'طلب واحد',
      'طلبان',
      '3 طلبات',
      '10 طلبات',
      '11 طلباً',
      '99 طلباً',
      '100 طلب',
      '103 طلبات',
    ])
    expect(STRINGS.ar.requests(31, 2)).toBe('31 طلباً، رُفض منها 2')
  })
})

describe('langFromEnv', () => {
  it('prefers LC_ALL, then LC_MESSAGES, then LANG', () => {
    expect(langFromEnv({ LANG: 'ar_SA.UTF-8' })).toBe('ar')
    expect(langFromEnv({ LANG: 'ar_OM.UTF-8', LC_ALL: 'en_US.UTF-8' })).toBe('en')
    expect(langFromEnv({ LANG: 'en_US.UTF-8', LC_MESSAGES: 'ar_AE' })).toBe('ar')
    expect(langFromEnv({})).toBe('en')
  })
})

function report(overrides: Partial<Report> = {}): Report {
  return {
    schemaVersion: SCHEMA_VERSION,
    generator: { name: 'arablyzer', version: '0.1.0', rulesetVersion: '0.1.0' },
    target: {
      url: 'http://example.com/',
      finalUrl: 'https://example.com/',
      fetchedAt: '2026-09-24T10:00:00.000Z',
      userAgent: 'ArablyzerBot/1.0 (+https://arablyzer.com/bot)',
      http: {
        status: 200,
        contentType: 'text/html',
        redirects: [{ url: 'http://example.com/', status: 301 }],
      },
    },
    scan: { status: 'complete', durationMs: 1234, notices: [] },
    page: { lang: 'en', dir: 'rtl', dominantScript: 'arabic' },
    summary: {
      pass: 1,
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
        status: 'fail',
        title: { ar: 'لغة الصفحة', en: 'Page language' },
      },
      {
        id: 'page-noindex',
        version: '1.0.0',
        category: 'index',
        severity: 'critical',
        status: 'pass',
        title: { ar: 'noindex', en: 'noindex' },
      },
    ],
    findings: [
      {
        ruleId: 'ar-html-lang',
        severity: 'serious',
        fingerprint: '0123456789abcdef',
        message: { ar: 'الصفحة تعلن lang="en"', en: 'The page declares lang="en"' },
        evidence: {
          url: 'https://example.com/',
          selector: 'html',
          snippet: '<html lang="en" dir="rtl">',
          location: { line: 2, column: 1 },
        },
      },
    ],
    facts: {},
    ...overrides,
  }
}

describe('exitCode', () => {
  it('is 0 for a complete scan without --fail-on, even with failures', () => {
    expect(exitCode(report(), undefined)).toBe(0)
  })

  it('is 1 when a rule fails at or above --fail-on', () => {
    expect(exitCode(report(), 'serious')).toBe(1)
    expect(exitCode(report(), 'minor')).toBe(1)
    expect(exitCode(report(), 'critical')).toBe(0)
  })

  it('is 2 for failed scans, and for partial scans without qualifying failures', () => {
    expect(
      exitCode(report({ scan: { status: 'failed', durationMs: 1, notices: [] } }), 'info'),
    ).toBe(2)
    expect(
      exitCode(report({ scan: { status: 'partial', durationMs: 1, notices: [] } }), undefined),
    ).toBe(2)
    expect(
      exitCode(report({ scan: { status: 'partial', durationMs: 1, notices: [] } }), 'serious'),
    ).toBe(1)
  })
})

describe('formatReport', () => {
  it('writes the English report without colour', () => {
    expect(formatReport(report(), 'en', false)).toBe(
      [
        'Arablyzer 0.1.0 · http://example.com/ → https://example.com/',
        'HTTP 200 · complete · 1.2 s',
        '1 failed · 1 passed',
        '',
        '✗ serious  ar-html-lang  Page language',
        '    • The page declares lang="en"',
        '      html · line 2 · <html lang="en" dir="rtl">',
        '',
      ].join('\n'),
    )
  })

  it('writes the Arabic report, and colour only when asked', () => {
    const arabic = formatReport(report(), 'ar', false)
    expect(arabic).toContain('1 فشلت · 1 نجحت')
    expect(arabic).toContain('✗ خطير  ar-html-lang  لغة الصفحة')
    expect(arabic).toContain('html · السطر 2')
    expect(arabic).not.toContain('\x1b[')
    expect(formatReport(report(), 'en', true)).toContain('\x1b[31m✗ serious\x1b[0m')
  })
})

describe('terminal safety (M0.2 review)', () => {
  /** Characters a page must not get into the terminal raw; the report's own line breaks aside. */
  const unsafe = (text: string) =>
    Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)).filter(
      (code) =>
        (code < 0x20 && code !== 0x0a) ||
        (code >= 0x7f && code <= 0x9f) ||
        code === 0x2028 ||
        code === 0x2029 ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069),
    )

  const hostile = report({
    findings: [
      {
        ruleId: 'ar-html-lang',
        severity: 'serious',
        fingerprint: '0123456789abcdef',
        message: { ar: 'lang="\u202Ear"', en: 'lang="\x1b[2J\x1b[31mfake\u202Eevil"' },
        evidence: {
          url: 'https://example.com/other\u009b31m',
          selector: '#a\u0007b',
          snippet: '<html\n  lang="en"\u2066\r>',
          location: { line: 2 },
        },
      },
    ],
    scan: {
      status: 'complete',
      durationMs: 1,
      notices: [{ code: 'page-status', message: { ar: 'x', en: 'HTTP \u2028999' } }],
    },
  })

  it('shows controls and bidi overrides from the page as escapes in the text report', () => {
    const text = formatReport(hostile, 'en', false)
    expect(unsafe(text)).toEqual([])
    expect(text).toContain('lang="\\u001B[2J\\u001B[31mfake\\u202Eevil"')
    expect(text).toContain('https://example.com/other\\u009B31m · #a\\u0007b · line 2')
    expect(text).toContain('<html   lang="en"\\u2066 >')
    expect(text).toContain('HTTP \\u2028999')
    expect(unsafe(formatReport(hostile, 'ar', true)).filter((code) => code !== 0x1b)).toEqual([])
  })

  it('keeps the marks Arabic text needs', () => {
    expect(clean('مرحبا\u200F (RLM) و\u061C و\u200E')).toBe('مرحبا\u200F (RLM) و\u061C و\u200E')
  })

  it('escapes them in JSON too, which still parses to the same report', () => {
    const json = formatJson(hostile)
    expect(unsafe(json)).toEqual([])
    expect(json).toContain('\\u202E')
    expect(json.endsWith('\n')).toBe(true)
    expect(JSON.parse(json)).toEqual(hostile)
  })
})

describe('cliPolicy', () => {
  const interfaces = {
    lo: [{ address: '127.0.0.1', family: 'IPv4' }],
    eth0: [
      { address: '8.8.8.8', family: 'IPv4' },
      { address: '192.168.1.5', family: 'IPv4' },
    ],
  }

  it('denies every address of this machine by default', () => {
    expect(cliPolicy(false, interfaces)).toMatchObject({
      allowPrivate: false,
      denyCidrs: ['127.0.0.1/32', '192.168.1.5/32', '8.8.8.8/32'],
    })
  })

  it('still denies its public addresses under --allow-private (M0.2 review)', () => {
    expect(cliPolicy(true, interfaces)).toMatchObject({
      allowPrivate: true,
      denyCidrs: ['8.8.8.8/32'],
    })
  })
})

describe('run', () => {
  const io = () => {
    const out: string[] = []
    const err: string[] = []
    return {
      out,
      err,
      io: {
        stdout: (text: string) => out.push(text),
        stderr: (text: string) => err.push(text),
        env: {},
        color: false,
      },
    }
  }

  it('prints help and the version', async () => {
    const help = io()
    expect(await run(['--help'], help.io)).toBe(0)
    expect(help.out.join('')).toContain('Usage: arablyzer <url>')
    const arabic = io()
    expect(await run(['--help', '--lang', 'ar'], arabic.io)).toBe(0)
    expect(arabic.out.join('')).toContain('الاستخدام')
    const version = io()
    expect(await run(['-v'], version.io)).toBe(0)
    expect(version.out.join('')).toBe('arablyzer 0.1.0\n')
  })

  it('reports usage errors on stderr with exit code 2', async () => {
    const bad = io()
    expect(await run(['x.test', '--fail-on', 'high'], bad.io)).toBe(2)
    expect(bad.out).toEqual([])
    expect(bad.err.join('')).toMatch(
      /^arablyzer: --fail-on must be one of[^\n]*\nRun arablyzer --help/,
    )
  })
})
