import { APP_UI } from '@arablyzer/i18n/app'
import type { Lang } from '@arablyzer/seo/site'
import { ArrowDown, ArrowUp, TriangleAlert } from 'lucide-preact'
import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  hostOf,
  letterOf,
  meterOf,
  scoreBand,
  sparkOf,
  type Band,
  type MeterTone,
} from './app-model'

// The pieces the dashboard's pages are made of. None sets a style attribute while the server renders
// it (the page's policy has none); a width that comes from data is set on the client, after a read.

export function PageHeader({
  title,
  lead,
  children,
  leading,
}: {
  title: string
  lead?: string
  children?: ComponentChildren
  leading?: ComponentChildren
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  // A page opens at its heading for a screen reader, without moving a sighted reader's view.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  return (
    <header className="app-ph">
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="min-w-0">
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {lead !== undefined && <p>{lead}</p>}
        </div>
      </div>
      {children !== undefined && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
    </header>
  )
}

const TONES = ['0', '1', '2', '3', '4', '5'] as const

/** A site's tile: its first letter on a colour chosen from its name, so a site keeps its colour. */
export function SiteTile({ url, size = 'md' }: { url: string; size?: 'md' | 'lg' }) {
  const host = hostOf(url)
  let sum = 0
  for (const char of host) sum = (sum + char.charCodeAt(0)) % 997
  return (
    <span
      className={size === 'lg' ? 'app-tile size-14 rounded-2xl text-2xl' : 'app-tile'}
      data-tone={TONES[sum % TONES.length]}
      lang="en"
      aria-hidden="true"
    >
      {letterOf(url)}
    </span>
  )
}

export function ScorePill({ score }: { score: number | null }) {
  return (
    <span className="app-score" data-band={score === null ? 'none' : scoreBand(score)} dir="ltr">
      {score ?? '–'}
    </span>
  )
}

export function Delta({ change, label }: { change: number | null; label?: string }) {
  if (change === null) return null
  const text = change === 0 ? '0' : `${change > 0 ? '+' : '−'}${String(Math.abs(change))}`
  return (
    <span
      className="app-delta"
      data-tone={change > 0 ? 'up' : change < 0 ? 'down' : 'same'}
      dir="ltr"
      {...(label === undefined ? {} : { 'aria-label': label, role: 'img' })}
    >
      {change > 0 && <ArrowUp size={12} aria-hidden="true" />}
      {change < 0 && <ArrowDown size={12} aria-hidden="true" />}
      {text}
    </span>
  )
}

const SPARK: Readonly<Record<Band, { line: string; fill: string; dot: string }>> = {
  good: { line: 'stroke-pass', fill: 'fill-pass', dot: 'fill-pass' },
  mid: { line: 'stroke-moderate', fill: 'fill-moderate', dot: 'fill-moderate' },
  low: { line: 'stroke-critical-ink', fill: 'fill-critical-ink', dot: 'fill-critical-ink' },
}

/** The scores of a site's last scans as a small line, in the colour of its newest score's band. */
export function Spark({
  series,
  lang,
  label,
  width = 120,
  height = 36,
}: {
  series: readonly number[]
  lang: Lang
  label: string
  width?: number
  height?: number
}) {
  const spark = sparkOf(series, lang === 'ar', width, height)
  const last = series[series.length - 1]
  const tone = SPARK[last === undefined ? 'mid' : scoreBand(last)]
  if (spark.points.length === 0) {
    return (
      <span className="text-meta text-ink-3" aria-hidden="true">
        –
      </span>
    )
  }
  const end = spark.points[spark.points.length - 1]
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      width={width}
      height={height}
      className="block h-9 w-[120px] max-w-full"
    >
      {spark.area !== '' && <path d={spark.area} className={`${tone.fill} opacity-15`} />}
      {spark.line !== '' && (
        <path
          d={spark.line}
          fill="none"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          className={tone.line}
        />
      )}
      {end !== undefined && <circle cx={end.x} cy={end.y} r="3" className={tone.dot} />}
    </svg>
  )
}

