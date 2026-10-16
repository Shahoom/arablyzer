import type { HistoryMarker, SiteHistory } from '@arablyzer/api-contract/codes'
import { APP_UI } from '@arablyzer/i18n/app'
import { COMPARE_UI } from '@arablyzer/i18n/compare'
import { CATEGORIES, REPORT } from '@arablyzer/i18n/report'
import type { Lang } from '@arablyzer/seo/site'
import { useId, useState } from 'preact/hooks'
import ScoreChart, { lineStyle } from '../account/ScoreChart'
import { categoriesIn, markersByScan } from '../chart-model'
import { shortDay } from '../compare-model'
import { dayLabel, reportHref } from '../sites-model'

const MARKER_KINDS = [
  { kind: 'score-drop', symbol: '▼' },
  { kind: 'critical', symbol: '◆' },
  { kind: 'down', symbol: '■' },
] as const

/**
 * A site's score over time (M4.6, in the dashboard of M4.9): the chart that answers the pointer, lines
 * for the categories the person turns on, the marks where monitoring would have alerted, and the same
 * numbers as a table. The history is read by the page; this draws it.
 */
export default function HistoryPanel({ lang, history }: { lang: Lang; history: SiteHistory }) {
  const t = COMPARE_UI[lang].history
  const a = APP_UI[lang].site.chart
  const names: Readonly<Record<string, string>> = REPORT[lang].categories
  const uid = useId()
  const [categories, setCategories] = useState<readonly string[]>([])
  const [table, setTable] = useState(false)

  if (history.points.length === 0) {
    return <p className="m-0 p-5 text-body text-ink-2">{a.empty}</p>
  }
  const available = categoriesIn(history, CATEGORIES)
  const chosen = categories.filter((category) => available.includes(category))
  const scored = history.points.filter((point) => point.overall !== null)
  const firstScore = scored[0]
  const lastScore = scored[scored.length - 1]
  const first = history.points[0]
  const last = history.points[history.points.length - 1]
  const summary =
    firstScore === undefined || lastScore === undefined || first === undefined || last === undefined
      ? t.unreached
      : scored.length === 1
        ? t.summaryOne(lastScore.overall ?? 0, dayLabel(lastScore.at, lang))
        : `${t.summaryMany(history.points.length, firstScore.overall ?? 0, lastScore.overall ?? 0)} ${t.period(dayLabel(first.at, lang), dayLabel(last.at, lang))}`
  const marked = markersByScan(history.markers)
  const markerText = (marker: HistoryMarker): string =>
    marker.kind === 'score-drop'
      ? t.markers['score-drop'](marker.from ?? 0, marker.to ?? 0)
      : marker.kind === 'critical'
        ? t.markers.critical(marker.count ?? 0)
        : t.markers.down

  return (
    <div className="flex flex-col gap-4 p-5 pt-3">
      <ScoreChart
        lang={lang}
        history={history}
        id={`${uid}-chart`}
        summary={summary}
        extra={chosen.map((key) => ({ key, index: CATEGORIES.indexOf(key as never) }))}
      />
      <p className="m-0 text-small text-ink-2">{summary}</p>
      {available.length > 0 && (
        <div role="group" aria-label={t.linesTitle} className="flex flex-wrap gap-2">
          <span className="chip" aria-hidden="true">
            <span className="size-3 shrink-0 rounded-full bg-brand" />
            {t.overall}
          </span>
          {available.map((category) => {
            const index = CATEGORIES.indexOf(category as never)
            const style = lineStyle(index)
            const on = chosen.includes(category)
            return (
              <button
                key={category}
                type="button"
                aria-pressed={on}
                className="chip min-h-11"
                onClick={() => {
                  setCategories(on ? chosen.filter((c) => c !== category) : [...chosen, category])
                }}
              >
                <span
                  className={`size-3 shrink-0 rounded-full ${style.swatch}`}
                  aria-hidden="true"
                />
                {names[category] ?? category}
              </button>
            )
          })}
        </div>
      )}
      {history.alerts && (
        <div className="flex flex-col gap-1 text-meta text-ink-2">
          {history.markers.length === 0 ? (
            <p className="m-0">{t.noAlerts}</p>
          ) : (
            <p className="m-0">
              {t.markerLegend}:{' '}
              {MARKER_KINDS.filter((kind) => history.markers.some((m) => m.kind === kind.kind))
                .map((kind) => `${kind.symbol} ${t.markerKinds[kind.kind]}`)
                .join(lang === 'ar' ? '، ' : ', ')}
            </p>
          )}
          <p className="m-0">{t.alertsNote}</p>
        </div>
      )}
      <button
        type="button"
        className="btn-ghost self-start"
        aria-expanded={table}
        aria-controls={`${uid}-table`}
        onClick={() => {
          setTable(!table)
        }}
      >
        {table ? t.table.hide : t.table.show}
      </button>
      <div
        id={`${uid}-table`}
        hidden={!table}
        role="region"
        aria-label={t.table.caption}
        tabIndex={0}
        className="overflow-x-auto"
      >
        <table className="w-full border-collapse text-start text-small">
          <caption className="sr-only">{t.table.caption}</caption>
          <thead>
            <tr className="text-start text-meta text-ink-2">
              <th scope="col" className="py-2 pe-3 text-start font-semibold">
                {t.table.date}
              </th>
              <th scope="col" className="py-2 pe-3 text-start font-semibold">
                {t.table.source}
              </th>
              <th scope="col" className="py-2 pe-3 text-start font-semibold">
                {t.overall}
              </th>
              {chosen.map((category) => (
                <th key={category} scope="col" className="py-2 pe-3 text-start font-semibold">
                  {names[category] ?? category}
                </th>
              ))}
              {history.alerts && (
                <th scope="col" className="py-2 pe-3 text-start font-semibold">
                  {t.table.alert}
                </th>
              )}
              <th scope="col" className="py-2 text-start font-semibold">
                <span className="sr-only">{t.openReport}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[...history.points].reverse().map((point) => (
              <tr key={point.scanId} className="border-t border-line">
                <td className="py-2 pe-3">
                  <time dateTime={point.at}>{shortDay(Date.parse(point.at), lang)}</time>
                </td>
                <td className="py-2 pe-3">{t.source[point.source]}</td>
                <td className="py-2 pe-3 tabular-nums" dir="ltr">
                  {point.overall ?? '–'}
                </td>
                {chosen.map((category) => (
                  <td key={category} className="py-2 pe-3 tabular-nums" dir="ltr">
                    {point.categories[category] ?? '–'}
                  </td>
                ))}
                {history.alerts && (
                  <td className="py-2 pe-3">
                    {(marked.get(point.scanId) ?? [])
                      .map(markerText)
                      .join(lang === 'ar' ? '، ' : ', ')}
                  </td>
                )}
                <td className="py-2">
                  <a
                    className="inline-flex min-h-11 items-center font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                    href={reportHref(lang, point.scanId)}
                  >
                    {t.openReport}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
