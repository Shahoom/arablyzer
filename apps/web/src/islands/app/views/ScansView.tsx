import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import { APP_UI } from '@arablyzer/i18n/app'
import { COMPARE_UI } from '@arablyzer/i18n/compare'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-preact'
import { useMemo, useState } from 'preact/hooks'
import { compareHref, previousScanOf } from '../../compare-model'
import PdfDownload from '../../pdf/PdfDownload'
import { dayLabel, reportHref, shortUrl } from '../../sites-model'
import type { ViewProps } from '../AppFrame'
import { ago, filterScans, hostOf, NO_FILTER, paged, type ScanFilter } from '../app-model'
import { useShared } from '../data'
import { EmptyBlock, Notice, PageHeader, ScorePill, Skeleton, useNow } from '../ui'

const STATES = ['complete', 'partial', 'running', 'queued', 'failed'] as const

/** Every scan the person made while signed in: filtered, a page of ten at a time, each with its report. */
export default function ScansView({ lang }: ViewProps) {
  const t = APP_UI[lang]
  const s = t.scans
  const states = ACCOUNT_UI[lang].sites.states
  const shared = useShared()
  const now = useNow()
  const [filter, setFilter] = useState<ScanFilter>(NO_FILTER)
  const [page, setPage] = useState(1)

  const results = useMemo(() => filterScans(shared.scans, filter), [shared.scans, filter])
  const view = paged(results, page)
  const filtered = filter.q !== '' || filter.state !== 'all' || filter.siteId !== 'all'
  const Back = lang === 'ar' ? ChevronRight : ChevronLeft
  const Forward = lang === 'ar' ? ChevronLeft : ChevronRight
  const change = (next: Partial<ScanFilter>) => {
    setFilter({ ...filter, ...next })
    setPage(1)
  }

  return (
    <>
      <PageHeader title={t.pages.scans.title} lead={t.pages.scans.lead}>
        {shared.status === 'ready' && (
          <p className="m-0 text-small text-ink-2">{s.keptFor(shared.historyDays)}</p>
        )}
      </PageHeader>
      {shared.status === 'loading' && <Skeleton rows={5} />}
      {shared.status === 'failed' && (
        <Notice text={t.common.failed} retry={shared.reload} action={t.common.retry} />
      )}
      {shared.status === 'ready' && shared.scans.length === 0 && (
        <EmptyBlock title={s.emptyTitle} text={s.emptyText} />
      )}
      {shared.status === 'ready' && shared.scans.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="app-field w-full sm:w-[280px]">
              <label className="sr-only" htmlFor="scans-q">
                {s.filters.search}
              </label>
              <input
                id="scans-q"
                type="search"
                dir="auto"
                placeholder={s.filters.searchPlaceholder}
                value={filter.q}
                onInput={(event) => {
                  change({ q: event.currentTarget.value })
                }}
              />
            </div>
            <label className="app-field w-auto">
              <span className="text-small text-ink-3">{s.filters.state}</span>
              <select
                value={filter.state}
                onChange={(event) => {
                  change({ state: event.currentTarget.value as ScanFilter['state'] })
                }}
              >
                <option value="all">{s.filters.stateAll}</option>
                {STATES.map((state) => (
                  <option key={state} value={state}>
                    {states[state]}
                  </option>
                ))}
              </select>
            </label>
            {shared.sites.length > 0 && (
              <label className="app-field w-auto">
                <span className="text-small text-ink-3">{s.filters.site}</span>
                <select
                  value={filter.siteId}
                  onChange={(event) => {
                    change({ siteId: event.currentTarget.value })
                  }}
                >
                  <option value="all">{s.filters.siteAll}</option>
                  {shared.sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {hostOf(site.url)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {filtered && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setFilter(NO_FILTER)
                  setPage(1)
                }}
              >
                {s.filters.clear}
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <p className="empty-state m-0">{s.none}</p>
          ) : (
            <div className="app-surface overflow-hidden">
              <table className="app-table" data-kind="scans">
                <caption className="sr-only">{t.pages.scans.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">{s.columns.url}</th>
                    <th scope="col">{s.columns.state}</th>
                    <th scope="col">{s.columns.score}</th>
                    <th scope="col">{s.columns.when}</th>
                    <th scope="col">
                      <span className="sr-only">{s.columns.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.items.map((scan) => {
                    const previous = previousScanOf(shared.scans, shared.scans.indexOf(scan))
                    return (
                      <tr key={scan.id}>
                        <td data-cell="url">
                          <bdi
                            dir="ltr"
                            className="block truncate text-body font-semibold text-ink rtl:text-right"
                          >
                            {shortUrl(scan.url)}
                          </bdi>
                        </td>
                        <td data-cell="state" className="text-small text-ink-2">
                          {states[scan.state]}
                        </td>
                        <td data-cell="score">
                          <ScorePill score={scan.score} />
                        </td>
                        <td data-cell="when" className="text-small text-ink-2">
                          <time dateTime={scan.createdAt} title={dayLabel(scan.createdAt, lang)}>
                            {ago(scan.createdAt, now, lang)}
                          </time>
                        </td>
                        <td data-cell="act">
                          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
                            {previous !== null && (
                              <a
                                className="inline-flex min-h-11 items-center text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                                href={compareHref(lang, 'scan', previous.id, scan.id)}
                                aria-label={COMPARE_UI[lang].links.previousScanLabel(
                                  dayLabel(previous.createdAt, lang),
                                )}
                              >
                                {COMPARE_UI[lang].links.previousScan}
                              </a>
                            )}
                            <a
                              className="inline-flex min-h-11 items-center gap-1 text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                              href={reportHref(lang, scan.id)}
                            >
                              {ACCOUNT_UI[lang].sites.openReport}
                              <ExternalLink
                                size={14}
                                aria-hidden="true"
                                className="rtl:-scale-x-100"
                              />
                            </a>
                            {(scan.state === 'complete' || scan.state === 'partial') && (
                              <PdfDownload
                                lang={lang}
                                ask={{ kind: 'scan', id: scan.id }}
                                what={shortUrl(scan.url)}
                                className="flex flex-col gap-1"
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <nav
                className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"
                aria-label={t.pages.scans.title}
              >
                <p className="m-0 text-small text-ink-2" role="status">
                  {s.showing(view.from, view.to, view.total)}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-small text-ink-3">{s.page(view.page, view.pages)}</span>
                  <button
                    type="button"
                    className="btn-white"
                    disabled={view.page <= 1}
                    onClick={() => {
                      setPage(view.page - 1)
                    }}
                  >
                    <Back size={16} aria-hidden="true" />
                    {s.previous}
                  </button>
                  <button
                    type="button"
                    className="btn-white"
                    disabled={view.page >= view.pages}
                    onClick={() => {
                      setPage(view.page + 1)
                    }}
                  >
                    {s.next}
                    <Forward size={16} aria-hidden="true" />
                  </button>
                </div>
              </nav>
            </div>
          )}
        </>
      )}
    </>
  )
}
