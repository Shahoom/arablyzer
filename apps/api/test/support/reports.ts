import type { Report } from '@arablyzer/report-schema'

// Reports with only what the comparison reads: enough to compare, not to be valid.

export interface FindingSpec {
  readonly ruleId: string
  readonly severity?: 'critical' | 'serious' | 'moderate' | 'minor' | 'info'
  readonly selector?: string
  readonly url?: string
  readonly snippet?: string
  readonly engines?: ('chromium' | 'firefox' | 'webkit')[]
}

export function reportOf(
  overall: number | null,
  findings: readonly FindingSpec[] = [],
  options: {
    categories?: Record<string, number | null>
    render?: Record<string, 'rendered' | 'failed'>
    ruleset?: string
    ran?: number
    status?: 'complete' | 'partial'
  } = {},
): Report {
  return {
    generator: { name: 'arablyzer', version: '1.0.0', rulesetVersion: options.ruleset ?? '1.0.0' },
    scan: {
      status: options.status ?? 'complete',
      render: Object.entries(options.render ?? {}).map(([engine, status]) => ({ engine, status })),
    },
    score: {
      overall,
      categories: options.categories ?? {},
      rules: { ran: options.ran ?? 40, total: 40 },
    },
    findings: findings.map((finding, index) => ({
      ruleId: finding.ruleId,
      severity: finding.severity ?? 'moderate',
      fingerprint: `${finding.ruleId.length}${index}`.padEnd(16, 'a'),
      message: { ar: `ar ${finding.ruleId}`, en: `en ${finding.ruleId}` },
      evidence: {
        ...(finding.selector === undefined ? {} : { selector: finding.selector }),
        ...(finding.url === undefined ? {} : { url: finding.url }),
        ...(finding.snippet === undefined ? {} : { snippet: finding.snippet }),
        ...(finding.engines === undefined ? {} : { engines: finding.engines }),
      },
    })),
  } as unknown as Report
}
