import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Finding, Report } from '@arablyzer/report-schema'

/** fixtures/golden (M1.3 plan §5): the pages, and the reports the scanner image gave for them. */
export const GOLDEN = fileURLToPath(new URL('../../../../fixtures/golden/', import.meta.url))
export const SITES = `${GOLDEN}sites/`
export const REPORTS = `${GOLDEN}reports/`
/** The fonts the reports were made with, as the image lists them. */
export const FONTS = `${GOLDEN}fonts.txt`
/** Where the image writes that list when it is built (Dockerfile). */
export const IMAGE_FONTS = fileURLToPath(new URL('../../../../fonts.txt', import.meta.url))

export const GOLDEN_NAMES: readonly string[] = readdirSync(SITES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

/**
 * Fixed ports, so each page's URL, and its findings' fingerprints, stay the same: the CrUX
 * stand-in's, and each page's from its number (01-clean-store: 30001), whatever pages are added.
 * Below 32768: Linux gives its own connections ports from 32768 to 60999, and one still open, or
 * closing, would hold a fixed port there.
 */
export const CRUX_PORT = 30_000
/** The Safe Browsing stand-in's, just below it. */
export const SAFE_BROWSING_PORT = 29_999
/** The Knowledge Graph stand-in's. */
export const KNOWLEDGE_GRAPH_PORT = 29_998

export function portOf(name: string): number {
  const number = /^(\d{2})-/.exec(name)?.[1]
  if (number === undefined || number === '00') {
    throw new Error(`${name}: a golden page's name starts with its number, 01 to 99`)
  }
  return CRUX_PORT + Number(number)
}

/**
 * A report without what changes from one run to the next (BUILD-PLAN §16.3): the times, and the
 * one date a clock gives, the end of a certificate the fixture server makes for the run. Everything
 * else, the engines' versions included, must stay as it is.
 */
export function normalize(report: Report): Report {
  return {
    ...report,
    target: { ...report.target, fetchedAt: '1970-01-01T00:00:00.000Z' },
    scan: {
      ...report.scan,
      durationMs: 0,
      ...(report.scan.render === undefined
        ? {}
        : { render: report.scan.render.map((run) => ({ ...run, durationMs: 0 })) }),
    },
    findings: report.findings.map(undated),
  }
}

/** tls-expiring names the day the certificate ends, a number of days after it was made. */
function undated(finding: Finding): Finding {
  const date = finding.evidence.values?.date
  if (finding.ruleId !== 'tls-expiring' || typeof date !== 'string') return finding
  const swap = (text: string) => text.replaceAll(date, '0000-00-00')
  return {
    ...finding,
    message: { ar: swap(finding.message.ar), en: swap(finding.message.en) },
    evidence: { ...finding.evidence, values: { ...finding.evidence.values, date: '0000-00-00' } },
  }
}
