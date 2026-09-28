import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Report } from '@arablyzer/report-schema'

/** fixtures/golden (M1.3 plan §5): the pages, and the reports the scanner image gave for them. */
export const GOLDEN = fileURLToPath(new URL('../../../../fixtures/golden/', import.meta.url))
export const SITES = `${GOLDEN}sites/`
export const REPORTS = `${GOLDEN}reports/`

export const GOLDEN_NAMES: readonly string[] = readdirSync(SITES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

/**
 * A report without what changes from one run to the next (BUILD-PLAN §16.3): the times, the
 * engines' versions, and the dates a clock gives, such as a certificate's end, days from now.
 * Everything else must stay as it is.
 */
export function normalize(report: Report): Report {
  const text = JSON.stringify({
    ...report,
    target: { ...report.target, fetchedAt: '1970-01-01T00:00:00.000Z' },
    scan: {
      ...report.scan,
      durationMs: 0,
      ...(report.scan.render === undefined
        ? {}
        : {
            render: report.scan.render.map((run) => ({ ...run, durationMs: 0, version: null })),
          }),
    },
  })
  return JSON.parse(text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '0000-00-00')) as Report
}
