import type { AccountScan, SiteSummary } from '@arablyzer/api-contract/codes'
import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import type { Lang } from '@arablyzer/seo/site'
import { ExternalLink, Globe, Plus, Trash2, TriangleAlert } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { precheck } from '../scan-request'
import {
  addSite,
  listScans,
  listSites,
  removeSite,
  scanSite,
  setMonitor,
  type SiteOutcome,
} from '../sites-api'
import { dayLabel, reportHref, shortUrl, type SiteProblem } from '../sites-model'
import MonitorRow from './MonitorRow'

interface Props {
  lang: Lang
}

interface Notice {
  readonly problem: SiteProblem
  readonly retryAfterSeconds?: number
}

interface Data {
  readonly sites: readonly SiteSummary[]
  readonly limit: number
  readonly monitoring: { readonly limit: number; readonly everyDays: number }
  readonly scans: readonly AccountScan[]
  readonly historyDays: number
}

/**
 * The account page's saved sites and recent scans (M4.2): the list, adding a site, scanning one
 * in a click, and the history with each scan's score and report. Every number on it (the plan's
 * limit, the days a scan is kept) is the API's answer, not a figure of the page's.
 */
export default function SitesPanel({ lang }: Props) {
  const t = ACCOUNT_UI[lang]
  const s = t.sites
  const form = SCAN_FORM[lang]
  const [data, setData] = useState<Data | 'loading' | 'failed'>('loading')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void Promise.all([listSites(), listScans()]).then(([sites, scans]) => {
      if (!live) return
      if (!sites.ok || !scans.ok) {
        setData('failed')
        const failure = !sites.ok ? sites : scans
        if (!failure.ok) setNotice({ problem: failure.problem, ...retry(failure) })
        return
      }
      setData({
        sites: sites.value.sites,
        limit: sites.value.limit,
        monitoring: sites.value.monitoring,
        scans: scans.value.scans,
        historyDays: scans.value.historyDays,
      })
    })
    return () => {
      live = false
    }
  }, [])

  const fail = (outcome: Extract<SiteOutcome<unknown>, { ok: false }>) => {
    setNotice({ problem: outcome.problem, ...retry(outcome) })
  }

  const message = (n: Notice): string => {
    const wait = n.retryAfterSeconds === undefined ? '' : ` ${form.retryAfter(n.retryAfterSeconds)}`
    if (n.problem === 'empty') return form.errors.empty
    if (n.problem === 'monitor-limit') {
      return typeof data === 'string' ? '' : t.monitor.limitReached(data.monitoring.limit)
    }
    if (n.problem in form.errors && n.problem !== 'network') {
      return `${form.errors[n.problem as keyof typeof form.errors]}${wait}`
    }
    return `${t.problems[n.problem as keyof typeof t.problems]}${wait}`
  }

  async function onAdd(event: TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy !== null || typeof data === 'string') return
    const field = event.currentTarget.elements.namedItem('site')
    const value = field instanceof HTMLInputElement ? field.value : ''
    const checked = precheck(value)
    if (!checked.ok) {
      setNotice({ problem: checked.error.code })
      return
    }
    setNotice(null)
    setBusy('add')
    const added = await addSite(checked.url)
    setBusy(null)
    if (!added.ok) {
      fail(added)
      return
    }
    if (field instanceof HTMLInputElement) field.value = ''
    setData((current) =>
      typeof current === 'string' || current.sites.some((site) => site.id === added.value.id)
        ? current
        : { ...current, sites: [...current.sites, added.value] },
    )
  }

  async function onRemove(site: SiteSummary) {
    if (busy !== null) return
    setNotice(null)
    setBusy(site.id)
    const gone = await removeSite(site.id)
    setBusy(null)
    if (!gone.ok) {
      fail(gone)
      return
    }
    setData((current) =>
      typeof current === 'string'
        ? current
        : { ...current, sites: current.sites.filter((kept) => kept.id !== site.id) },
    )
  }

  async function onToggle(site: SiteSummary) {
    if (busy !== null || typeof data === 'string') return
    const used = data.sites.filter((kept) => kept.monitor !== null && !kept.monitor.paused).length
    if (site.monitor === null && used >= data.monitoring.limit) {
      setNotice({ problem: 'monitor-limit' })
      return
    }
    setNotice(null)
    setBusy(`monitor:${site.id}`)
    const changed = await setMonitor(site.id, site.monitor === null)
    setBusy(null)
    if (!changed.ok) {
      // At the plan's limit, whatever the page counted: the same words as before the request.
      if (changed.problem === 'plan-limit') setNotice({ problem: 'monitor-limit' })
      else fail(changed)
      return
    }
    setData((current) =>
      typeof current === 'string'
        ? current
        : {
            ...current,
            sites: current.sites.map((kept) =>
              kept.id === site.id ? { ...kept, monitor: changed.value } : kept,
            ),
          },
    )
  }

  async function onScan(site: SiteSummary) {
    if (busy !== null) return
    setNotice(null)
    setBusy(`scan:${site.id}`)
    const started = await scanSite(site.id)
    if (!started.ok) {
      setBusy(null)
      fail(started)
      return
    }
    window.location.assign(reportHref(lang, started.value.id))
  }

  const alert = notice !== null && (
    <p
      role="alert"
      className="m-0 flex items-start gap-3 rounded-xl bg-moderate-soft p-3 text-small text-ink-2 forced-colors:border"
    >
      <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
      <span className="min-w-0">{message(notice)}</span>
    </p>
  )

  if (data === 'loading') {
    return (
      <section aria-busy="true" className="card flex flex-col gap-3 rounded-card p-card">
        <h2 className="heading-2 m-0">{s.title}</h2>
        <p role="status" className="m-0 text-small text-ink-2">
          {s.loading}
        </p>
      </section>
    )
  }
  if (data === 'failed') {
    return (
      <section className="card flex flex-col gap-3 rounded-card p-card">
        <h2 className="heading-2 m-0">{s.title}</h2>
        {alert}
      </section>
    )
  }

  const full = data.sites.length >= data.limit
  return (
    <>
      <section
        aria-labelledby="sites-title"
        className="card flex flex-col gap-5 rounded-card p-card"
      >
        <div className="flex flex-col gap-2">
          <h2 id="sites-title" className="heading-2 m-0">
            {s.title}
          </h2>
          <p className="m-0 text-body text-ink-2">{s.lead}</p>
          <p className="m-0 text-meta text-ink-2">
            {s.count(data.sites.length, data.limit)} ·{' '}
            {t.monitor.count(
              data.sites.filter((kept) => kept.monitor !== null && !kept.monitor.paused).length,
              data.monitoring.limit,
            )}
          </p>
        </div>

        <form noValidate onSubmit={(event) => void onAdd(event)} className="flex flex-col gap-3">
          <label htmlFor="site-url" className="text-small font-semibold text-ink">
            {s.addLabel}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="search-field grow">
              <Globe size={20} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ink-3" />
              <input
                id="site-url"
                name="site"
                type="url"
                dir="ltr"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellcheck={false}
                placeholder={s.addPlaceholder}
                disabled={busy !== null || full}
                className="h-full min-w-0 grow border-0 bg-transparent text-start text-body text-ink outline-none placeholder:text-ink-3"
              />
            </div>
            <button type="submit" className="btn-grad" disabled={busy !== null || full}>
              <Plus size={18} aria-hidden="true" />
              {busy === 'add' ? s.adding : s.add}
            </button>
          </div>
        </form>
        {alert}

        {data.sites.length === 0 ? (
          <p className="m-0 text-body text-ink-2">{s.empty}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {data.sites.map((site) => (
              <li key={site.id} className="flex flex-col gap-3 rounded-xl border border-line p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <bdi dir="ltr" className="text-body font-semibold break-all text-ink">
                      {shortUrl(site.url)}
                    </bdi>
                    <p className="m-0 text-small text-ink-2">
                      {site.lastScan === null ? (
                        s.notScanned
                      ) : (
                        <>
                          {s.lastScan}: {dayLabel(site.lastScan.createdAt, lang)} ·{' '}
                          {site.lastScan.score === null
                            ? s.states[site.lastScan.state]
                            : `${s.score} ${site.lastScan.score}`}
                          {' · '}
                          <a
                            className="font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                            href={reportHref(lang, site.lastScan.id)}
                          >
                            {s.openReport}
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-white"
                      disabled={busy !== null}
                      onClick={() => void onScan(site)}
                    >
                      {busy === `scan:${site.id}` ? s.scanning : s.scanNow}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-label={s.removeLabel(shortUrl(site.url))}
                      disabled={busy !== null}
                      onClick={() => void onRemove(site)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      {s.remove}
                    </button>
                  </div>
                </div>
                <MonitorRow
                  lang={lang}
                  site={site}
                  busy={busy !== null}
                  working={busy === `monitor:${site.id}`}
                  onToggle={(target) => void onToggle(target)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="history-title"
        className="card flex flex-col gap-4 rounded-card p-card"
      >
        <div className="flex flex-col gap-2">
          <h2 id="history-title" className="heading-3 m-0">
            {s.historyTitle}
          </h2>
          <p className="m-0 text-small text-ink-2">{s.historyLead(data.historyDays)}</p>
        </div>
        {data.scans.length === 0 ? (
          <p className="m-0 text-body text-ink-2">{s.historyEmpty}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {data.scans.map((scan) => (
              <li
                key={scan.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line py-3 first:border-t-0"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <bdi dir="ltr" className="text-small font-semibold break-all text-ink">
                    {shortUrl(scan.url)}
                  </bdi>
                  <span className="text-meta text-ink-2">
                    {dayLabel(scan.createdAt, lang)} · {s.states[scan.state]}
                    {scan.score !== null && ` · ${s.score} ${scan.score}`}
                  </span>
                </div>
                <a
                  className="inline-flex min-h-11 items-center gap-1 text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                  href={reportHref(lang, scan.id)}
                >
                  {s.openReport}
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function retry(outcome: { retryAfterSeconds?: number }): { retryAfterSeconds?: number } {
  return outcome.retryAfterSeconds === undefined
    ? {}
    : { retryAfterSeconds: outcome.retryAfterSeconds }
}
