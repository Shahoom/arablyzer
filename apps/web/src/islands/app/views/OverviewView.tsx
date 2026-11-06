import { APP_UI } from '@arablyzer/i18n/app'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import { localePath } from '@arablyzer/seo/site'
import { Check, Plus, ScanLine, TriangleAlert } from 'lucide-preact'
import { useState } from 'preact/hooks'
import { startScan } from '../../api'
import { precheck } from '../../scan-request'
import { dayLabel, reportHref, shortUrl } from '../../sites-model'
import type { ViewProps } from '../AppFrame'
import { ago, appHref, averageScore, firstName, scoreBand, siteHref } from '../app-model'
import { useShared } from '../data'
import { useAlerts, useUsage } from '../usage'
import {
  Delta,
  EmptyBlock,
  Notice,
  PageHeader,
  ScorePill,
  SiteTile,
  Skeleton,
  Spark,
  UsageMeter,
  useNow,
} from '../ui'

/** The first page: how the sites are today, what the plan has used, what needs a look, and a scan to start. */
export default function OverviewView({ lang }: ViewProps) {
  const t = APP_UI[lang]
  const o = t.overview
  const shared = useShared()
  const usage = useUsage()
  const found = useAlerts()
  const now = useNow()
  const [scanning, setScanning] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const rows = shared.rows
  const monitored = rows.filter((row) => row.monitor !== 'off').length
  const average = averageScore(rows)
  const name = firstName(shared.account.name)
  const alertCount = found?.alerts.length ?? null
  const recent = [...rows]
    .sort((a, b) => Date.parse(b.lastAt ?? '1970-01-01') - Date.parse(a.lastAt ?? '1970-01-01'))
    .slice(0, 5)

  async function quickScan(value: string) {
    if (scanning) return
    const checked = precheck(value)
    if (!checked.ok) {
      setProblem(SCAN_FORM[lang].errors[checked.error.code])
      return
    }
    setProblem(null)
    setScanning(true)
    const started = await startScan({ url: checked.url, turnstileToken: '' })
    if (started.ok) {
      window.location.assign(localePath(lang, `/r/${started.id}`))
      return
    }
    setScanning(false)
    const wait =
      started.error.retryAfterSeconds === undefined
        ? ''
        : ` ${SCAN_FORM[lang].retryAfter(started.error.retryAfterSeconds)}`
    setProblem(`${SCAN_FORM[lang].errors[started.error.code]}${wait}`)
  }

  const steps = [
    { key: 'site', done: rows.length > 0, href: appHref(lang, 'sites') },
    { key: 'scan', done: shared.scans.some((scan) => scan.score !== null), href: '#quick-scan' },
    { key: 'monitor', done: monitored > 0, href: appHref(lang, 'sites') },
    { key: 'key', done: (usage?.keys?.used ?? 0) > 0, href: appHref(lang, 'keys') },
  ] as const
  const done = steps.filter((step) => step.done).length

  return (
    <>
      <PageHeader
        title={name === null ? o.helloPlain : o.hello(name)}
        lead={
          rows.length === 0 && shared.status === 'ready'
            ? o.summaryEmpty
            : o.summary(rows.length, monitored)
        }
      >
        <form
          id="quick-scan"
          noValidate
          className="flex w-full flex-col gap-2 sm:flex-row lg:w-[460px]"
          onSubmit={(event) => {
            event.preventDefault()
            const field = event.currentTarget.elements.namedItem('url')
            if (field instanceof HTMLInputElement) void quickScan(field.value)
          }}
        >
          <label className="sr-only" htmlFor="quick-url">
            {o.quick.label}
          </label>
          <div className="app-field grow">
            <ScanLine size={18} aria-hidden="true" className="shrink-0" />
            <input
              id="quick-url"
              name="url"
              type="url"
              dir="ltr"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellcheck={false}
              placeholder={o.quick.placeholder}
              disabled={scanning}
              className="text-start"
            />
          </div>
          <button type="submit" className="btn-grad" disabled={scanning}>
            {scanning ? o.quick.working : o.quick.button}
          </button>
        </form>
      </PageHeader>
      {problem !== null && (
        <div className="-mt-3 mb-4">
          <Notice text={problem} />
        </div>
      )}

      {shared.status === 'failed' && (
        <Notice text={t.common.failed} retry={shared.reload} action={t.common.retry} />
      )}
      {shared.status === 'loading' && <Skeleton rows={4} />}
      {shared.status === 'ready' && (
        <>
          <dl className="app-stats" data-n="4">
            <div className="app-stat">
              <dt>{o.kpis.average}</dt>
              <dd className="flex items-center gap-3">
                <span
                  className={`app-stat-value ${average === null ? 'text-ink-3' : { good: 'text-pass', mid: 'text-moderate', low: 'text-critical-ink' }[scoreBand(average.value)]}`}
                >
                  {average === null ? '–' : average.value}
                </span>
              </dd>
              <dd className="app-stat-note">
                {average === null ? t.common.neverScanned : o.kpis.averageNote(average.scanned)}
              </dd>
            </div>
            <div className="app-stat">
              <dt>{o.kpis.scanned}</dt>
              <dd className="app-stat-value">
                <span dir="ltr">
                  {rows.filter((row) => row.score !== null).length}
                  <span className="text-body text-ink-3"> / {rows.length}</span>
                </span>
              </dd>
              <dd className="app-stat-note">{o.kpis.scannedNote(rows.length)}</dd>
            </div>
            <div className="app-stat">
              <dt>{o.kpis.monitored}</dt>
              <dd className="app-stat-value">{monitored}</dd>
              <dd className="app-stat-note">{o.kpis.monitoredNote(shared.limits.monitored)}</dd>
            </div>
            <div className="app-stat">
              <dt>{o.kpis.alerts}</dt>
              <dd className="app-stat-value">{alertCount ?? '–'}</dd>
              <dd className="app-stat-note">
                {alertCount === null || alertCount === 0 ? o.kpis.alertsNone : o.kpis.alertsNote}
              </dd>
            </div>
          </dl>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className="app-surface min-w-0 self-start" aria-labelledby="ov-sites">
              <div className="app-surface-head">
                <h2 id="ov-sites">{o.sitesTitle}</h2>
                <a
                  className="text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                  href={appHref(lang, 'sites')}
                >
                  {t.common.viewAll}
                </a>
              </div>
              {recent.length === 0 ? (
                <div className="p-5">
                  <EmptyBlock title={t.sites.emptyTitle} text={t.sites.emptyText}>
                    <a className="btn-grad" href={appHref(lang, 'sites')}>
                      <Plus size={18} aria-hidden="true" />
                      {t.empty.addSite}
                    </a>
                  </EmptyBlock>
                </div>
              ) : (
                <ul className="m-0 mt-2 list-none p-0">
                  {recent.map((row) => (
                    <li
                      key={row.site.id}
                      className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0"
                    >
                      <SiteTile url={row.site.url} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <a
                          href={siteHref(lang, row.site.id)}
                          dir="ltr"
                          className="truncate text-body font-semibold text-ink hover:underline rtl:text-right"
                        >
                          {row.host}
                        </a>
                        <span className="text-meta text-ink-3">
                          {row.lastAt === null ? t.common.neverScanned : ago(row.lastAt, now, lang)}
                        </span>
                      </div>
                      <span className="hidden sm:block">
                        <Spark
                          series={row.series}
                          lang={lang}
                          label={t.common.trendLabel(shortUrl(row.site.url), row.series.join(', '))}
                        />
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <ScorePill score={row.score} />
                        <Delta change={row.delta} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="flex min-w-0 flex-col gap-6">
              {done < steps.length && (
                <section className="app-surface p-5" aria-labelledby="ov-start">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 id="ov-start" className="m-0 text-[1.0625rem] font-semibold">
                      {o.start.title}
                    </h2>
                    <span className="text-meta text-ink-3 tabular-nums">
                      {o.start.progress(done, steps.length)}
                    </span>
                  </div>
                  <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
                    {steps.map((step) => (
                      <li key={step.key}>
                        <a
                          href={step.href}
                          className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-small hover:bg-surface-2"
                        >
                          <span
                            aria-hidden="true"
                            className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${step.done ? 'border-transparent bg-brand text-white' : 'border-field'}`}
                          >
                            {step.done && <Check size={14} />}
                          </span>
                          <span className={step.done ? 'text-ink-3 line-through' : 'text-ink'}>
                            {o.start.steps[step.key]}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="app-surface p-5" aria-labelledby="ov-usage">
                <h2 id="ov-usage" className="m-0 text-[1.0625rem] font-semibold">
                  {o.usageTitle}
                </h2>
                <p className="mt-1 mb-4 text-meta text-ink-3">{o.usageLead}</p>
                <div className="flex flex-col gap-4">
                  <UsageMeter
                    id="m-sites"
                    label={o.meters.sites}
                    used={shared.sites.length}
                    limit={shared.limits.sites}
                    text={t.common.of(shared.sites.length, shared.limits.sites)}
                    full={o.meterFull}
                  />
                  <UsageMeter
                    id="m-monitored"
                    label={o.meters.monitored}
                    used={monitored}
                    limit={shared.limits.monitored}
                    text={t.common.of(monitored, shared.limits.monitored)}
                    full={o.meterFull}
                  />
                  {usage?.pdfs != null && (
                    <UsageMeter
                      id="m-pdfs"
                      label={o.meters.pdfs}
                      used={usage.pdfs.used}
                      limit={usage.pdfs.limit}
                      text={t.common.of(usage.pdfs.used, usage.pdfs.limit)}
                      full={o.meterFull}
                    />
                  )}
                  {usage?.keys != null && usage.keys.enabled && (
                    <UsageMeter
                      id="m-keys"
                      label={o.meters.keys}
                      used={usage.keys.used}
                      limit={usage.keys.limit}
                      text={t.common.of(usage.keys.used, usage.keys.limit)}
                      full={o.meterFull}
                    />
                  )}
                </div>
              </section>

              <section className="app-surface p-5" aria-labelledby="ov-alerts">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="ov-alerts" className="m-0 text-[1.0625rem] font-semibold">
                    {o.alertsTitle}
                  </h2>
                  <a
                    className="text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                    href={appHref(lang, 'monitoring')}
                  >
                    {t.nav.items.monitoring}
                  </a>
                </div>
                {found === null ? (
                  monitored > 0 ? (
                    <div className="mt-3">
                      <Skeleton rows={2} />
                    </div>
                  ) : (
                    <p className="mt-2 mb-0 text-small text-ink-2">{o.alertsOff}</p>
                  )
                ) : found.alerts.length === 0 ? (
                  <p className="mt-2 mb-0 text-small text-ink-2">{o.alertsEmpty}</p>
                ) : (
                  <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
                    {found.alerts.slice(0, 4).map((alert) => (
                      <li key={alert.id}>
                        <a
                          href={siteHref(lang, alert.siteId)}
                          className="flex items-start gap-3 rounded-xl p-2 hover:bg-surface-2"
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
                                ? o.alertKinds['score-drop'](alert.from ?? 0, alert.to ?? 0)
                                : alert.kind === 'critical'
                                  ? o.alertKinds.critical(alert.count ?? 0)
                                  : o.alertKinds.down}
                            </span>
                            <span className="text-meta text-ink-3">
                              <bdi dir="ltr">{shortUrl(alert.url)}</bdi> ·{' '}
                              {ago(alert.at, now, lang)}
                            </span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          <section className="app-surface mt-6" aria-labelledby="ov-recent">
            <div className="app-surface-head">
              <h2 id="ov-recent">{o.recentTitle}</h2>
              <a
                className="text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                href={appHref(lang, 'scans')}
              >
                {t.common.viewAll}
              </a>
            </div>
            {shared.scans.length === 0 ? (
              <p className="m-0 p-5 text-small text-ink-2">{o.recentEmpty}</p>
            ) : (
              <ul className="m-0 mt-2 list-none p-0">
                {shared.scans.slice(0, 6).map((scan) => (
                  <li
                    key={scan.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-3 first:border-t-0"
                  >
                    <bdi
                      dir="ltr"
                      className="min-w-0 flex-1 truncate text-small font-semibold text-ink"
                    >
                      {shortUrl(scan.url)}
                    </bdi>
                    <span className="text-meta text-ink-3">{dayLabel(scan.createdAt, lang)}</span>
                    <ScorePill score={scan.score} />
                    <a
                      className="inline-flex min-h-11 items-center text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                      href={reportHref(lang, scan.id)}
                    >
                      {t.common.openReport}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}
