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

/** Registration marks at the corners of an instrument panel. */
export function Crosshairs() {
  const corners = [
    '-top-[9px] -start-[9px]',
    '-top-[9px] -end-[9px]',
    '-bottom-[9px] -start-[9px]',
    '-bottom-[9px] -end-[9px]',
  ]
  return (
    <>
      {corners.map((corner) => (
        <svg
          key={corner}
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 18 18"
          className={`pointer-events-none absolute text-ink ${corner}`}
        >
          <path d="M9 0v18M0 9h18" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      ))}
    </>
  )
}

/** A section's number and heading, with a hairline to the end of the line. */
export function SectionHead({ number, id, title }: { number: number; id: string; title: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <span
        dir="ltr"
        className="grid h-[22px] min-w-[22px] shrink-0 place-items-center rounded-full bg-indigo px-1.5 text-[11px] leading-none font-bold text-white tabular-nums"
      >
        {String(number).padStart(2, '0')}
      </span>
      <h2 id={id} className="m-0 text-xl font-semibold">
        {title}
      </h2>
      <span aria-hidden="true" className="h-px grow bg-line" />
    </div>
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
