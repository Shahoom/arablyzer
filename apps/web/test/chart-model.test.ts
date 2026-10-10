import type { HistoryMarker, HistoryPoint, SiteHistory } from '@arablyzer/api-contract/codes'
import { describe, expect, it } from 'vitest'
import {
  categoriesIn,
  CHART,
  dateTicks,
  lineOf,
  marksOf,
  markersByScan,
  plotOf,
} from '../src/islands/chart-model'

const DAY = 86_400_000
const T0 = Date.parse('2026-10-01T00:00:00.000Z')
const at = (days: number) => new Date(T0 + days * DAY).toISOString()
const point = (
  id: string,
  days: number,
  overall: number | null,
  categories: Record<string, number | null> = {},
): HistoryPoint => ({
  scanId: id,
  at: at(days),
  source: 'manual',
  state: overall === null ? 'failed' : 'complete',
  overall,
  categories,
})
const times = [T0, T0 + 5 * DAY, T0 + 10 * DAY]

describe('the chart’s plot', () => {
  it('puts the oldest scan at the start edge: the left in English, the right in Arabic', () => {
    const ltr = plotOf(times, false)
    const rtl = plotOf(times, true)
    expect(ltr.x(T0)).toBe(ltr.left)
    expect(ltr.x(T0 + 10 * DAY)).toBe(ltr.right)
    expect(rtl.x(T0)).toBe(rtl.right)
    expect(rtl.x(T0 + 10 * DAY)).toBe(rtl.left)
    // The value labels take the start edge's margin, so the plot moves over to make room.
    expect(ltr.left).toBe(CHART.start)
    expect(rtl.left).toBe(CHART.end)
    expect(ltr.right - ltr.left).toBe(rtl.right - rtl.left)
    expect(ltr.right).toBeLessThanOrEqual(CHART.width - CHART.end)
    expect(rtl.right).toBeLessThanOrEqual(CHART.width - CHART.start)
  })

  it('maps 0 to the bottom and 100 to the top, and clamps what is outside', () => {
    const plot = plotOf(times, false)
    expect(plot.y(100)).toBe(plot.top)
    expect(plot.y(0)).toBe(plot.bottom)
    expect(plot.y(150)).toBe(plot.top)
    expect(plot.y(-5)).toBe(plot.bottom)
    expect(plot.y(50)).toBeCloseTo((plot.top + plot.bottom) / 2, 0)
  })

  it('centres a lone scan, and several scans at one instant', () => {
    const lone = plotOf([T0], false)
    expect(lone.x(T0)).toBe((lone.left + lone.right) / 2)
    expect(dateTicks([T0], lone)).toEqual([{ time: T0, x: lone.x(T0), anchor: 'middle' }])
  })

  it('anchors the end labels inward so none leaves the chart, in either direction', () => {
    const ltr = dateTicks(times, plotOf(times, false))
    const rtl = dateTicks(times, plotOf(times, true))
    expect(ltr.map((t) => t.anchor)).toEqual(['start', 'middle', 'end'])
    expect(rtl.map((t) => t.anchor)).toEqual(['end', 'middle', 'start'])
    expect(ltr.map((t) => t.time)).toEqual([T0, T0 + 5 * DAY, T0 + 10 * DAY])
  })
})

describe('the lines and marks', () => {
  const points = [
    point('a', 0, 90, { speed: 80 }),
    point('b', 5, null),
    point('c', 8, 70, { speed: 60 }),
    point('d', 10, 75),
  ]
  const plot = plotOf(times, false)

  it('breaks a line where a scan has no score, and gives one dot per score', () => {
    const line = lineOf(points, 'overall', plot)
    expect(line.paths).toHaveLength(2)
    expect(line.paths[0]).toMatch(/^M[\d.]+ [\d.]+$/)
    expect(line.paths[1]).toMatch(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/)
    expect(line.dots.map((d) => d.id)).toEqual(['a', 'c', 'd'])
    expect(line.dots[0]?.x).toBe(plot.left)
    expect(lineOf(points, 'speed', plot).dots.map((d) => d.score)).toEqual([80, 60])
    expect(lineOf(points, 'rtl', plot)).toEqual({ key: 'rtl', paths: [], dots: [] })
  })

  it('puts a mark at its scan: above the score, at the foot for a scan with none, and skips an unknown scan', () => {
    const markers: HistoryMarker[] = [
      { scanId: 'c', at: at(8), kind: 'score-drop', from: 90, to: 70 },
      { scanId: 'b', at: at(5), kind: 'down' },
      { scanId: 'd', at: at(10), kind: 'critical', count: 2 },
      { scanId: 'gone', at: at(1), kind: 'down' },
    ]
    const marks = marksOf(markers, points, plot)
    expect(marks.map((m) => m.kind)).toEqual(['score-drop', 'down', 'critical'])
    expect(marks[0]?.x).toBe(plot.x(T0 + 8 * DAY))
    // Three different outlines, so a mark is told by its shape as well as its colour.
    expect(new Set(marks.map((m) => m.d.replace(/[\d.-]+/g, '#'))).size).toBe(3)
    expect(marks[1]?.d).toContain(String(plot.bottom - 10 - 10))
  })

  it('lists the categories that have a score, in the report’s order, and groups markers by scan', () => {
    const history: SiteHistory = {
      siteId: 's',
      url: 'https://example.com/',
      days: 30,
      since: at(-30),
      alerts: true,
      points,
      markers: [],
    }
    expect(categoriesIn(history, ['rtl', 'speed', 'ai'])).toEqual(['speed'])
    const grouped = markersByScan([
      { scanId: 'a', at: at(0), kind: 'down' },
      { scanId: 'a', at: at(0), kind: 'critical', count: 1 },
      { scanId: 'b', at: at(5), kind: 'down' },
    ])
    expect(grouped.get('a')?.map((m) => m.kind)).toEqual(['down', 'critical'])
    expect(grouped.get('b')).toHaveLength(1)
  })
})
