import type { AccountScan, AccountSummary, SiteSummary } from '@arablyzer/api-contract/codes'
import type { Lang } from '@arablyzer/seo/site'
import { createContext, type ComponentChildren } from 'preact'
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks'
import { isActive, POLL_MS } from '../crawl-model'
import { listScans, listSites } from '../sites-api'
import type { SiteProblem } from '../sites-model'
import { siteRows, type SiteRow } from './app-model'

/** What the plan allows of what the sites page and the overview count. */
export interface Limits {
  readonly sites: number
  readonly monitored: number
  readonly monitorEveryDays: number
  readonly crawlPages: number
}

export interface Shared {
  readonly lang: Lang
  readonly account: AccountSummary
  /** `loading` until the first answer; `failed` when the sites or the scans could not be read. */
  readonly status: 'loading' | 'ready' | 'failed'
  readonly problem: SiteProblem | null
  readonly sites: readonly SiteSummary[]
  readonly rows: readonly SiteRow[]
  readonly scans: readonly AccountScan[]
  readonly limits: Limits
  readonly historyDays: number
  /** Asks again, quietly: the lists stay as they are until the answer. */
  readonly reload: () => void
  /** Changes the sites in place after something the person did, with no second request. */
  readonly patchSites: (change: (sites: readonly SiteSummary[]) => readonly SiteSummary[]) => void
  /** Puts a new scan at the head of the history, as a scan started in this page does. */
  readonly addScan: (scan: AccountScan) => void
}

const NONE: Limits = { sites: 0, monitored: 0, monitorEveryDays: 0, crawlPages: 0 }

const Context = createContext<Shared | null>(null)

export function useShared(): Shared {
  const value = useContext(Context)
  if (value === null) throw new Error('useShared outside the dashboard')
  return value
}

/** The shared data where there is some: the shell draws before the person is known, and then has none. */
export function useSharedMaybe(): Shared | null {
  return useContext(Context)
}

interface Props {
  lang: Lang
  account: AccountSummary
  children: ComponentChildren
}

/**
 * The sites and the history, read once for the whole shell: the switcher, the search, the menu's
 * counts and every page share them, so none of them asks twice. While a deep crawl is under way the
 * sites are read again on the crawl's own beat, wherever the person is.
 */
export function SharedProvider({ lang, account, children }: Props) {
  const [sites, setSites] = useState<readonly SiteSummary[]>([])
  const [scans, setScans] = useState<readonly AccountScan[]>([])
  const [limits, setLimits] = useState<Limits>(NONE)
  const [historyDays, setHistoryDays] = useState(0)
  const [status, setStatus] = useState<Shared['status']>('loading')
  const [problem, setProblem] = useState<SiteProblem | null>(null)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let live = true
    void Promise.all([listSites(), listScans()]).then(([siteRead, scanRead]) => {
      if (!live) return
      if (!siteRead.ok || !scanRead.ok) {
        const failure = !siteRead.ok ? siteRead : scanRead
        setProblem(failure.ok ? 'unavailable' : failure.problem)
        setStatus('failed')
        return
      }
      setSites(siteRead.value.sites)
      setLimits({
        sites: siteRead.value.limit,
        monitored: siteRead.value.monitoring.limit,
        monitorEveryDays: siteRead.value.monitoring.everyDays,
        crawlPages: siteRead.value.crawlPages,
      })
      setScans(scanRead.value.scans)
      setHistoryDays(scanRead.value.historyDays)
      setProblem(null)
      setStatus('ready')
    })
    return () => {
      live = false
    }
  }, [round])

  const crawling = sites.some((site) => site.crawl !== null && isActive(site.crawl.state))
  useEffect(() => {
    if (!crawling) return
    const timer = window.setTimeout(() => {
      void listSites().then((read) => {
        if (read.ok) setSites(read.value.sites)
      })
    }, POLL_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [crawling, sites])

  const reload = useCallback(() => {
    setRound((n) => n + 1)
  }, [])
  const patchSites = useCallback<Shared['patchSites']>((change) => {
    setSites((current) => change(current))
  }, [])
  const addScan = useCallback((scan: AccountScan) => {
    setScans((current) => [scan, ...current.filter((kept) => kept.id !== scan.id)])
  }, [])
  const rows = useMemo(() => siteRows(sites, scans), [sites, scans])

  const value = useMemo<Shared>(
    () => ({
      lang,
      account,
      status,
      problem,
      sites,
      rows,
      scans,
      limits,
      historyDays,
      reload,
      patchSites,
      addScan,
    }),
    [
      lang,
      account,
      status,
      problem,
      sites,
      rows,
      scans,
      limits,
      historyDays,
      reload,
      patchSites,
      addScan,
    ],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}