/** A score on a ring: the number inside, the arc in its band's colour. */
export function ScoreRing({ score, size = 72 }: { score: number | null; size?: number }) {
  const radius = 25
  const circumference = 2 * Math.PI * radius
  const value = score === null ? 0 : Math.max(0, Math.min(100, score))
  const tone = score === null ? 'stroke-line-2' : SPARK[scoreBand(score)].line
  return (
    <span className="relative inline-grid shrink-0 place-items-center" dir="ltr">
      <svg viewBox="0 0 60 60" width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx="30"
          cy="30"
          r={radius}
          fill="none"
          className="stroke-surface-2"
          stroke-width="7"
        />
        <circle
          cx="30"
          cy="30"
          r={radius}
          fill="none"
          stroke-width="7"
          stroke-linecap="round"
          stroke-dasharray={`${String((value / 100) * circumference)} ${String(circumference)}`}
          className={tone}
        />
      </svg>
      <b className="absolute text-xl font-semibold tabular-nums">{score ?? '–'}</b>
    </span>
  )
}

const FILL: Readonly<Record<MeterTone, string>> = {
  ok: '',
  near: 'text-moderate',
  full: 'text-critical-ink',
  none: 'text-ink-3',
}

/** What was used of what the plan allows: a labelled meter, with a line when it is full. */
export function UsageMeter({
  label,
  used,
  limit,
  text,
  full,
  id,
}: {
  label: string
  used: number
  limit: number
  text: string
  full: string
  id: string
}) {
  const meter = meterOf(used, limit)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-small">
        <span id={id} className="text-ink-2">
          {label}
        </span>
        <span className={`font-semibold tabular-nums ${FILL[meter.tone]}`}>{text}</span>
      </div>
      <div
        className="app-meter"
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={Math.max(limit, used)}
        aria-valuenow={used}
        aria-valuetext={text}
        data-tone={meter.tone}
      >
        <span style={{ width: `${String(Math.round(meter.ratio * 100))}%` }} />
      </div>
      {meter.tone === 'full' && <p className="m-0 text-meta text-critical-ink">{full}</p>}
    </div>
  )
}

export function EmptyBlock({
  title,
  text,
  children,
}: {
  title: string
  text: string
  children?: ComponentChildren
}) {
  return (
    <div className="empty-state m-0 items-start">
      <p className="m-0 text-body font-semibold text-ink">{title}</p>
      <p className="m-0 max-w-[60ch] text-small text-ink-2">{text}</p>
      {children !== undefined && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="app-skel h-14 w-full" />
      ))}
    </div>
  )
}

/** A failed read, with the way to try again. */
export function Notice({
  text,
  retry,
  action,
}: {
  text: string
  retry?: () => void
  action?: string
}) {
  return (
    <p
      role="alert"
      className="m-0 flex flex-wrap items-center gap-3 rounded-xl bg-moderate-soft p-3 text-small text-ink-2 forced-colors:border"
    >
      <TriangleAlert aria-hidden="true" size={16} className="shrink-0 text-moderate" />
      <span className="min-w-0 flex-1">{text}</span>
      {retry !== undefined && (
        <button type="button" className="btn-white" onClick={retry}>
          {action}
        </button>
      )}
    </p>
  )
}

export function SeverityChip({
  severity,
  lang,
  count,
}: {
  severity: keyof (typeof APP_UI)['ar']['common']['severities']
  lang: Lang
  count?: number
}) {
  const tone = {
    critical: 'sev-critical',
    serious: 'sev-serious',
    moderate: 'sev-moderate',
    minor: 'sev-minor',
    info: 'sev-info',
  } as const
  return (
    <span className={`sev ${tone[severity]}`}>
      {APP_UI[lang].common.severities[severity]}
      {count !== undefined && <b className="tabular-nums">{count}</b>}
    </span>
  )
}

/** The time now, read once on the client: a relative date is worked out against it. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
  }, [])
  return now
}
