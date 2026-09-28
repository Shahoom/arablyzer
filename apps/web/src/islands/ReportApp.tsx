import { SCAN_ID_PATTERN, type ScanSummary } from '@arablyzer/api-contract/codes'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { useEffect, useState } from 'react'
import { fetchReport, fetchSummary } from './api'
import { followScan } from './events'
import { Progress } from './report/Progress'
import { ReportView, type Fixes } from './report/ReportView'
import { StateCard } from './report/StateCard'
import { advance, outcomeOf, START, type Progress as ProgressState } from './report-model'

type View =
  | { readonly kind: 'loading' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'offline'; readonly url: string | null }
  | { readonly kind: 'progress'; readonly summary: ScanSummary; readonly progress: ProgressState }
  | {
      readonly kind: 'report'
      readonly id: string
      readonly report: Report
      readonly fixes: Fixes | null
    }
  | { readonly kind: 'failed'; readonly summary: ScanSummary }

/** The scan's ID, the last part of /r/{id} or /en/r/{id}. */
export function idFromPath(pathname: string): string | null {
  const last =
    pathname
      .split('/')
      .filter((part) => part !== '')
      .at(-1) ?? ''
  return SCAN_ID_PATTERN.test(last) ? last : null
}

/** The rules' "how to fix" sections in the page's language, loaded with the report. */
async function loadFixes(lang: Lang): Promise<Fixes | null> {
  try {
    const module = (await (lang === 'ar'
      ? import('../generated/rules.ar.json')
      : import('../generated/rules.en.json'))) as { default: Fixes }
    return module.default
  } catch {
    return null
  }
}

/** /r/{id}: the scan while it runs, then its report, or what went wrong (M2.1 plan §5). */
export default function ReportApp({ lang }: { lang: Lang }) {
  const [view, setView] = useState<View>({ kind: 'loading' })

  useEffect(() => {
    const id = idFromPath(window.location.pathname)
    if (id === null) {
      setView({ kind: 'missing' })
      return
    }
    let active = true
    // Read afresh after each await: the page may have been left meanwhile.
    const left = () => !active
    let stop: () => void = () => undefined
    const showReport = async (summary: ScanSummary) => {
      const [loaded, fixes] = await Promise.all([fetchReport(id), loadFixes(lang)])
      if (left()) return
      if (loaded.ok) setView({ kind: 'report', id, report: loaded.value, fixes })
      else if (loaded.reason === 'missing') setView({ kind: 'failed', summary })
      else setView({ kind: 'offline', url: summary.url })
    }
    void (async () => {
      const summary = await fetchSummary(id)
      if (left()) return
      if (!summary.ok) {
        setView(summary.reason === 'missing' ? { kind: 'missing' } : { kind: 'offline', url: null })
        return
      }
      if (summary.value.state !== 'queued' && summary.value.state !== 'running') {
        await showReport(summary.value)
        return
      }
      setView({ kind: 'progress', summary: summary.value, progress: START })
      stop = followScan(
        id,
        (event) => {
          setView((current) =>
            current.kind === 'progress'
              ? { ...current, progress: advance(current.progress, event) }
              : current,
          )
          if (event.type === 'done') void showReport(summary.value)
          if (event.type === 'error') setView({ kind: 'failed', summary: summary.value })
        },
        () => {
          setView({ kind: 'offline', url: summary.value.url })
        },
      )
    })()
    return () => {
      active = false
      stop()
    }
  }, [lang])

  switch (view.kind) {
    case 'loading':
      return <div aria-busy="true" className="min-h-[60vh]" />
    case 'missing':
      return <StateCard kind="missing" lang={lang} />
    case 'offline':
      return <StateCard kind="offline" lang={lang} url={view.url} />
    case 'failed':
      return <StateCard kind="failed" lang={lang} url={view.summary.url} />
    case 'progress':
      return <Progress summary={view.summary} progress={view.progress} lang={lang} />
    case 'report': {
      const outcome = outcomeOf(view.report)
      if (outcome === 'blocked' || outcome === 'failed') {
        return (
          <StateCard
            kind={outcome}
            lang={lang}
            status={view.report.target.http.status}
            url={view.report.target.url}
            notices={outcome === 'failed' ? view.report.scan.notices : []}
          />
        )
      }
      return <ReportView id={view.id} report={view.report} fixes={view.fixes} lang={lang} />
    }
  }
}
