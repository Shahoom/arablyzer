import { REPORT, type CategoryName } from '@arablyzer/i18n/report'
import type { Report, Severity } from '@arablyzer/report-schema'
import { STRINGS } from '@arablyzer/seo/strings'
import type { Lang } from '@arablyzer/seo/site'
import { Check } from 'lucide-preact'
import { methodologyHref } from '../../lib/site'
import {
  bandOf,
  categoryRows,
  headlineOf,
  summaryCounts,
  type Band,
  type Headline,
} from '../report-model'
import { SeverityCount } from './ui'

/** The ring's circle: r = 52 in a 120-unit box, so 2 * pi * 52 round (ring-draw's keyframes). */
const CIRCUMFERENCE = 326.73

/** The score as a ring that fills with the brand's gradient, and the number in it. */
function ScoreRing({ score, lang }: { score: number | null; lang: Lang }) {
  const dash = score === null ? 0 : (score / 100) * CIRCUMFERENCE
  return (
    <div className="relative size-[148px] shrink-0 self-center sm:self-auto">
      <svg viewBox="0 0 120 120" aria-hidden="true" className="block size-full -rotate-90">
        <defs>
          <linearGradient id="report-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="[stop-color:var(--color-brand)]" />
            <stop offset="1" className="[stop-color:var(--color-indigo)]" />
          </linearGradient>
        </defs>
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke-width="11"
          className="stroke-surface-2 forced-colors:stroke-[GrayText]"
        />
        {score !== null && (
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="url(#report-ring)"
            stroke-width="11"
            stroke-linecap="round"
            stroke-dasharray={`${dash.toFixed(2)} ${CIRCUMFERENCE}`}
            className="ring-draw forced-colors:stroke-[Highlight]"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          dir="ltr"
          className="gradient-text text-[46px] leading-[1.15] font-semibold tabular-nums"
        >
          {score ?? '—'}
        </span>
        {score !== null && (
          <span className="text-xs text-ink-3">{REPORT[lang].thread.summary.outOf}</span>
        )}
      </div>
    </div>
  )
}

function headlineText(headline: Headline, lang: Lang): string {
  const t = REPORT[lang].thread.summary
  switch (headline.kind) {
    case 'counts':
      return t.counts(headline.problems, headline.notes)
    case 'review':
      return t.review(headline.count)
    default:
      return t[headline.kind]
  }
}

const SEVERITIES: readonly Severity[] = ['critical', 'serious', 'moderate', 'minor', 'info']

/**
 * The summary (the approved Report design): the score as a ring, the headline that counts the
 * problems and notes, the severities of the rules that failed, and how many checks passed and did
 * not apply. A tool's result has no score: its rules alone cannot make one, so it has no ring.
 */
export function Summary({ report, lang, tool }: { report: Report; lang: Lang; tool: boolean }) {
  const t = REPORT[lang].thread.summary
  const counts = summaryCounts(report)
  const { overall, rules, partial } = report.score
  const sentence = t.checks(report.summary.pass, report.summary.notApplicable)
  return (
    <section
      aria-labelledby="summary-title"
      className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-7"
    >
      {!tool && <ScoreRing score={overall} lang={lang} />}
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <h1
          id="summary-title"
          className="m-0 text-[26px] leading-[1.5] font-semibold text-balance md:text-[30px]"
        >
          {headlineText(headlineOf(report), lang)}
        </h1>
        <div className="flex flex-wrap gap-2">
          {SEVERITIES.filter((severity) => counts.bySeverity[severity] > 0).map((severity) => (
            <SeverityCount
              key={severity}
              severity={severity}
              count={counts.bySeverity[severity]}
              lang={lang}
            />
          ))}
          {counts.review > 0 && (
            <span className="sev sev-minor">
              {REPORT[lang].findings.review}
              <span dir="ltr" className="tabular-nums">
                {counts.review}
              </span>
            </span>
          )}
        </div>
        {sentence !== '' && <p className="m-0 text-ink-2">{sentence}</p>}
        {!tool && overall !== null && (rules.ran < rules.total || partial) && (
          <p className="m-0 text-[13px] text-ink-3">
            {STRINGS[lang].report.score(overall, partial, rules.ran, rules.total)}
          </p>
        )}
        {!tool && (
          <a
            href={methodologyHref(lang)}
            className="self-start text-sm text-brand-ink underline underline-offset-4 hover:text-ink"
          >
            {REPORT[lang].score.methodology}
          </a>
        )}
      </div>
    </section>
  )
}

/** A bar's class by the band of its score (global.css, bar-good, bar-mid, bar-low). */
const BAR: Readonly<Record<Band, string>> = {
  good: 'bar-good',
  mid: 'bar-mid',
  low: 'bar-low',
}
const VALUE: Readonly<Record<Band, string>> = {
  good: 'text-ink',
  mid: 'text-moderate',
  low: 'text-critical-ink',
}

/**
 * The categories (the approved Report design): a bar for each that scored under 100, lowest
 * first, then one line naming those at 100 and one naming those no rule of applied.
 */
export function Categories({ report, lang }: { report: Report; lang: Lang }) {
  const t = REPORT[lang]
  const rows = categoryRows(report.score.categories)
  if (rows.low.length + rows.full.length + rows.none.length === 0) return null
  // A list in the language's own punctuation: Arabic joins with its comma, English with its.
  const list = (items: readonly CategoryName[]) =>
    items.map((name) => t.categories[name]).join(lang === 'ar' ? '، ' : ', ')
  return (
    <section aria-labelledby="categories-title" className="card flex flex-col gap-4 p-5 sm:p-6">
      <h2 id="categories-title" className="m-0 text-lg font-semibold">
        {t.thread.categories.title}
      </h2>
      {rows.low.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {rows.low.map(({ category, value }) => {
            const band = bandOf(value)
            return (
              <li
                key={category}
                className="grid grid-cols-[minmax(0,7.25rem)_minmax(0,1fr)_2rem] items-center gap-3 text-[15px] sm:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_2.25rem] sm:gap-4"
              >
                <span>{t.categories[category]}</span>
                <span
                  aria-hidden="true"
                  className="h-2 overflow-hidden rounded-full bg-surface-2 forced-colors:border forced-colors:border-[CanvasText]"
                >
                  <span
                    className={`bar-grow block h-full rounded-full ${BAR[band]}`}
                    // A score of 0 keeps a sliver, so the bar is seen to be there.
                    style={{ width: value === 0 ? '2%' : `${value}%` }}
                  />
                </span>
                <span dir="ltr" className={`text-end font-semibold tabular-nums ${VALUE[band]}`}>
                  {value}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {rows.full.length > 0 && (
        <p className="m-0 flex items-start gap-2 text-[15px] leading-[1.8] text-ink-2">
          <Check aria-hidden="true" size={18} className="mt-1.5 shrink-0 text-pass" />
          <span>
            {t.thread.categories.full}: {list(rows.full)}.
          </span>
        </p>
      )}
      {rows.none.length > 0 && (
        <p className="m-0 text-sm leading-[1.8] text-ink-3">
          {t.score.none}: {list(rows.none)}.
        </p>
      )}
    </section>
  )
}
