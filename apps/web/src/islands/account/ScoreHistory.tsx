import type { HistoryMarker, SiteHistory } from '@arablyzer/api-contract/codes'
import { COMPARE_UI } from '@arablyzer/i18n/compare'
import { CATEGORIES, REPORT } from '@arablyzer/i18n/report'
import type { Lang } from '@arablyzer/seo/site'
import { ChartLine } from 'lucide-preact'
import { useId, useState } from 'preact/hooks'
import { categoriesIn, markersByScan } from '../chart-model'
import { getSiteHistory } from '../compare-api'
import { shortDay } from '../compare-model'
import { dayLabel, reportHref } from '../sites-model'
import ScoreChart, { lineStyle } from './ScoreChart'

interface Props {
  lang: Lang
  siteId: string
}

const MARKER_KINDS = [
  { kind: 'score-drop', symbol: '\u25BC' },
  { kind: 'critical', symbol: '\u25C6' },
  { kind: 'down', symbol: '\u25A0' },
] as const

type State = 'closed' | 'loading' | 'failed' | { readonly history: SiteHistory }

/**
 * One saved site's score history (M4.6): a chart of the overall score, lines for the categories
 * the person turns on, marks where monitoring would alert, and the same numbers as a table. It
 * asks for the history when it is first opened.
 */
export default function ScoreHistory({ lang, siteId }: Props) {
  const t = COMPARE_UI[lang].history
  const names = REPORT[lang].categories
  const uid = useId()
  const [state, setState] = useState<State>('closed')
  const [categories, setCategories] = useState<readonly string[]>([])
  const [table, setTable] = useState(false)
  const open = state !== 'closed'

  async function toggle() {
    if (open) {
      setState('closed')
      return
    }
    setState('loading')
    const loaded = await getSiteHistory(siteId)
    setState(loaded.ok ? { history: loaded.value } : 'failed')
  }

  const panel = `${uid}-panel`
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <button
        type="button"
        className="btn-white self-start"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => void toggle()}
      >
        <ChartLine aria-hidden="true" size={16} />
        {open ? t.hide : t.show}
      </button>
      <div id={panel} hidden={!open} className="flex flex-col gap-4">
        {state === 'loading' && (
          <p role="status" className="m-0 text-small text-ink-2">
            {t.loading}
          </p>
        )}
        {state === 'failed' && (
          <p role="alert" className="m-0 text-small text-ink-2">
            {t.failed}
          </p>
        )}
        {typeof state !== 'string' && (
          <Loaded
            lang={lang}
            history={state.history}
            names={names}
            id={uid}
            categories={categories}
            onCategories={setCategories}
            table={table}
            onTable={setTable}
          />
        )}
      </div>
    </div>
  )
}

interface LoadedProps {
  lang: Lang
  history: SiteHistory
  names: Readonly<Record<string, string>>
  id: string
  categories: readonly string[]
  onCategories: (next: readonly string[]) => void
  table: boolean
  onTable: (next: boolean) => void
}

function Loaded({
  lang,
  history,
  names,
  id,
  categories,
  onCategories,
  table,
  onTable,
}: LoadedProps) {
  const t = COMPARE_UI[lang].history
  if (history.points.length === 0) {
    return <p className="m-0 text-body text-ink-2">{t.empty}</p>
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
    <>
      <div className="flex flex-col gap-1">
        <h3 className="heading-3 m-0">{t.title}</h3>
        <p className="m-0 text-small text-ink-2">{t.lead(history.days)}</p>
      </div>
      <ScoreChart
        lang={lang}
        history={history}
        id={`${id}-chart`}
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
                  onCategories(on ? chosen.filter((c) => c !== category) : [...chosen, category])
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
                .join(' · ')}
            </p>
          )}
          <p className="m-0">{t.alertsNote}</p>
        </div>
      )}
      <button
        type="button"
        className="btn-ghost self-start"
        aria-expanded={table}
        aria-controls={`${id}-table`}
        onClick={() => {
          onTable(!table)
        }}
      >
        {table ? t.table.hide : t.table.show}
      </button>
      <div
        id={`${id}-table`}
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
                    {(marked.get(point.scanId) ?? []).map(markerText).join(' · ')}
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
    </>
  )
}
