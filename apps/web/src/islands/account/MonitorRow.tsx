import type { SiteSummary } from '@arablyzer/api-contract/codes'
import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import type { Lang } from '@arablyzer/seo/site'
import { Activity } from 'lucide-preact'
import { dayLabel, sparkline, trendText } from '../sites-model'

interface Props {
  lang: Lang
  site: SiteSummary
  /** Another request is under way: nothing else is sent. */
  busy: boolean
  /** This site's own request is the one under way. */
  working: boolean
  onToggle: (site: SiteSummary) => void
}

/**
 * One saved site's monitoring (M4.3): whether it is watched, when it is next scanned, how its
 * last runs went (a small chart with the scores in words beside it), and the switch. The numbers
 * are the API's; the chart is drawn in the SVG's own units, so the page sets no style attribute.
 */
export default function MonitorRow({ lang, site, busy, working, onToggle }: Props) {
  const m = ACCOUNT_UI[lang].monitor
  const { monitor } = site
  const chart = monitor === null ? null : sparkline(monitor.trend)
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="m-0 flex items-start gap-2 text-small text-ink-2">
          <Activity aria-hidden="true" size={16} className="mt-1 shrink-0 text-ink-3" />
          <span className="min-w-0">
            {monitor === null ? (
              m.off
            ) : monitor.paused ? (
              m.paused
            ) : (
              <>
                {m.on(monitor.everyDays)}
                {'. '}
                {m.nextRun(dayLabel(monitor.nextRunAt, lang))}
              </>
            )}
          </span>
        </p>
        {monitor !== null && monitor.failures > 0 && !monitor.paused && (
          <p className="m-0 text-meta text-ink-2">{m.failing}</p>
        )}
        {monitor !== null && chart !== null && monitor.trend.length > 0 && (
          <div dir="ltr" className="flex flex-wrap items-center gap-3">
            <svg
              role="img"
              aria-label={m.trendLabel(trendText(monitor.trend, m.noScore))}
              viewBox="0 0 100 32"
              width="100"
              height="32"
              className="h-8 w-24 shrink-0 text-brand-ink"
            >
              {chart.lines.map((points) => (
                <polyline
                  key={points}
                  points={points}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {chart.last !== null && (
                <circle cx={chart.last.x} cy={chart.last.y} r="3" fill="currentColor" />
              )}
            </svg>
            <span className="text-meta text-ink-2">{trendText(monitor.trend, m.noScore)}</span>
          </div>
        )}
      </div>
      <button
        type="button"
        className={monitor === null ? 'btn-white' : 'btn-ghost'}
        disabled={busy}
        onClick={() => {
          onToggle(site)
        }}
      >
        {monitor === null ? (working ? m.enabling : m.enable) : working ? m.disabling : m.disable}
      </button>
    </div>
  )
}
