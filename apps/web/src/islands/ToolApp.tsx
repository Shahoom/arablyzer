import { URL_ERROR_CODES } from '@arablyzer/api-contract/codes'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import { TOOL_APP } from '@arablyzer/i18n/tool-app'
import type { Lang } from '@arablyzer/seo/site'
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client'
import { ArrowLeft, ArrowRight, Link2 } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { fetchReport, startScan } from './api'
import { followScan } from './events'
import { advance, START, toolHeadline } from './report-model'
import { askedUrl, precheck, type FormError } from './scan-request'
import { ScanNote } from './ScanNote'
import { ToolBox } from './ToolBox'
import { setRun, useRun } from './tool-run'
import { challenge } from './turnstile'

interface Props {
  lang: Lang
  /** The tool's slug: its scan runs its rules alone (M2.2). */
  tool: string
  /**
   * Whether every rule of the tool only lists what it finds (information): its result counts
   * notes, never problems, and says "nothing found" where a tool that judges says the page passes.
   */
  reportsOnly: boolean
  /**
   * What the tool reads, which the line under the field says: the page, robots.txt, browsers, DNS
   * records, the page and its links, robots.txt and the sitemaps, or Chrome's data on real visitors.
   */
  reads: 'html' | 'robots' | 'render' | 'dns' | 'links' | 'sitemap' | 'crux' | 'search' | 'outside'
  /** The tool's name, for the label of its box, and the colour of its category's dot. */
  title: string
  dot: string
  /** What the tool reads, in a word or two, for the line under the field: «HTML», «DNS». */
  readsLabel: string
}

/** The browsers a tool that renders the page opens it in, each with its dot. */
const ENGINES = [
  { name: 'Chromium', dot: 'bg-blue' },
  { name: 'Firefox', dot: 'bg-cat-prices' },
  { name: 'WebKit', dot: 'bg-cat-fonts' },
] as const

/** How often a report its scan said it stored is read again before the page gives up. */
const REPORT_TRIES = 4

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * A tool page's tool (BUILD-PLAN §6.1 item 2): the page's address, checked with the tool's rules
 * alone. This is its box, in the aside of the page; the check's progress and result are
 * ToolResult's, at the head of the main column, and the two share the run (tool-run.ts). The result
 * has its own link, the scan's report page.
 */
