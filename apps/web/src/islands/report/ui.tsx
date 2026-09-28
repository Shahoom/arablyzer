import type { Severity } from '@arablyzer/report-schema'
import { STRINGS } from '@arablyzer/seo/strings'
import type { Lang } from '@arablyzer/seo/site'

const SEVERITY_STYLE: Readonly<Record<Severity, string>> = {
  critical: 'bg-critical text-white border-critical',
  serious: 'bg-signal text-white border-signal',
  moderate: 'bg-moderate-soft text-moderate border-moderate-line',
  minor: 'bg-white text-ink-2 border-tick',
  info: 'bg-measure-soft text-measure border-measure-soft',
}

/** A severity in the report's own words, as on the home page. */
export function SeverityPill({ severity, lang }: { severity: Severity; lang: Lang }) {
  return (
    <span
      className={`border px-2 py-px text-xs font-semibold whitespace-nowrap ${SEVERITY_STYLE[severity]}`}
    >
      {STRINGS[lang].report.severity[severity]}
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

/** A section's number and heading, with a ruler to the end of the line. */
export function SectionHead({ number, id, title }: { number: number; id: string; title: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <span dir="ltr" className="font-mono text-xs tracking-[0.06em] text-signal">
        § {String(number).padStart(2, '0')}
      </span>
      <h2 id={id} className="m-0 text-xl font-bold">
        {title}
      </h2>
      <span aria-hidden="true" className="bg-ruler h-[7px] grow" />
    </div>
  )
}

export const ENGINE_LABEL = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' } as const
