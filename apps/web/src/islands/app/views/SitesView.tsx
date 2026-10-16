import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import { APP_UI } from '@arablyzer/i18n/app'
import { Globe, Plus, Trash2 } from 'lucide-preact'
import { useState } from 'preact/hooks'
import { shortUrl } from '../../sites-model'
import { useSiteActions } from '../actions'
import { ago, filterRows, siteHref, type SiteFilter, type SiteSort } from '../app-model'
import { useShared } from '../data'
import type { ViewProps } from '../AppFrame'
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

/** The sites table: each site's score, its direction, whether it is watched, and a scan in a click. */
export default function SitesView({ lang }: ViewProps) {
  const t = APP_UI[lang]
  const s = t.sites
  const monitorWords = ACCOUNT_UI[lang].monitor
  const shared = useShared()
  const actions = useSiteActions(lang)
  const now = useNow()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SiteFilter>('all')
  const [sort, setSort] = useState<SiteSort>('recent')
  const [confirming, setConfirming] = useState<string | null>(null)

  const rows = filterRows(shared.rows, query, filter, sort)
  const counts = {
    all: shared.rows.length,
    monitored: shared.rows.filter((row) => row.monitor !== 'off').length,
    unmonitored: shared.rows.filter((row) => row.monitor === 'off').length,
  }
  const full = shared.sites.length >= shared.limits.sites

  return (
    <>
      <PageHeader title={t.pages.sites.title} lead={t.pages.sites.lead}>
        <p className="m-0 text-small text-ink-2">
          {ACCOUNT_UI[lang].sites.count(shared.sites.length, shared.limits.sites)}
        </p>
      </PageHeader>

      <form
        noValidate
        className="mb-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          const field = event.currentTarget.elements.namedItem('site')
          if (!(field instanceof HTMLInputElement)) return
          void actions.add(field.value).then((added) => {
            if (added) field.value = ''
          })
        }}
      >
        <label className="sr-only" htmlFor="site-url">
          {ACCOUNT_UI[lang].sites.addLabel}
        </label>
        <div className="app-field grow">
          <Globe size={18} aria-hidden="true" className="shrink-0" />
          <input
            id="site-url"
            name="site"
            type="url"
            dir="ltr"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellcheck={false}
            placeholder={ACCOUNT_UI[lang].sites.addPlaceholder}
            disabled={actions.busy !== null || full}
            className="text-start"
          />
        </div>
        <button type="submit" className="btn-grad" disabled={actions.busy !== null || full}>
          <Plus size={18} aria-hidden="true" />
          {actions.busy === 'add' ? ACCOUNT_UI[lang].sites.adding : ACCOUNT_UI[lang].sites.add}
        </button>
      </form>
      {full && <p className="mt-0 mb-4 text-small text-ink-2">{s.limit(shared.limits.sites)}</p>}
      {actions.message !== null && (
        <div className="mb-4">
          <Notice text={actions.message} />
        </div>
      )}

      {shared.status === 'loading' && <Skeleton rows={5} />}
      {shared.status === 'failed' && (
        <Notice text={t.common.failed} retry={shared.reload} action={t.common.retry} />
      )}
      {shared.status === 'ready' && shared.sites.length === 0 && (
        <EmptyBlock title={s.emptyTitle} text={s.emptyText} />
      )}
      {shared.status === 'ready' && shared.sites.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="app-field w-full sm:w-[300px]">
              <label className="sr-only" htmlFor="sites-search">
                {s.searchLabel}
              </label>
              <input
                id="sites-search"
                type="search"
                dir="auto"
                placeholder={s.searchPlaceholder}
                value={query}
                onInput={(event) => {
                  setQuery(event.currentTarget.value)
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="app-seg" role="group" aria-label={s.filters.all}>
                {(['all', 'monitored', 'unmonitored'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={filter === key}
                    onClick={() => {
                      setFilter(key)
                    }}
                  >
                    {s.filters[key]}
                    <span className="text-ink-3 tabular-nums">{counts[key]}</span>
                  </button>
                ))}
              </div>
              <label className="app-field w-auto">
                <span className="text-small text-ink-3">{s.sortLabel}</span>
                <select
                  value={sort}
                  onChange={(event) => {
                    setSort(event.currentTarget.value as SiteSort)
                  }}
                >
                  {(['recent', 'worst', 'name'] as const).map((key) => (
                    <option key={key} value={key}>
                      {s.sorts[key]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="empty-state m-0">{s.none(query.trim())}</p>
          ) : (
            <div className="app-surface overflow-hidden">
              <table className="app-table">
                <caption className="sr-only">{t.pages.sites.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">{s.columns.site}</th>
                    <th scope="col">{s.columns.score}</th>
                    <th scope="col">{s.columns.trend}</th>
                    <th scope="col">{s.columns.monitoring}</th>
                    <th scope="col">{s.columns.last}</th>
                    <th scope="col">
                      <span className="sr-only">{s.columns.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const name = shortUrl(row.site.url)
                    const asking = confirming === row.site.id
                    return (
                      <tr key={row.site.id}>
                        <td data-cell="site">
                          <div className="flex min-w-0 items-center gap-3">
                            <SiteTile url={row.site.url} />
                            <div className="flex min-w-0 flex-col">
                              <a
                                href={siteHref(lang, row.site.id)}
                                dir="ltr"
                                className="truncate text-body font-semibold text-ink hover:underline rtl:text-right"
                              >
                                {row.host}
                              </a>
                              <span
                                dir="ltr"
                                className="truncate text-meta text-ink-3 rtl:text-right"
                              >
                                {name}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td data-cell="score">
                          <div className="flex items-center gap-2">
                            <ScorePill score={row.score} />
                            <Delta change={row.delta} />
                          </div>
                        </td>
                        <td data-cell="trend">
                          <Spark
                            series={row.series}
                            lang={lang}
                            label={t.common.trendLabel(name, row.series.join(', '))}
                          />
                        </td>
                        <td data-cell="mon">
                          <span
                            className="app-pill"
                            data-tone={
                              row.monitor === 'monitored'
                                ? 'on'
                                : row.monitor === 'off'
                                  ? undefined
                                  : 'warn'
                            }
                          >
                            <i />
                            {row.monitor === 'off'
                              ? t.common.notMonitored
                              : row.monitor === 'paused'
                                ? t.common.paused
                                : row.monitor === 'failing'
                                  ? t.common.failing
                                  : monitorWords.on(row.site.monitor?.everyDays ?? 0)}
                          </span>
                        </td>
                        <td data-cell="last" className="text-small text-ink-2">
                          {row.lastAt === null ? (
                            t.common.neverScanned
                          ) : (
                            <time dateTime={row.lastAt}>{ago(row.lastAt, now, lang)}</time>
                          )}
                        </td>
                        <td data-cell="act">
                          {asking ? (
                            <div
                              className="flex flex-wrap items-center justify-end gap-2"
                              role="group"
                              aria-label={s.removeConfirm(name)}
                            >
                              <span className="text-small text-ink-2">{s.removeConfirm(name)}</span>
                              <button
                                type="button"
                                className="btn-white border-critical-ink text-critical-ink"
                                disabled={actions.busy !== null}
                                onClick={() =>
                                  void actions.remove(row.site).then(() => {
                                    setConfirming(null)
                                  })
                                }
                              >
                                {s.removeYes}
                              </button>
                              <button
                                type="button"
                                className="btn-ghost"
                                onClick={() => {
                                  setConfirming(null)
                                }}
                              >
                                {s.removeNo}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                className="btn-white"
                                disabled={actions.busy !== null}
                                onClick={() => void actions.scan(row.site)}
                              >
                                {actions.busy === `scan:${row.site.id}`
                                  ? t.common.scanning
                                  : t.common.scanNow}
                              </button>
                              <button
                                type="button"
                                className="btn-ghost px-3"
                                aria-label={ACCOUNT_UI[lang].sites.removeLabel(name)}
                                disabled={actions.busy !== null}
                                onClick={() => {
                                  setConfirming(row.site.id)
                                }}
                              >
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
