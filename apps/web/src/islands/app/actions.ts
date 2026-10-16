import type { CrawlSummary, SiteSummary } from '@arablyzer/api-contract/codes'
import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import type { Lang } from '@arablyzer/seo/site'
import { useState } from 'preact/hooks'
import { cancelCrawl, startCrawl } from '../crawl-api'
import { precheck } from '../scan-request'
import { addSite, removeSite, scanSite, setMonitor, type SiteOutcome } from '../sites-api'
import { reportHref, type SiteProblem } from '../sites-model'
import { useShared } from './data'

export interface Notice {
  readonly problem: SiteProblem
  readonly retryAfterSeconds?: number
}

const retry = (outcome: { retryAfterSeconds?: number }): { retryAfterSeconds?: number } =>
  outcome.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: outcome.retryAfterSeconds }

/** What a refusal says, in the words the account page has always used for it. */
export function noticeText(lang: Lang, notice: Notice, monitorLimit: number): string {
  const form = SCAN_FORM[lang]
  const account = ACCOUNT_UI[lang]
  const wait =
    notice.retryAfterSeconds === undefined ? '' : ` ${form.retryAfter(notice.retryAfterSeconds)}`
  if (notice.problem === 'empty') return form.errors.empty
  if (notice.problem === 'monitor-limit') return account.monitor.limitReached(monitorLimit)
  if (notice.problem in form.errors && notice.problem !== 'network') {
    return `${form.errors[notice.problem as keyof typeof form.errors]}${wait}`
  }
  return `${account.problems[notice.problem as keyof typeof account.problems]}${wait}`
}

/**
 * What a person can do to a saved site from the dashboard, once, for every page that offers it: add,
 * remove, scan, watch, crawl. One request at a time (`busy` names it); a refusal is `notice`. The
 * sites in the shared data change as soon as the API says yes.
 */
export function useSiteActions(lang: Lang) {
  const shared = useShared()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const fail = (outcome: Extract<SiteOutcome<unknown>, { ok: false }>) => {
    setNotice({ problem: outcome.problem, ...retry(outcome) })
  }
  const setCrawl = (siteId: string, crawl: CrawlSummary | null) => {
    shared.patchSites((sites) =>
      sites.map((site) => (site.id === siteId ? { ...site, crawl } : site)),
    )
  }

  return {
    busy,
    notice,
    message: notice === null ? null : noticeText(lang, notice, shared.limits.monitored),
    clear: () => {
      setNotice(null)
    },
    async add(value: string): Promise<boolean> {
      if (busy !== null) return false
      const checked = precheck(value)
      if (!checked.ok) {
        setNotice({ problem: checked.error.code })
        return false
      }
      setNotice(null)
      setBusy('add')
      const added = await addSite(checked.url)
      setBusy(null)
      if (!added.ok) {
        fail(added)
        return false
      }
      shared.patchSites((sites) =>
        sites.some((site) => site.id === added.value.id) ? sites : [...sites, added.value],
      )
      return true
    },
    async remove(site: SiteSummary): Promise<boolean> {
      if (busy !== null) return false
      setNotice(null)
      setBusy(`remove:${site.id}`)
      const gone = await removeSite(site.id)
      setBusy(null)
      if (!gone.ok) {
        fail(gone)
        return false
      }
      shared.patchSites((sites) => sites.filter((kept) => kept.id !== site.id))
      return true
    },
    async scan(site: SiteSummary): Promise<void> {
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
    },
    async toggleMonitor(site: SiteSummary): Promise<void> {
      if (busy !== null) return
      const used = shared.sites.filter(
        (kept) => kept.monitor !== null && !kept.monitor.paused,
      ).length
      if (site.monitor === null && used >= shared.limits.monitored) {
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
      shared.patchSites((sites) =>
        sites.map((kept) => (kept.id === site.id ? { ...kept, monitor: changed.value } : kept)),
      )
    },
    async startCrawl(site: SiteSummary): Promise<void> {
      if (busy !== null) return
      setNotice(null)
      setBusy(`crawl:${site.id}`)
      const started = await startCrawl(site.id)
      setBusy(null)
      if (!started.ok) {
        fail(started)
        return
      }
      setCrawl(site.id, started.value)
    },
    async cancelCrawl(site: SiteSummary): Promise<void> {
      if (busy !== null || site.crawl === null) return
      setNotice(null)
      setBusy(`crawl:${site.id}`)
      const cancelled = await cancelCrawl(site.crawl.id)
      setBusy(null)
      if (!cancelled.ok) {
        fail(cancelled)
        return
      }
      setCrawl(site.id, cancelled.value)
    },
    setCrawl,
  }
}
