import type { CrawlReport, SiteHistory } from '@arablyzer/api-contract/codes'
import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import { APP_UI } from '@arablyzer/i18n/app'
import { COMPARE_UI } from '@arablyzer/i18n/compare'
import { CRAWL_UI } from '@arablyzer/i18n/crawl'
import { REPORT } from '@arablyzer/i18n/report'
import type { Report } from '@arablyzer/report-schema'
import { ChevronLeft, ChevronRight, ExternalLink, GitCompare } from 'lucide-preact'
import { useEffect, useState } from 'preact/hooks'
import { fetchReport } from '../../api'
import { getSiteHistory } from '../../compare-api'
import { previousScanOf, compareHref } from '../../compare-model'
import { getCrawl } from '../../crawl-api'
import { templateName } from '../../crawl-model'
import PdfDownload from '../../pdf/PdfDownload'
import { categoryRows, summaryCounts } from '../../report-model'
import { dayLabel, reportHref, shortUrl, trendText } from '../../sites-model'
import CrawlReportCard from '../../account/CrawlReportCard'
import CrawlRow from '../../account/CrawlRow'
import type { ViewProps } from '../AppFrame'
import { useSiteActions } from '../actions'
import { ago, appHref, donutArcs, scoreBand, siteIdOf, trendScores } from '../app-model'
import { useShared } from '../data'
import HistoryPanel from '../HistoryPanel'
import {
  Delta,
  EmptyBlock,
  Notice,
  PageHeader,
  ScorePill,
  SiteTile,
  Skeleton,
  Spark,
  useNow,
} from '../ui'

type Load<T> = 'loading' | 'failed' | T

const SEVERITIES = ['critical', 'serious', 'moderate', 'minor', 'info'] as const

