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
  type Headline as HeadlineKind,
} from '../report-model'
import { SeverityCount } from './ui'

/** The ring's circle: r = 52 in a 120-unit box, so 2 * pi * 52 round (ring-draw's keyframes). */
const CIRCUMFERENCE = 326.73

/** The number's colour by the band of its score, as a category's number has it. */
const VALUE: Readonly<Record<Band, string>> = {
  good: 'text-ink',
  mid: 'text-moderate',
  low: 'text-critical-ink',
}

/**
 * The score as a ring that fills, and the number in it, solid (a gradient on a number belongs to
 * the home page alone), with "out of 100" under it. The stroke follows the bands of the category
 * bars, the cut-offs Lighthouse draws, 90 and 50: the brand's gradient, then amber to orange, then
 * the critical red. 88 px on a phone, where it sits beside the severities, and 96 px from lg, in
 * the aside. The caption is under the ring, not in it: "out of 100" does not fit inside 88 px.
 */
function ScoreRing({ score, lang }: { score: number | null; lang: Lang }) {
  const band = score === null ? null : bandOf(score)
  const dash = score === null ? 0 : (score / 100) * CIRCUMFERENCE
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative size-22 lg:size-24">
        <svg viewBox="0 0 120 120" aria-hidden="true" className="block size-full -rotate-90">
          <defs>
            <linearGradient id="report-ring-good" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#007d88" />
              <stop offset="1" stop-color="#4f46e5" />
            </linearGradient>
            <linearGradient id="report-ring-mid" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#d97706" />
              <stop offset="1" stop-color="#c2410c" />
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
          {band !== null && (
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={
                band === 'good'
                  ? 'url(#report-ring-good)'
                  : band === 'mid'
                    ? 'url(#report-ring-mid)'
                    : '#e11d48'
              }
              stroke-width="11"
              stroke-linecap="round"
              stroke-dasharray={`${dash.toFixed(2)} ${CIRCUMFERENCE}`}
              className="ring-draw forced-colors:stroke-[Highlight]"
            />
          )}
        </svg>
        {/* The number is the graphic's, sized to the ring: "100" must clear its stroke. */}
        <span
          dir="ltr"
          className={`absolute inset-0 grid place-items-center text-[1.75rem] leading-none font-semibold tabular-nums lg:text-[2rem] ${
            band === null ? 'text-ink-2' : VALUE[band]
          }`}
        >
          {score ?? '—'}
        </span>
      </div>
      {score !== null && (
        <span className="text-meta text-ink-2">{REPORT[lang].thread.summary.outOf}</span>
      )}
    </div>
  )
}

function headlineText(headline: HeadlineKind, lang: Lang): string {
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

/**
 * The page's heading (M2.6 R7): what the rules found, counted, in the page's heading size. It
 * heads the page, above the summary, so that the summary under it can be a ring beside the
 * severities.
 */
export function Headline({ report, lang }: { report: Report; lang: Lang }) {
  return (
    <h1 id="summary-title" className="heading-1 m-0">
      {headlineText(headlineOf(report), lang)}
    </h1>
  )
}

const SEVERITIES: readonly Severity[] = ['critical', 'serious', 'moderate', 'minor', 'info']

/**
 * The summary (M2.6 R7): the score as a ring beside the severities of the rules that failed and a
 * line on how many checks passed and did not apply, and the way to the methodology. A tool's
 * result has no score: its rules alone cannot make one, so it has no ring.
 */
export function Summary({ report, lang, tool }: { report: Report; lang: Lang; tool: boolean }) {
  const t = REPORT[lang].thread.summary
  const counts = summaryCounts(report)
  const { overall, rules, partial } = report.score
  const sentence = t.checks(report.summary.pass, report.summary.notApplicable)
  const shown = SEVERITIES.filter((severity) => counts.bySeverity[severity] > 0)
  const caption =
    !tool && overall !== null && (rules.ran < rules.total || partial)
      ? STRINGS[lang].report.score(overall, partial, rules.ran, rules.total)
      : ''
  return (
    <section aria-labelledby="summary-title" className="card flex flex-col gap-3 p-card">
      <div className="flex items-center gap-4">
        {!tool && <ScoreRing score={overall} lang={lang} />}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {(shown.length > 0 || counts.review > 0) && (
            <div className="flex flex-wrap gap-2">
              {shown.map((severity) => (
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
          )}
          {sentence !== '' && <p className="m-0 text-small text-ink-2">{sentence}</p>}
        </div>
      </div>
      {caption !== '' && <p className="m-0 text-meta text-ink-2">{caption}</p>}
      {!tool && (
        <a
          href={methodologyHref(lang)}
          className="self-start text-small text-brand-ink underline underline-offset-4 hover:text-ink"
        >
          {REPORT[lang].score.methodology}
        </a>
      )}
    </section>
  )
}

/** A bar's class by the band of its score (global.css, bar-good, bar-mid, bar-low). */
const BAR: Readonly<Record<Band, string>> = {
  good: 'bar-good',
  mid: 'bar-mid',
  low: 'bar-low',
}

/**
 * The categories: a bar for each that scored under 100, lowest first, then one line naming those
 * at 100 and one naming those no rule of applied. `id` is its heading's: the report draws them
 * twice, once for each place they go (ReportView), and an id is one in a page. The bar's width is
 * the one thing the island sets from script, once it has run (a style set on the element, which
 * the page's policy allows; the shell the server sends has none).
 */
export function Categories({ report, lang, id }: { report: Report; lang: Lang; id: string }) {
  const t = REPORT[lang]
  const rows = categoryRows(report.score.categories)
  if (rows.low.length + rows.full.length + rows.none.length === 0) return null
  // A list in the language's own punctuation: Arabic joins with its comma, English with its.
  const list = (items: readonly CategoryName[]) =>
    items.map((name) => t.categories[name]).join(lang === 'ar' ? '، ' : ', ')
  return (
    <section aria-labelledby={id} className="card flex flex-col gap-3 p-card">
      <h2 id={id} className="heading-3 m-0">
        {t.thread.categories.title}
      </h2>
      {rows.low.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.low.map(({ category, value }) => {
            const band = bandOf(value)
            return (
              <li
                key={category}
                className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_2rem] items-center gap-3 text-small"
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
        <p className="m-0 flex items-start gap-2 text-small text-ink-2">
          <Check aria-hidden="true" size={16} className="mt-1 shrink-0 text-pass" />
          <span>
            {t.thread.categories.full}: {list(rows.full)}.
          </span>
        </p>
      )}
      {rows.none.length > 0 && (
        <p className="m-0 text-small text-ink-2">
          {t.score.none}: {list(rows.none)}.
        </p>
      )}
    </section>
  )
}
