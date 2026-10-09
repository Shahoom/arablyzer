import type { HistoryMarker, HistoryPoint, SiteHistory } from '@arablyzer/api-contract/codes'

// The geometry of a site's score chart (M4.6): pure, so it is tested without a browser. The page
// draws what this returns as an inline SVG; nothing here touches a style attribute (CSP) or a
// library. Time runs along the reading direction: the oldest scan at the start edge, which is the
// right in Arabic. The value labels sit at the start edge too.

export const CHART = { width: 560, height: 240, start: 38, end: 14, top: 14, bottom: 30 } as const

const plotWidth = CHART.width - CHART.start - CHART.end
const plotHeight = CHART.height - CHART.top - CHART.bottom
const round = (n: number): number => Math.round(n * 10) / 10

export interface Plot {
  readonly rtl: boolean
  /** The x of a time in the plot, in the chart's own units. */
  readonly x: (time: number) => number
  /** The y of a score, 0 at the bottom and 100 at the top. */
  readonly y: (score: number) => number
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

export function plotOf(times: readonly number[], rtl: boolean): Plot {
  const first = Math.min(...times)
  const last = Math.max(...times)
  const span = last - first
  const left = rtl ? CHART.end : CHART.start
  const right = left + plotWidth
  return {
    rtl,
    left,
    right,
    top: CHART.top,
    bottom: CHART.top + plotHeight,
    x: (time) => {
      const fraction = span === 0 ? 0.5 : (time - first) / span
      return round(rtl ? right - fraction * plotWidth : left + fraction * plotWidth)
    },
    y: (score) => round(CHART.top + (1 - Math.min(100, Math.max(0, score)) / 100) * plotHeight),
  }
}

export const Y_TICKS = [0, 25, 50, 75, 100] as const

export interface DateTick {
  readonly time: number
  readonly x: number
  readonly anchor: 'start' | 'middle' | 'end'
}

/** The first, the middle and the last time of the window the points cover (one tick for one point). */
export function dateTicks(times: readonly number[], plot: Plot): DateTick[] {
  const first = Math.min(...times)
  const last = Math.max(...times)
  if (first === last) return [{ time: first, x: plot.x(first), anchor: 'middle' }]
  const middle = Math.round((first + last) / 2)
  // The ends are anchored inward so the label stays inside the chart in either direction.
  return [
    { time: first, x: plot.x(first), anchor: plot.rtl ? 'end' : 'start' },
    { time: middle, x: plot.x(middle), anchor: 'middle' },
    { time: last, x: plot.x(last), anchor: plot.rtl ? 'start' : 'end' },
  ]
}

export interface Dot {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly score: number
}

export interface Line {
  readonly key: string
  /** One path per run of scans that have a score; a scan without one breaks the line. */
  readonly paths: readonly string[]
  readonly dots: readonly Dot[]
}

/** `key` is 'overall' or a category. */
export function lineOf(points: readonly HistoryPoint[], key: string, plot: Plot): Line {
  const paths: string[] = []
  const dots: Dot[] = []
  let run: string[] = []
  const flush = () => {
    if (run.length > 0) paths.push(run.join(' '))
    run = []
  }
  for (const point of points) {
    const score = key === 'overall' ? point.overall : (point.categories[key] ?? null)
    if (score === null) {
      flush()
      continue
    }
    const x = plot.x(Date.parse(point.at))
    const y = plot.y(score)
    run.push(`${run.length === 0 ? 'M' : 'L'}${String(x)} ${String(y)}`)
    dots.push({ id: point.scanId, x, y, score })
  }
  flush()
  return { key, paths, dots }
}

export interface Mark {
  readonly id: string
  readonly kind: HistoryMarker['kind']
  readonly x: number
  /** The shape's outline: a triangle for a drop, a diamond for a critical, a square for down. */
  readonly d: string
}

/** Marks at the scan they belong to: above its overall score, or at the foot of the chart for a scan with none. */
export function marksOf(
  markers: readonly HistoryMarker[],
  points: readonly HistoryPoint[],
  plot: Plot,
): Mark[] {
  const byId = new Map(points.map((point) => [point.scanId, point]))
  const marks: Mark[] = []
  for (const marker of markers) {
    const point = byId.get(marker.scanId)
    if (point === undefined) continue
    const x = plot.x(Date.parse(point.at))
    const y =
      point.overall === null ? plot.bottom - 10 : Math.max(plot.top + 12, plot.y(point.overall) - 4)
    const d =
      marker.kind === 'score-drop'
        ? `M${String(x - 6)} ${String(y - 12)}L${String(x + 6)} ${String(y - 12)}L${String(x)} ${String(y)}Z`
        : marker.kind === 'critical'
          ? `M${String(x)} ${String(y - 13)}L${String(x + 6)} ${String(y - 7)}L${String(x)} ${String(y - 1)}L${String(x - 6)} ${String(y - 7)}Z`
          : `M${String(x - 5)} ${String(y - 10)}h10v10h-10Z`
    marks.push({ id: marker.scanId + marker.kind, kind: marker.kind, x, d })
  }
  return marks
}

/** The categories with a score somewhere in the window, in the order the report lists them. */
export function categoriesIn(history: SiteHistory, order: readonly string[]): string[] {
  const present = new Set<string>()
  for (const point of history.points) {
    for (const [category, score] of Object.entries(point.categories)) {
      if (score !== null) present.add(category)
    }
  }
  return order.filter((category) => present.has(category))
}

/** The markers of a scan, for a table cell and a label. */
export function markersByScan(markers: readonly HistoryMarker[]): Map<string, HistoryMarker[]> {
  const grouped = new Map<string, HistoryMarker[]>()
  for (const marker of markers) {
    grouped.set(marker.scanId, [...(grouped.get(marker.scanId) ?? []), marker])
  }
  return grouped
}
