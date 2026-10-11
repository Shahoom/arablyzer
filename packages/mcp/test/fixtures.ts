import type { Report } from '@arablyzer/report-schema'
import type { ApiClient, Rule, RuleDetail, Scan, ScanStarted, Tool } from '../src/client'

export const ID = 'AbCdEfGhIjKlMnOpQrSt_-'

export const scan = (state: Scan['state'], overrides: Partial<Scan> = {}): Scan => ({
  id: ID,
  url: 'https://example.com/',
  state,
  tool: null,
  createdAt: '2026-10-11T12:00:00.000Z',
  score: null,
  links: {
    status: `/api/v1/scans/${ID}`,
    report: `/api/v1/scans/${ID}/report`,
    page: `https://arablyzer.example/r/${ID}`,
  },
  ...overrides,
})

const finding = (ruleId: string, severity: string, selector?: string) => ({
  ruleId,
  severity,
  fingerprint: '0123456789abcdef',
  message: { ar: `عربي ${ruleId}`, en: `English ${ruleId}` },
  evidence: selector === undefined ? {} : { selector },
})

export const report = {
  score: { overall: 72, partial: false, categories: {}, rules: { ran: 70, total: 79 } },
  summary: {
    pass: 60,
    fail: 6,
    needsReview: 2,
    notApplicable: 1,
    error: 1,
    bySeverity: { critical: 1, serious: 2, moderate: 3, minor: 0, info: 1 },
  },
  scan: {
    status: 'complete',
    render: [
      { engine: 'chromium', status: 'rendered' },
      { engine: 'webkit', status: 'failed' },
    ],
  },
  findings: [
    finding('meta-description', 'moderate', 'head'),
    finding('rtl-direction', 'critical', 'html'),
    finding('img-alt', 'serious', 'img.a'),
    finding('img-alt', 'serious', 'img.b'),
    finding('meta-title', 'moderate'),
    finding('lang', 'moderate'),
    finding('notes', 'info'),
  ],
} as unknown as Report

export const tool = (slug: string, runnable = true): Tool => ({
  slug,
  kind: runnable ? 'scan' : 'paste',
  category: 'index',
  title: { ar: `أداة ${slug}`, en: `Tool ${slug}` },
  summary: { ar: `ملخص ${slug}`, en: `Summary of ${slug}` },
  rules: ['r'],
  runnable,
  updated: '2026-10-01',
})

export const rule = (id: string): Rule => ({
  id,
  category: 'seo',
  severity: 'serious',
  wcag: null,
  manualCheck: false,
  title: { ar: `قاعدة ${id}`, en: `Rule ${id}` },
})

export const detail = (id: string): RuleDetail => ({
  ...rule(id),
  copy: {
    ar: {
      title: `قاعدة ${id}`,
      why: 'لأن',
      fix: 'أصلح',
      detect: 'نكشف',
      references: '-',
      reviewed: false,
    },
    en: {
      title: `Rule ${id}`,
      why: 'Because',
      fix: 'Fix it',
      detect: 'We detect',
      references: '-',
      reviewed: true,
    },
  },
})

/** A client that answers from memory; each method can be overridden. */
export function fakeClient(overrides: Partial<ApiClient> = {}): ApiClient & { calls: string[] } {
  const calls: string[] = []
  const started = (reused: boolean): ScanStarted => ({
    ...scan('queued'),
    reused,
    deleteToken: 'd'.repeat(43),
  })
  const base: ApiClient = {
    startScan: (url) => {
      calls.push(`startScan ${url}`)
      return Promise.resolve(started(false))
    },
    getScan: () => Promise.resolve(scan('complete', { score: 72 })),
    getReport: () => Promise.resolve(report),
    listTools: () =>
      Promise.resolve({
        data: [tool('robots-check'), tool('paste-it', false), tool('rtl-check')],
        nextCursor: null,
      }),
    runTool: (slug, url) => {
      calls.push(`runTool ${slug} ${url}`)
      return Promise.resolve({ ...started(false), tool: slug })
    },
    listRules: () =>
      Promise.resolve({ data: [rule('img-alt'), rule('rtl-direction')], nextCursor: null }),
    getRule: (id) => Promise.resolve(detail(id)),
  }
  return Object.assign({ ...base, ...overrides }, { calls })
}
