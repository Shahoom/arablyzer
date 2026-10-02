import type { EngineName } from '@arablyzer/api-contract/codes'
import type { Severity } from '@arablyzer/report-schema'
import { STRINGS } from '@arablyzer/seo/strings'
import type { Lang } from '@arablyzer/seo/site'

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

/** Each engine's colour, as a dot beside its name: the name says which, the dot only adorns it. */
const ENGINE_DOT: Readonly<Record<EngineName, string>> = {
  chromium: 'bg-blue',
  firefox: 'bg-cat-prices',
  webkit: 'bg-cat-fonts',
}

export function EngineDot({ engine }: { engine: EngineName }) {
  return (
    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${ENGINE_DOT[engine]}`} />
  )
}

/**
 * Arablyzer's mark, the avatar of its answers: the logo's rounded square in the gradient, and the
 * three lines of Arabic text. A box with a CSS gradient, so it shares no SVG id with another mark.
 */
export function Mark() {
  return (
    <span aria-hidden="true" className="logo-mark size-9 text-white">
      <svg viewBox="0 0 32 32" fill="none" className="block size-full">
        <path
          d="M24 10.5H8.5M24 16H12.5M24 21.5H16.5"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
      </svg>
    </span>
  )
}