export default function ToolApp({ lang, tool, reads, reportsOnly, title, dot, readsLabel }: Props) {
  const t = TOOL_APP[lang].form
  const f = SCAN_FORM[lang]
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const [starting, setStarting] = useState(false)
  const run = useRun()
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const stopFollowing = useRef<(() => void) | null>(null)
  const check = useMemo(() => challenge(PUBLIC_TURNSTILE_SITE_KEY, () => box.current, lang), [lang])
  const Forward = lang === 'ar' ? ArrowLeft : ArrowRight

  useEffect(() => {
    setReady(true)
    // A link with ?url= fills the form, as "Scan again" does on the home page.
    const asked = askedUrl(window.location.search)
    if (asked !== null && field.current !== null && field.current.value === '') {
      field.current.value = asked
    }
    return () => {
      stopFollowing.current?.()
    }
  }, [])

  function follow(id: string) {
    stopFollowing.current?.()
    let active = true
    // Read afresh after each await: the page may have started another check meanwhile.
    const left = () => !active
    const showReport = async () => {
      for (let attempt = 0; attempt < REPORT_TRIES; attempt++) {
        const loaded = await fetchReport(id)
        if (left()) return
        if (loaded.ok) {
          setRun({ phase: 'done', id, report: loaded.value })
          return
        }
        if (loaded.reason === 'missing') break
        await wait(1000 * 2 ** attempt)
        if (left()) return
      }
      setRun({ phase: 'failed', id })
    }
    // A failed scan may still have a report, which says why, such as a site's opt-out, which can
    // end a scan before this page opens its stream: it is read as any other, and a scan without
    // one is shown as failed.
    const ended = () => {
      void showReport()
    }
    const stop = followScan(id, {
      onFollowing: () => undefined,
      onEvent: (event) => {
        setRun((current) =>
          current?.phase === 'running' && current.id === id
            ? { ...current, progress: advance(current.progress, event) }
            : current,
        )
        if (event.type === 'done') void showReport()
        if (event.type === 'error') setRun({ phase: 'failed', id })
      },
      onEnded: ended,
      onMissing: () => {
        setRun({ phase: 'failed', id })
      },
      onReachable: (reachable) => {
        setRun((current) =>
          current?.id !== id
            ? current
            : !reachable && current.phase === 'running'
              ? { phase: 'offline', id }
              : reachable && current.phase === 'offline'
                ? { phase: 'running', id, progress: START }
                : current,
        )
      },
    })
    stopFollowing.current = () => {
      active = false
      stop()
    }
  }

  async function onSubmit(event: TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (starting || run?.phase === 'running') return
    const value = new FormData(event.currentTarget).get('url')
    const checked = precheck(typeof value === 'string' ? value : '')
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setError(null)
    setStarting(true)
    let token: string
    try {
      token = await check.token()
    } catch {
      setStarting(false)
      setError({ code: 'turnstile-failed' })
      return
    }
    const started = await startScan({ url: checked.url, turnstileToken: token, tool })
    setStarting(false)
    if (!started.ok) {
      setError(started.error)
      return
    }
    setRun({ phase: 'running', id: started.id, progress: START })
    follow(started.id)
  }

  const invalid =
    error !== null &&
    (error.code === 'empty' || (URL_ERROR_CODES as readonly string[]).includes(error.code))
  const message =
    error === null
      ? ''
      : error.code === 'rate-limited' && error.retryAfterSeconds !== undefined
        ? `${f.errors[error.code]} ${f.retryAfter(error.retryAfterSeconds)}`
        : f.errors[error.code]
  const busy = starting || run?.phase === 'running'
  // Said to a screen reader as the check goes, in one line: that it runs, then its headline. The
  // result itself is read like the rest of the page, not aloud as it changes.
  const r = TOOL_APP[lang].result
  const said =
    run === null
      ? ''
      : run.phase === 'running'
        ? r.running
        : run.phase === 'done'
          ? toolHeadline(run.report, r, reportsOnly)
          : run.phase === 'offline'
            ? r.offline
            : r.failed
  // What the box's disclosure says beside what is kept: what the tool sends to a host that is not
  // ours. Only the DNS tool and the search test do.
  const sentOut =
    reads === 'dns'
      ? t.sentOut.dns
      : reads === 'search'
        ? t.sentOut.search
        : reads === 'outside'
          ? t.sentOut[tool]
          : undefined

  return (
    <>
      <ToolBox
        title={title}
        dot={dot}
        busy={busy}
        note={
          <ScanNote
            lang={lang}
            id="tool-note"
            keep={sentOut === undefined ? [f.queryNote] : [f.queryNote, sentOut]}
          />
        }
      >
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-3">
          {/* The address in a 48 px field with its link icon: the focus ring is the row's. */}
          <div className="flex h-12 items-center gap-2.5 rounded-xl border border-field bg-white px-3.5 text-ink-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo">
            <Link2 size={20} strokeWidth={1.9} aria-hidden="true" className="shrink-0" />
            <label htmlFor="tool-url" className="sr-only">
              {t.urlLabel}
            </label>
            <input
              ref={field}
              id="tool-url"
              name="url"
              type="url"
              dir="ltr"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellcheck={false}
              placeholder={f.placeholder}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={
                error === null
                  ? 'tool-reads tool-note-keep'
                  : 'tool-error tool-reads tool-note-keep'
              }
              onFocus={() => {
                check.warm()
              }}
              className={`h-full min-w-0 grow border-0 bg-transparent font-mono text-body text-ink outline-none placeholder:text-ink-3 ${lang === 'ar' ? 'text-end' : 'text-start'}`}
            />
          </div>
          <div ref={box} className="empty:hidden" />
          <p id="tool-error" role="alert" className="m-0 text-small text-serious empty:hidden">
            {message}
          </p>
          {reads === 'render' ? (
            <p
              id="tool-reads"
              className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-2"
            >
              <span>{t.rendersIn}</span>
              {ENGINES.map((engine) => (
                <span
                  key={engine.name}
                  lang="en"
                  dir="ltr"
                  className="inline-flex items-center gap-1.5"
                >
                  <span aria-hidden="true" className={`size-1.5 rounded-full ${engine.dot}`} />
                  {engine.name}
                </span>
              ))}
            </p>
          ) : (
            <p id="tool-reads" className="m-0 text-meta text-ink-2">
              {t.reads} <bdi>{readsLabel}</bdi>
            </p>
          )}
          <button
            type="submit"
            disabled={!ready}
            aria-disabled={busy ? true : undefined}
            className="btn-grad btn-lg w-full disabled:cursor-wait aria-disabled:cursor-wait"
          >
            {busy ? t.submitting : t.submit}
            <Forward size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </form>
      </ToolBox>
      <p role="status" className="sr-only">
        {said}
      </p>
    </>
  )
}
