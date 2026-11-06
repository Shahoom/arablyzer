import type { SiteHistory } from '@arablyzer/api-contract/codes'
import { APP_UI } from '@arablyzer/i18n/app'
import { COMPARE_UI } from '@arablyzer/i18n/compare'
import type { Lang } from '@arablyzer/seo/site'
import { useRef, useState } from 'preact/hooks'
import {
  CHART,
  dateTicks,
  lineOf,
  markersByScan,
  marksOf,
  plotOf,
  Y_TICKS,
  type Line,
} from '../chart-model'
import { shortDay } from '../compare-model'
import { nearestIndex } from '../app/app-model'

/** The colours of the category lines, from the site's own tokens; written out so Tailwind sees each. */
export const LINE_COLORS = [
  { stroke: 'stroke-indigo', swatch: 'bg-indigo' },
  { stroke: 'stroke-cat-schema', swatch: 'bg-cat-schema' },
  { stroke: 'stroke-serious', swatch: 'bg-serious' },
  { stroke: 'stroke-cat-forms', swatch: 'bg-cat-forms' },
  { stroke: 'stroke-cat-fonts', swatch: 'bg-cat-fonts' },
  { stroke: 'stroke-pass', swatch: 'bg-pass' },
  { stroke: 'stroke-violet', swatch: 'bg-violet' },
  { stroke: 'stroke-blue', swatch: 'bg-blue' },
] as const
/** A line is told by its dashes as well as its colour. */
export const LINE_DASHES = ['6 4', '2 3', '9 3 2 3', '1 4', '12 4'] as const

/** The colour and dashes of the n-th category, so a category keeps its look whichever are on. */
export function lineStyle(index: number): { stroke: string; swatch: string; dash: string } {
  const color = LINE_COLORS[index % LINE_COLORS.length] ?? LINE_COLORS[0]
  return { ...color, dash: LINE_DASHES[index % LINE_DASHES.length] ?? LINE_DASHES[0] }
}

const MARK_FILL = {
  'score-drop': 'fill-critical',
  critical: 'fill-serious',
  down: 'fill-ink',
} as const

interface Props {
  lang: Lang
  history: SiteHistory
  /** The categories drawn besides the overall score, with the index each keeps in the report's order. */
  extra: readonly { readonly key: string; readonly index: number }[]
  /** The id the chart's title and description take, unique on the page. */
  id: string
  summary: string
}

/** The tooltip's box, in the chart's own units. */
const TIP = { width: 176, height: 46 } as const

/**
 * A site's scores as an SVG drawn here (M4.6): no library, no style attribute. It is labelled with
 * a title and a text summary; its numbers are the table under it. Time runs in the reading
 * direction (the oldest at the right in Arabic), and the figure itself is laid out left to right
 * so its text anchors mean what they say.
 *
 * It answers the pointer (M4.9): a cursor and a readout of the nearest scan follow it, and, with the
 * chart in focus, the arrow keys move them (Home and End go to the ends, Escape lets go). The
 * readout is also said, politely, to a screen reader. The table under the chart stays the way to read
 * every number.
 */
