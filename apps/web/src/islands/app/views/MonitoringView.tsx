import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import { APP_UI } from '@arablyzer/i18n/app'
import { TriangleAlert } from 'lucide-preact'
import AlertsPanel from '../../account/AlertsPanel'
import { dayLabel, shortUrl, trendText } from '../../sites-model'
import type { ViewProps } from '../AppFrame'
import { useSiteActions } from '../actions'
import { ago, appHref, siteHref, trendScores } from '../app-model'
import { useShared } from '../data'
import { useAlerts } from '../usage'
import { EmptyBlock, Notice, PageHeader, SiteTile, Skeleton, Spark, useNow } from '../ui'

/** The sites that are watched and how they are doing, the alerts the monitor would have sent, and where they go. */
export default function MonitoringView({ lang }: ViewProps) {
  const t = APP_UI[lang]
  const m = t.monitoring
  const words = ACCOUNT_UI[lang].monitor
  const shared = useShared()
  const actions = useSiteActions(lang)
  const found = useAlerts(10)
  const now = useNow()
  const watched = shared.rows.filter((row) => row.monitor !== 'off')

  return (
    <>
      <PageHeader title={t.pages.monitoring.title} lead={t.pages.monitoring.lead}>
        {shared.status === 'ready' && (
          <p className="m-0 text-small font-semibold text-ink-2">
            {m.limit(watched.length, shared.limits.monitored)}
          </p>
        )}
      </PageHeader>
      {actions.message !== null && (
        <div className="mb-4">
          <Notice text={actions.message} />
        </div>
      )}
      {shared.status === 'loading' && <Skeleton rows={3} />}
      {shared.status === 'failed' && (
        <Notice text={t.common.failed} retry={shared.reload} action={t.common.retry} />
      )}
      {shared.status === 'ready' && (
        <div className="flex flex-col gap-6">
          {watched.length === 0 ? (
            <EmptyBlock title={m.emptyTitle} text={m.emptyText}>
              <a className="btn-grad" href={appHref(lang, 'sites')}>
                {m.goSites}
              </a>
            </EmptyBlock>
          ) : (
            <div className="app-surface overflow-hidden">
              <table className="app-table" data-kind="monitoring">
                <caption className="sr-only">{t.pages.monitoring.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">{m.columns.site}</th>
                    <th scope="col">{m.columns.every}</th>
                    <th scope="col">{m.columns.next}</th>
                    <th scope="col">{m.columns.trend}</th>
                    <th scope="col">{m.columns.status}</th>
                    <th scope="col">
                      <span className="sr-only">{t.sites.columns.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {watched.map((row) => {
                    const monitor = row.site.monitor
                    if (monitor === null) return null
                    const status =
                      row.monitor === 'paused'
                        ? 'paused'
                        : row.monitor === 'failing'
                          ? 'failing'
                          : 'ok'
                    return (
                      <tr key={row.site.id}>
                        <td data-cell="site">
                          <div className="flex min-w-0 items-center gap-3">
                            <SiteTile url={row.site.url} />
                            <a
                              href={siteHref(lang, row.site.id)}
                              dir="ltr"
                              className="truncate text-body font-semibold text-ink hover:underline rtl:text-right"
                            >
                              {row.host}
                            </a>
                          </div>
                        </td>
                        <td data-cell="every" className="text-small text-ink-2">
                          {m.everyDays(monitor.everyDays)}
                        </td>
                        <td data-cell="next" className="text-small text-ink-2">
                          {dayLabel(monitor.nextRunAt, lang)}
                        </td>
                        <td data-cell="trend">
                          <Spark
                            series={trendScores(monitor.trend)}
                            lang={lang}
                            label={words.trendLabel(trendText(monitor.trend, words.noScore))}
                          />
                        </td>
                        <td data-cell="status">
                          <span className="app-pill" data-tone={status === 'ok' ? 'on' : 'warn'}>
                            <i />
                            {m.status[status]}
                          </span>
                        </td>
                        <td data-cell="act">
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={actions.busy !== null}
                            onClick={() => void actions.toggleMonitor(row.site)}
                          >
                            {actions.busy === `monitor:${row.site.id}`
                              ? words.disabling
                              : m.turnOff}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <section className="app-surface" aria-labelledby="mo-feed">
            <div className="app-surface-head">
              <div>
                <h2 id="mo-feed">{m.feedTitle}</h2>
                <p>{m.feedLead}</p>
              </div>
            </div>
            {found === null ? (
              watched.length > 0 ? (
                <div className="p-5">
                  <Skeleton rows={2} />
                </div>
              ) : (
                <p className="m-0 p-5 text-small text-ink-2">{t.overview.alertsOff}</p>
              )
            ) : found.alerts.length === 0 ? (
              <p className="m-0 p-5 text-small text-ink-2">{m.feedEmpty}</p>
            ) : (
              <ul className="m-0 mt-2 list-none p-0">
                {found.alerts.map((alert) => (
                  <li key={alert.id} className="border-t border-line first:border-t-0">
                    <a
                      href={siteHref(lang, alert.siteId)}
                      className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${alert.kind === 'critical' ? 'bg-critical-soft text-critical-ink' : alert.kind === 'down' ? 'bg-moderate-soft text-moderate' : 'bg-serious-soft text-serious'}`}
                      >
                        <TriangleAlert size={16} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-small font-semibold text-ink">
                          {alert.kind === 'score-drop'
                            ? t.overview.alertKinds['score-drop'](alert.from ?? 0, alert.to ?? 0)
                            : alert.kind === 'critical'
                              ? t.overview.alertKinds.critical(alert.count ?? 0)
                              : t.overview.alertKinds.down}
                        </span>
                        <span className="text-meta text-ink-3">
                          <bdi dir="ltr">{shortUrl(alert.url)}</bdi> · {ago(alert.at, now, lang)}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div data-app-panel className="max-w-[860px]">
            <AlertsPanel lang={lang} />
          </div>
        </div>
      )}
    </>
  )
}
