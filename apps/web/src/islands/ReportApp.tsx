import type { ScanSummary } from '@arablyzer/api-contract/codes'
import { REPORT } from '@arablyzer/i18n/report'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { useEffect, useState } from 'preact/hooks'
import type { ToolTitles } from '../lib/tool-data'
import { fetchReport } from './api'
import { followScan } from './events'
import { Progress } from './report/Progress'
import { ReportView, type Fixes } from './report/ReportView'
import { StateCard } from './report/StateCard'
import {
  advance,
  idFromPath,
  outcomeOf,
  START,
  stateNotices,
  type Progress as ProgressState,
} from './report-model'

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
      /** The tool a tool page's scan ran, from the scan's summary, and its name. */
      readonly tool: { readonly slug: string; readonly title: string | null } | undefined
    }
  | { readonly kind: 'failed'; readonly summary: ScanSummary }

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

/** A tool's name in the page's language, loaded with its result's report; null if unknown. */
async function loadToolTitle(slug: string, lang: Lang): Promise<string | null> {
  try {
    const module = (await import('../generated/tool-titles.json')) as { default: ToolTitles }
    return module.default[slug]?.[lang] ?? null
  } catch {
    return null
  }
}

/** How often a report the scan said it stored is read again before the page says it cannot. */
const REPORT_TRIES = 4

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** /r/{id}: the scan while it runs, then its report, or what went wrong (M2.1 plan §5). */
export default function ReportApp({ lang }: { lang: Lang }) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  // Said to a screen reader when the report, or a state, replaces the progress.
  const [said, setSaid] = useState('')

  useEffect(() => {
    const id = idFromPath(window.location.pathname)
    if (id === null) {
      setView({ kind: 'missing' })
      return
    }
    const t = REPORT[lang]
    let active = true
    // Read afresh after each await: the page may have been left meanwhile.
    const left = () => !active
    /** The scan being followed, for what its events and the offline state need. */
    let following: ScanSummary | null = null
    // What a finished scan's page needs is asked for while the scan is being read, not after it: the
    // report, which is there already when the scan ended before the page opened (a shared link's
    // is), and the rules' fixes. Either waits, unused, until the scan says it is done. Asked one
    // after the other, they were two more round trips before the first line of the report.
    const earlyReport = fetchReport(id)
    const fixesLoaded = loadFixes(lang)

    const showFailed = (summary: ScanSummary) => {
      setView({ kind: 'failed', summary })
      setSaid(t.states.failed.title)
    }
    const showOffline = () => {
      setView({ kind: 'offline', url: following?.url ?? null })
      setSaid(t.states.offline.title)
    }
    /**
     * The report: what the early request found, when that is the report or that there is none (the
     * API answers 404 for a scan it does not know and for one that failed, which has no report), and
     * otherwise read now: a report not stored yet answers 409, and a service that does not answer
     * says nothing.
     */
    const readReport = async (first: boolean) => {
      const early = first ? await earlyReport : null
      return early !== null && (early.ok || early.reason === 'missing') ? early : fetchReport(id)
    }
    // The report is stored before its scan says done; a read that fails is tried again.
    const showReport = async (summary: ScanSummary) => {
      for (let attempt = 0; attempt < REPORT_TRIES; attempt++) {
        const slug = summary.tool
        const [loaded, fixes, title] = await Promise.all([
          readReport(attempt === 0),
          fixesLoaded,
          slug === undefined ? null : loadToolTitle(slug, lang),
        ])
        if (left()) return
        if (loaded.ok) {
          const tool = slug === undefined ? undefined : { slug, title }
          setView({ kind: 'report', id, report: loaded.value, fixes, tool })
          setSaid(t.ready)
          return
        }
        if (loaded.reason === 'missing') {
          showFailed(summary)
          return
        }
        await wait(1000 * 2 ** attempt)
        if (left()) return
      }
      showOffline()
    }

    const stop = followScan(id, {
      onFollowing: (summary) => {
        following = summary
        setView({ kind: 'progress', summary, progress: START })
      },
      onEvent: (event) => {
        setView((current) =>
          current.kind === 'progress'
            ? { ...current, progress: advance(current.progress, event) }
            : current,
        )
        if (following === null) return
        if (event.type === 'done') void showReport(following)
        if (event.type === 'error') showFailed(following)
      },
      onEnded: (summary) => {
        following = summary
        void showReport(summary)
      },
      onMissing: () => {
        setView({ kind: 'missing' })
      },
      onReachable: (reachable) => {
        if (!reachable) showOffline()
      },
    })
    return () => {
      active = false
      stop()
    }
  }, [lang])

  return (
    <>
      <Shown view={view} lang={lang} />
      <p className="sr-only" role="status">
        {said}
      </p>
    </>
  )
}

function Shown({ view, lang }: { view: View; lang: Lang }) {
  switch (view.kind) {
    case 'loading':
      // global.css keeps the footer unseen while this is on the page (R7 report).
      return <div aria-busy="true" data-report-loading="" className="min-h-[60vh]" />
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
      if (outcome === 'blocked' || outcome === 'opted-out' || outcome === 'failed') {
        return (
          <StateCard
            kind={outcome}
            lang={lang}
            status={view.report.target.http.status}
            url={view.report.target.url}
            // An opt-out's notice names the site's rule and where it is; a blocked scan's, the
            // bot challenge that blocked it.
            notices={stateNotices(outcome, view.report)}
          />
        )
      }
      return (
        <ReportView
          id={view.id}
          report={view.report}
          fixes={view.fixes}
          lang={lang}
          tool={view.tool}
        />
      )
    }
  }
}