export default function ScoreChart({ lang, history, extra, id, summary }: Props) {
  const t = COMPARE_UI[lang].history
  const times = history.points.map((point) => Date.parse(point.at))
  const plot = plotOf(times, lang === 'ar')
  const lines: { line: Line; style: ReturnType<typeof lineStyle> | null }[] = [
    { line: lineOf(history.points, 'overall', plot), style: null },
    ...extra.map(({ key, index }) => ({
      line: lineOf(history.points, key, plot),
      style: lineStyle(index),
    })),
  ]
  const labelX = plot.rtl ? plot.right + 6 : plot.left - 6

  // The scans with a score, in the order they sit on the page from its left edge to its right.
  const scored = lines[0]?.line.dots ?? []
  const ordered = [...scored].sort((a, b) => a.x - b.x)
  const marks = markersByScan(history.markers)
  const svg = useRef<SVGSVGElement>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const at = ordered.find((dot) => dot.id === cursor) ?? null
  const point = at === null ? null : history.points.find((p) => p.scanId === at.id)
  const live = APP_UI[lang].site.chart
  const readout =
    at === null || point === undefined || point === null
      ? ''
      : live.readout(shortDay(Date.parse(point.at), lang), String(at.score))

  const move = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect()
    if (box === undefined || box.width === 0) return
    const x = ((clientX - box.left) / box.width) * CHART.width
    const index = nearestIndex(
      ordered.map((dot) => dot.x),
      x,
    )
    setCursor(ordered[index]?.id ?? null)
  }
  const step = (by: number | 'first' | 'last') => {
    if (ordered.length === 0) return
    const current = ordered.findIndex((dot) => dot.id === cursor)
    const next =
      by === 'first'
        ? 0
        : by === 'last'
          ? ordered.length - 1
          : Math.min(
              ordered.length - 1,
              Math.max(0, (current < 0 ? ordered.length - 1 : current) + by),
            )
    setCursor(ordered[next]?.id ?? null)
  }
  const tipX =
    at === null ? 0 : at.x + 12 + TIP.width > CHART.width - 4 ? at.x - 12 - TIP.width : at.x + 12
  const tipY =
    at === null
      ? 0
      : Math.min(plot.bottom - TIP.height - 4, Math.max(plot.top, at.y - TIP.height - 10))
  const alert = at === null ? undefined : marks.get(at.id)?.[0]
  return (
    <div className="relative">
      <svg
        ref={svg}
        role="img"
        tabIndex={ordered.length > 0 ? 0 : undefined}
        aria-labelledby={`${id}-title ${id}-desc`}
        aria-describedby={`${id}-hint`}
        viewBox={`0 0 ${String(CHART.width)} ${String(CHART.height)}`}
        direction="ltr"
        className="app-chart max-w-full"
        onPointerMove={(event) => {
          move(event.clientX)
        }}
        onPointerDown={(event) => {
          move(event.clientX)
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setCursor(null)
        }}
        onFocus={() => {
          if (cursor === null) step('last')
        }}
        onBlur={() => {
          setCursor(null)
        }}
        onKeyDown={(event) => {
          // The keys mean left and right on the page, as the figure is laid out left to right.
          const keys: Record<string, () => void> = {
            ArrowLeft: () => {
              step(-1)
            },
            ArrowRight: () => {
              step(1)
            },
            Home: () => {
              step('first')
            },
            End: () => {
              step('last')
            },
            Escape: () => {
              setCursor(null)
            },
          }
          const run = keys[event.key]
          if (run !== undefined) {
            event.preventDefault()
            run()
          }
        }}
      >
        <title id={`${id}-title`}>{t.chartLabel(history.url)}</title>
        <desc id={`${id}-desc`}>{summary}</desc>
        <g aria-hidden="true">
          {Y_TICKS.map((tick) => (
            <g key={tick}>
              <line
                x1={plot.left}
                x2={plot.right}
                y1={plot.y(tick)}
                y2={plot.y(tick)}
                className="stroke-line"
                stroke-width="1"
              />
              <text
                x={labelX}
                y={plot.y(tick) + 4}
                text-anchor={plot.rtl ? 'start' : 'end'}
                className="fill-ink-3 text-meta tabular-nums"
              >
                {tick}
              </text>
            </g>
          ))}
          {dateTicks(times, plot).map((tick) => (
            <text
              key={tick.time}
              x={tick.x}
              y={CHART.height - 8}
              text-anchor={tick.anchor}
              className="fill-ink-3 text-meta"
            >
              {shortDay(tick.time, lang)}
            </text>
          ))}
          {lines.map(({ line, style }) => (
            <g key={line.key}>
              {line.paths.map((d) => (
                <path
                  key={d}
                  d={d}
                  fill="none"
                  stroke-width={style === null ? '3' : '2'}
                  stroke-linejoin="round"
                  stroke-linecap="round"
                  {...(style === null ? {} : { 'stroke-dasharray': style.dash })}
                  className={style === null ? 'stroke-brand' : style.stroke}
                />
              ))}
              {line.dots.map((dot) => (
                <circle
                  key={dot.id}
                  cx={dot.x}
                  cy={dot.y}
                  r={style === null ? 4 : 3}
                  className={`stroke-surface ${style === null ? 'fill-brand' : 'fill-surface'} ${style === null ? '' : style.stroke}`}
                  stroke-width="1.5"
                />
              ))}
            </g>
          ))}
          {marksOf(history.markers, history.points, plot).map((mark) => (
            <path
              key={mark.id}
              d={mark.d}
              className={`${MARK_FILL[mark.kind]} stroke-surface`}
              stroke-width="1"
            />
          ))}
        </g>
        {at !== null && point !== undefined && point !== null && (
          <g aria-hidden="true" pointer-events="none">
            <line
              x1={at.x}
              x2={at.x}
              y1={plot.top}
              y2={plot.bottom}
              stroke-width="1"
              stroke-dasharray="4 4"
              className="stroke-brand"
            />
            <circle
              cx={at.x}
              cy={at.y}
              r="6"
              stroke-width="3"
              className="fill-brand stroke-surface"
            />
            <g transform={`translate(${String(tipX)} ${String(tipY)})`}>
              <rect
                width={TIP.width}
                height={TIP.height + (alert === undefined ? 0 : 16)}
                rx="8"
                stroke-width="1"
                className="fill-surface stroke-line-2"
              />
              <text x="10" y="18" className="fill-ink-3 text-meta">
                {shortDay(Date.parse(point.at), lang)}
              </text>
              <text x="10" y="37" className="fill-ink text-body font-semibold tabular-nums">
                {String(at.score)}
              </text>
              {alert !== undefined && (
                <text x="10" y="55" className="fill-critical-ink text-meta">
                  {`${alert.kind === 'score-drop' ? '\u25BC' : alert.kind === 'critical' ? '\u25C6' : '\u25A0'} ${t.markerKinds[alert.kind]}`}
                </text>
              )}
            </g>
          </g>
        )}
      </svg>
      <p id={`${id}-hint`} className="sr-only">
        {live.hint}
      </p>
      <p className="sr-only" aria-live="polite">
        {readout}
      </p>
    </div>
  )
}