/** One site: its score over time, its open issues by severity, its categories, its monitor and crawl. */
export default function SiteView({ lang }: ViewProps) {
  const t = APP_UI[lang]
  const s = t.site
  const shared = useShared()
  const actions = useSiteActions(lang)
  const now = useNow()
  const [id] = useState(() => siteIdOf(window.location.search))
  const site = shared.sites.find((kept) => kept.id === id)
  const row = shared.rows.find((kept) => kept.site.id === id)
  const lastScan = site?.lastScan ?? null
  const reachedLast =
    lastScan !== null && (lastScan.state === 'complete' || lastScan.state === 'partial')

  const [history, setHistory] = useState<Load<SiteHistory>>('loading')
  const [report, setReport] = useState<Load<Report> | null>(null)
  const [crawl, setCrawl] = useState<Load<CrawlReport> | null>(null)
  const [crawlOpen, setCrawlOpen] = useState<string | null>(null)

  useEffect(() => {
    if (id === null) return
    let live = true
    setHistory('loading')
    void getSiteHistory(id).then((read) => {
      if (live) setHistory(read.ok ? read.value : 'failed')
    })
    return () => {
      live = false
    }
  }, [id, lastScan?.id])

  const lastId = reachedLast ? lastScan.id : null
  useEffect(() => {
    if (lastId === null) {
      setReport(null)
      return
    }
    let live = true
    setReport('loading')
    void fetchReport(lastId).then((read) => {
      if (live) setReport(read.ok ? read.value : 'failed')
    })
    return () => {
      live = false
    }
  }, [lastId])

  const crawlId = site?.crawl?.state === 'done' ? site.crawl.id : null
  useEffect(() => {
    if (crawlId === null) {
      setCrawl(null)
      return
    }
    let live = true
    setCrawl('loading')
    void getCrawl(crawlId).then((read) => {
      if (live) setCrawl(read.ok ? read.value : 'failed')
    })
    return () => {
      live = false
    }
  }, [crawlId])

  if (id === null || (shared.status === 'ready' && site === undefined)) {
    return (
      <>
        <PageHeader title={s.missing} lead={s.missingText} />
        <a className="btn-white" href={appHref(lang, 'sites')}>
          {s.back}
        </a>
      </>
    )
  }
  if (site === undefined || row === undefined) {
    return shared.status === 'failed' ? (
      <Notice text={t.common.failed} retry={shared.reload} action={t.common.retry} />
    ) : (
      <Skeleton rows={4} />
    )
  }

  const Back = lang === 'ar' ? ChevronRight : ChevronLeft
  const name = shortUrl(site.url)
  const counts = typeof report === 'object' && report !== null ? summaryCounts(report) : null
  const categories =
    typeof report === 'object' && report !== null ? categoryRows(report.score.categories) : null
  const weakest = categories?.low[0]
  const names = REPORT[lang].categories
  const siteScans = shared.scans.filter(
    (scan) =>
      scan.siteId === site.id &&
      (scan.state === 'complete' || scan.state === 'partial') &&
      scan.score !== null,
  )
  const previous = previousScanOf(siteScans, 0)
  const newest = siteScans[0]
  const monitorWords = ACCOUNT_UI[lang].monitor
  const crawlReport = typeof crawl === 'object' && crawl !== null ? crawl : null
  const parts =
    counts === null ? [] : SEVERITIES.map((key) => ({ key, value: counts.bySeverity[key] }))
  const arcs = donutArcs(parts)
  const total = counts === null ? 0 : counts.problems + counts.notes

  return (
    <>
      <nav className="mb-3 md:hidden" aria-label={t.shell.crumbs}>
        <a
          className="inline-flex min-h-11 items-center gap-1 text-small font-semibold text-brand-ink"
          href={appHref(lang, 'sites')}
        >
          <Back size={16} aria-hidden="true" />
          {s.back}
        </a>
      </nav>
      <PageHeader
        title={row.host}
        lead={
          lastScan === null ? t.common.neverScanned : s.last(ago(lastScan.createdAt, now, lang))
        }
        leading={<SiteTile url={site.url} size="lg" />}
      >
        <button
          type="button"
          className="btn-grad"
          disabled={actions.busy !== null}
          onClick={() => void actions.scan(site)}
        >
          {actions.busy === `scan:${site.id}` ? t.common.scanning : t.common.scanNow}
        </button>
        {lastScan !== null && (
          <a className="btn-white" href={reportHref(lang, lastScan.id)}>
            <ExternalLink size={16} aria-hidden="true" className="rtl:-scale-x-100" />
            {s.share}
          </a>
        )}
        {reachedLast && (
          <PdfDownload
            lang={lang}
            ask={{ kind: 'scan', id: lastScan.id }}
            what={name}
            className="flex flex-col gap-1"
          />
        )}
      </PageHeader>
      {actions.message !== null && (
        <div className="-mt-3 mb-4">
          <Notice text={actions.message} />
        </div>
      )}

      <dl className="app-stats" data-n="4">
        <div className="app-stat">
          <dt>{s.kpi.score}</dt>
          <dd className="flex items-center gap-2">
            <ScorePill score={row.score} />
            <Delta change={row.delta} />
          </dd>
          <dd className="app-stat-note">
            {row.score === null ? t.common.noScore : s.kpi.fromOutOf}
          </dd>
        </div>
        <div className="app-stat">
          <dt>{s.kpi.issues}</dt>
          <dd className="app-stat-value">{counts === null ? '–' : counts.problems}</dd>
          <dd className="app-stat-note">
            {counts === null
              ? ''
              : counts.problems === 0 && counts.notes === 0
                ? s.kpi.issuesNone
                : s.kpi.issuesNote(counts.notes)}
          </dd>
        </div>
        <div className="app-stat">
          <dt>{s.kpi.pages}</dt>
          <dd className="app-stat-value">
            {site.crawl?.state === 'done' ? site.crawl.pagesChecked : '–'}
          </dd>
          <dd className="app-stat-note">
            {site.crawl?.state === 'done' ? s.kpi.pagesNote(site.crawl.templates) : s.kpi.pagesNone}
          </dd>
        </div>
        <div className="app-stat">
          <dt>{s.kpi.weakest}</dt>
          <dd className="text-body font-semibold">
            {weakest === undefined ? '–' : names[weakest.category]}
          </dd>
          <dd className="app-stat-note" dir="ltr">
            {weakest === undefined ? s.kpi.weakestNone : `${String(weakest.value)} / 100`}
          </dd>
        </div>
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="app-surface min-w-0" aria-labelledby="st-chart">
            <div className="app-surface-head pb-1">
              <div>
                <h2 id="st-chart">{s.chart.title}</h2>
                {history !== 'loading' && history !== 'failed' && (
                  <p>{s.chart.lead(history.days)}</p>
                )}
              </div>
            </div>
            {history === 'loading' && (
              <div className="p-5">
                <Skeleton rows={3} />
              </div>
            )}
            {history === 'failed' && (
              <div className="p-5">
                <Notice text={COMPARE_UI[lang].history.failed} />
              </div>
            )}
            {typeof history === 'object' && <HistoryPanel lang={lang} history={history} />}
          </section>
          <section className="app-surface p-5" aria-labelledby="st-cats">
            <h2 id="st-cats" className="m-0 text-[1.0625rem] font-semibold">
              {s.categories.title}
            </h2>
            <p className="mt-1 mb-4 text-meta text-ink-3">{s.categories.lead}</p>
            {categories === null || categories.low.length + categories.full.length === 0 ? (
              <p className="m-0 text-small text-ink-2">{s.categories.none}</p>
            ) : (
              <>
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {categories.low.map((entry) => (
                    <li key={entry.category} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-small">
                        <span className="text-ink-2">{names[entry.category]}</span>
                        <b className="tabular-nums" dir="ltr">
                          {entry.value}
                        </b>
                      </div>
                      <div
                        className="app-meter"
                        data-tone={{ good: 'ok', mid: 'near', low: 'full' }[scoreBand(entry.value)]}
                        aria-hidden="true"
                      >
                        <span style={{ width: `${String(entry.value)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
                {categories.full.length > 0 && (
                  <p className="mt-4 mb-0 text-small text-pass">
                    {s.categories.fullNote(categories.full.length)}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <section className="app-surface p-5" aria-labelledby="st-donut">
            <h2 id="st-donut" className="m-0 text-[1.0625rem] font-semibold">
              {s.donut.title}
            </h2>
            <p className="mt-1 mb-4 text-meta text-ink-3">{s.donut.lead}</p>
            {report === null && <p className="m-0 text-small text-ink-2">{s.donut.none}</p>}
            {report === 'loading' && <Skeleton rows={2} />}
            {report === 'failed' && <p className="m-0 text-small text-ink-2">{s.donut.none}</p>}
            {counts !== null && (
              <div className="flex flex-wrap items-center gap-6">
                <div className="relative shrink-0" dir="ltr">
                  <svg
                    viewBox="0 0 120 120"
                    width="132"
                    height="132"
                    role="img"
                    aria-label={s.donut.summary(
                      parts
                        .filter((part) => part.value > 0)
                        .map((part) => `${t.common.severities[part.key]} ${String(part.value)}`)
                        .join(lang === 'ar' ? '، ' : ', '),
                    )}
                    className="-rotate-90"
                  >
                    <circle
                      cx="60"
                      cy="60"
                      r="48"
                      fill="none"
                      stroke-width="14"
                      className="stroke-surface-2"
                    />
                    {arcs.map((arc) => (
                      <circle
                        key={arc.key}
                        cx="60"
                        cy="60"
                        r="48"
                        fill="none"
                        stroke-width="14"
                        stroke-dasharray={`${String(arc.dash)} ${String(arc.gap)}`}
                        stroke-dashoffset={arc.offset}
                        className="app-sev-stroke"
                        data-sev={arc.key}
                      />
                    ))}
                  </svg>
                  <span className="absolute inset-0 grid place-items-center text-center">
                    <span className="flex flex-col leading-tight">
                      <b className="text-2xl font-semibold tabular-nums">{total}</b>
                      <span className="text-meta text-ink-3">{s.donut.total}</span>
                    </span>
                  </span>
                </div>
                <ul className="m-0 flex min-w-[140px] flex-1 list-none flex-col gap-2 p-0">
                  {SEVERITIES.map((key) => (
                    <li key={key} className="flex items-center gap-2 text-small">
                      <i className="app-sev-dot" data-sev={key} aria-hidden="true" />
                      <span className="text-ink-2">{t.common.severities[key]}</span>
                      <b className="ms-auto tabular-nums">{counts.bySeverity[key]}</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {counts !== null && total === 0 && (
              <p className="mt-3 mb-0 text-small text-pass">{s.donut.clean}</p>
            )}
          </section>
          <section className="app-surface flex flex-col gap-3 p-5" aria-labelledby="st-monitor">
            <h2 id="st-monitor" className="m-0 text-[1.0625rem] font-semibold">
              {s.monitor.title}
            </h2>
            <p className="m-0 text-small text-ink-2">
              {site.monitor === null ? (
                monitorWords.off
              ) : site.monitor.paused ? (
                monitorWords.paused
              ) : (
                <>
                  {monitorWords.on(site.monitor.everyDays)}
                  {'. '}
                  {monitorWords.nextRun(dayLabel(site.monitor.nextRunAt, lang))}
                </>
              )}
            </p>
            {site.monitor !== null && site.monitor.failures > 0 && !site.monitor.paused && (
              <p className="m-0 text-meta text-ink-2">{monitorWords.failing}</p>
            )}
            {site.monitor !== null && site.monitor.trend.length > 0 && (
              <div className="flex flex-wrap items-center gap-3" dir="ltr">
                <Spark
                  series={trendScores(site.monitor.trend)}
                  lang={lang}
                  label={monitorWords.trendLabel(
                    trendText(site.monitor.trend, monitorWords.noScore),
                  )}
                />
                <span className="text-meta text-ink-2">
                  {trendText(site.monitor.trend, monitorWords.noScore)}
                </span>
              </div>
            )}
            <div className="mt-auto flex flex-wrap gap-2">
              <button
                type="button"
                className={site.monitor === null ? 'btn-white' : 'btn-ghost'}
                disabled={actions.busy !== null}
                onClick={() => void actions.toggleMonitor(site)}
              >
                {site.monitor === null
                  ? actions.busy === `monitor:${site.id}`
                    ? monitorWords.enabling
                    : monitorWords.enable
                  : actions.busy === `monitor:${site.id}`
                    ? monitorWords.disabling
                    : monitorWords.disable}
              </button>
              <a className="btn-ghost" href={appHref(lang, 'monitoring')}>
                {t.nav.items.monitoring}
              </a>
            </div>
          </section>
          <section className="app-surface flex flex-col gap-3 p-5" aria-labelledby="st-crawl">
            <h2 id="st-crawl" className="m-0 text-[1.0625rem] font-semibold">
              {s.crawl.title}
            </h2>
            {site.crawl === null && <p className="m-0 text-small text-ink-2">{s.crawl.none}</p>}
            {crawlReport !== null && crawlReport.templates.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {crawlReport.templates.slice(0, 4).map((template) => {
                  const label = templateName(CRAWL_UI[lang].report, template)
                  return (
                    <li
                      key={template.key}
                      className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-small first:border-t-0"
                    >
                      <span className="min-w-0">
                        <span className="text-ink-2">{label.kind} </span>
                        <bdi dir="ltr" className="font-semibold text-ink">
                          {label.pattern}
                        </bdi>
                      </span>
                      <span className="shrink-0 text-meta text-ink-3">
                        {s.crawl.pages(template.found, template.checked)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            <div data-stack>
              <CrawlRow
                lang={lang}
                site={site}
                cap={shared.limits.crawlPages}
                busy={actions.busy !== null}
                working={actions.busy === `crawl:${site.id}`}
                open={site.crawl !== null && crawlOpen === site.crawl.id}
                onStart={(target) => void actions.startCrawl(target)}
                onCancel={(target) => void actions.cancelCrawl(target)}
                onToggle={(target) => {
                  const open = target.crawl?.id ?? null
                  setCrawlOpen(crawlOpen === open ? null : open)
                }}
              />
            </div>
          </section>
        </div>
      </div>

      {crawlOpen !== null && (
        <div className="mt-6">
          <CrawlReportCard
            key={crawlOpen}
            lang={lang}
            crawlId={crawlOpen}
            onSummary={(summary) => {
              actions.setCrawl(site.id, summary)
            }}
            onClose={() => {
              setCrawlOpen(null)
            }}
            onRemoved={() => {
              setCrawlOpen(null)
              actions.setCrawl(site.id, null)
            }}
          />
        </div>
      )}

      <section className="app-surface mt-6" aria-labelledby="st-scans">
        <div className="app-surface-head">
          <h2 id="st-scans">{s.history.title}</h2>
          {newest !== undefined && previous !== null ? (
            <a
              className="btn-white"
              href={compareHref(lang, 'scan', previous.id, newest.id)}
              aria-label={COMPARE_UI[lang].links.previousScanLabel(
                dayLabel(previous.createdAt, lang),
              )}
            >
              <GitCompare size={16} aria-hidden="true" />
              {s.compareLast}
            </a>
          ) : (
            <span className="text-meta text-ink-3">{s.compareNone}</span>
          )}
        </div>
        {siteScans.length === 0 ? (
          <div className="p-5">
            <EmptyBlock title={s.history.none} text={t.scans.emptyText} />
          </div>
        ) : (
          <ul className="m-0 mt-2 list-none p-0">
            {siteScans.slice(0, 8).map((scan) => (
              <li
                key={scan.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-3 first:border-t-0"
              >
                <span className="min-w-0 flex-1 text-small text-ink-2">
                  {dayLabel(scan.createdAt, lang)}
                </span>
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
  )
}
