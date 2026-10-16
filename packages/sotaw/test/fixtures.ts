import { Report, SCHEMA_VERSION, type RuleStatus } from '@arablyzer/report-schema'
import type { Outcome } from '../src/outcome'

/** A report as the scanner would return it, with the rules' statuses given and the rest plain. */
export function fakeReport(
  rules: Readonly<Record<string, RuleStatus>>,
  options: {
    status?: 'complete' | 'partial' | 'failed'
    script?: 'arabic' | 'latin' | 'other' | 'none'
    platform?: string | null
    crux?: { lcp: number; inp: number; cls: number } | 'not-found' | null
    score?: number | null
    page?: boolean
  } = {},
): Report {
  const score = options.score === undefined ? 80 : options.score
  const platform = options.platform ?? null
  return Report.parse({
    schemaVersion: SCHEMA_VERSION,
    generator: { name: 'arablyzer', version: '0.1.0', rulesetVersion: '1.2.0' },
    target: {
      url: 'https://example.sa/',
      finalUrl: 'https://example.sa/',
      fetchedAt: '2026-10-20T10:00:00.000Z',
      userAgent: 'ArablyzerBot/1.0 (+https://arablyzer.com/bot)',
      http: { status: 200, contentType: 'text/html', redirects: [] },
    },
    scan: {
      status: options.status ?? 'complete',
      durationMs: 9000,
      notices: [],
      render: [
        {
          engine: 'chromium',
          version: '1',
          status: 'rendered',
          durationMs: 5000,
          requests: { total: 40, refused: 0 },
        },
      ],
    },
    page:
      options.page === false
        ? null
        : { lang: 'ar-SA', dir: 'rtl', dominantScript: options.script ?? 'arabic' },
    summary: {
      pass: 0,
      fail: 0,
      needsReview: 0,
      notApplicable: 0,
      error: 0,
      bySeverity: { critical: 0, serious: 0, moderate: 0, minor: 0, info: 0 },
    },
    score: { overall: score, categories: {}, partial: false, rules: { ran: 1, total: 1 } },
    rules: Object.entries(rules).map(([id, status]) => ({
      id,
      version: '1.0.0',
      category: 'rtl',
      severity: 'moderate',
      status,
      title: { ar: 'قاعدة', en: 'Rule' },
    })),
    findings: [],
    facts: {
      ...(platform === null
        ? {}
        : {
            platform: {
              primary: {
                id: platform,
                name: platform,
                kind: 'platform',
                version: null,
                confidence: 90,
              },
              technologies: [],
            },
          }),
      ...(options.crux === undefined || options.crux === null
        ? {}
        : options.crux === 'not-found'
          ? {
              crux: {
                outcome: 'not-found',
                scope: null,
                key: null,
                period: null,
                lcp: null,
                inp: null,
                cls: null,
              },
            }
          : {
              crux: {
                outcome: 'found',
                scope: 'origin',
                key: 'https://example.sa',
                period: { first: '2026-09-01', last: '2026-09-28' },
                ...options.crux,
              },
            }),
    },
  })
}

/** A compact outcome with the rules given, as a judged Arabic homepage. */
export function outcome(
  rules: Record<string, 'p' | 'f' | 'r' | 'n' | 'e'>,
  change: Partial<Outcome> = {},
): Outcome {
  return {
    v: 1,
    reached: true,
    status: 'complete',
    rendered: true,
    engines: ['chromium'],
    script: 'arabic',
    lang: 'ar',
    dir: 'rtl',
    score: 80,
    platform: null,
    crux: null,
    rules,
    ruleset: '1.2.0',
    ms: 9000,
    ...change,
  }
}
