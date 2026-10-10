import type { EngineName } from '@arablyzer/api-contract/codes'
import type { Severity } from '@arablyzer/report-schema'
import { STRINGS } from '@arablyzer/seo/strings'
import type { Lang } from '@arablyzer/seo/site'
import { ENGINE_DOT } from '../../lib/engines'

const SEVERITY_TONE: Readonly<Record<Severity, string>> = {
  critical: 'sev-critical',
  serious: 'sev-serious',
  moderate: 'sev-moderate',
  minor: 'sev-minor',
  info: 'sev-info',
}

/** A severity in the report's own words, as the pill of global.css (SeverityPill.astro's twin). */
export function SeverityPill({ severity, lang }: { severity: Severity; lang: Lang }) {
  return (
    <span className={`sev ${SEVERITY_TONE[severity]}`}>
      {STRINGS[lang].report.severity[severity]}
    </span>
  )
}

/** A severity with how many rules of it failed: «خطير 1». */
export function SeverityCount({
  severity,
  count,
  lang,
}: {
  severity: Severity
  count: number
  lang: Lang
}) {
  return (
    <span className={`sev ${SEVERITY_TONE[severity]}`}>
      {STRINGS[lang].report.severity[severity]}
      <span dir="ltr" className="tabular-nums">
        {count}
      </span>
    </span>
  )
}

export const ENGINE_LABEL = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' } as const

export function EngineDot({ engine }: { engine: EngineName }) {
  return (
    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${ENGINE_DOT[engine]}`} />
  )
}
