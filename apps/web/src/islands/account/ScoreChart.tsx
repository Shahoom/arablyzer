import type { SiteHistory } from '@arablyzer/api-contract/codes'
import { COMPARE_UI } from '@arablyzer/i18n/compare'
import type { Lang } from '@arablyzer/seo/site'
import { CHART, dateTicks, lineOf, marksOf, plotOf, Y_TICKS, type Line } from '../chart-model'
import { shortDay } from '../compare-model'

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

/**
 * A site's scores as an SVG drawn here (M4.6): no library, no style attribute. It is labelled with
 * a title and a text summary; its numbers are the table under it. Time runs in the reading
 * direction (the oldest at the right in Arabic), and the figure itself is laid out left to right
 * so its text anchors mean what they say.
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
  return (
    <svg
      role="img"
      aria-labelledby={`${id}-title ${id}-desc`}
      viewBox={`0 0 ${String(CHART.width)} ${String(CHART.height)}`}
      direction="ltr"
      className="h-auto w-full max-w-full"
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
    </svg>
  )
}
