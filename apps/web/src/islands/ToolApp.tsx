import { URL_ERROR_CODES } from '@arablyzer/api-contract/codes'
import { REPORT } from '@arablyzer/i18n/report'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import { TOOL_APP } from '@arablyzer/i18n/tool-app'
import type { Report, RuleResult } from '@arablyzer/report-schema'
import { localePath, PATHS, type Lang } from '@arablyzer/seo/site'
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client'
import { ArrowLeft, ArrowRight, Check, Info, Minus, X } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { fetchReport, startScan } from './api'
import { followScan } from './events'
import { Bidi } from './report/Bidi'
import { Evidence } from './report/Evidence'
import { Notices } from './report/Notices'
import { SeverityPill } from './report/ui'
import {
  advance,
  isNote,
  problemsOf,
  START,
  stepsOf,
  toolHeadline,
  toolVerdict,
  worstProblem,
  type Progress as ProgressState,
} from './report-model'
import { askedUrl, precheck, type FormError } from './scan-request'
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
   * What the tool reads, which the note under the form says: the page, robots.txt, browsers, DNS
   * records, the page and its links, robots.txt and the sitemaps, or Chrome's data on real visitors.
   */
  reads: 'html' | 'robots' | 'render' | 'dns' | 'links' | 'sitemap' | 'crux'
}

type Run =
  | { readonly phase: 'running'; readonly id: string; readonly progress: ProgressState }
  | { readonly phase: 'done'; readonly id: string; readonly report: Report }
  | { readonly phase: 'failed'; readonly id: string | null }
  | { readonly phase: 'offline'; readonly id: string }

/** How often a report its scan said it stored is read again before the page gives up. */
const REPORT_TRIES = 4

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * A tool page's tool (BUILD-PLAN §6.1 item 2): the page's address, checked with the tool's rules
 * alone, and its result under the form as the scan runs: each problem with its evidence, or the
 * page passing. The result has its own link, the scan's report page.
 */
export default function ToolApp({ lang, tool, reads, reportsOnly }: Props) {
  const t = TOOL_APP[lang].form
  const f = SCAN_FORM[lang]
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const [starting, setStarting] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
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

  return (
    <div className="flex flex-col gap-8">
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-2.5">
        <label htmlFor="tool-url" className="text-sm font-semibold">
          {t.urlLabel}
        </label>
        <div className="flex flex-col gap-2 sm:h-[60px] sm:flex-row sm:gap-0 sm:border-[1.5px] sm:border-ink sm:bg-white">
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
              error === null ? 'tool-note tool-query-note' : 'tool-error tool-query-note'
            }
            onFocus={() => {
              check.warm()
            }}
            className="h-[52px] min-w-0 grow border-[1.5px] border-ink bg-white px-3.5 font-mono text-base text-ink placeholder:text-ink-3 sm:h-auto sm:border-0 sm:px-[18px] sm:text-[17px]"
          />
          <button
            type="submit"
            disabled={!ready}
            aria-disabled={busy ? true : undefined}
            className="flex h-[52px] shrink-0 cursor-pointer items-center justify-center gap-2.5 bg-ink px-7 text-[17px] font-semibold text-white hover:bg-brand-ink disabled:cursor-wait aria-disabled:cursor-wait sm:h-auto"
          >
            {busy ? t.submitting : t.submit}
            <Forward size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div ref={box} />
        <p id="tool-note" className="m-0 text-sm text-ink-3">
          {t.note[reads]}
        </p>
        <p id="tool-query-note" className="m-0 text-sm text-ink-3">
          {f.queryNote}
        </p>
        <p id="tool-error" role="alert" className="m-0 text-sm text-serious empty:hidden">
          {message}
        </p>
      </form>
      {run !== null && <Result run={run} lang={lang} reportsOnly={reportsOnly} />}
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  )
}

function Result({ run, lang, reportsOnly }: { run: Run; lang: Lang; reportsOnly: boolean }) {
  const t = TOOL_APP[lang].result
  const r = REPORT[lang]
  const frame = 'flex flex-col border border-ink bg-white'
  const head =
    'flex flex-wrap items-center justify-between gap-4 border-b border-rule-soft px-5 py-4 md:px-6'

  if (run.phase === 'running') {
    const steps = stepsOf(run.progress, r.progress).filter((step) => step.key !== 'score')
    return (
      <section aria-labelledby="result-title" className={frame}>
        <div className={head}>
          <h2 id="result-title" className="m-0 text-xl font-semibold">
            {t.running}
          </h2>
        </div>
        <ol className="m-0 flex list-none flex-col p-0">
          {steps.map((step) => (
            <li
              key={step.key}
              className="flex items-center justify-between gap-4 border-b border-rule-soft px-5 py-3 last:border-b-0 md:px-6"
            >
              <span className={step.state === 'waiting' ? 'text-ink-3' : 'font-semibold'}>
                {step.label}
                <span className="sr-only"> ({r.progress.state[step.state]})</span>
              </span>
              {step.state === 'done' && (
                <Check size={16} strokeWidth={2.4} aria-hidden="true" className="text-pass" />
              )}
              {step.state === 'failed' && (
                <X size={16} strokeWidth={2.4} aria-hidden="true" className="text-serious" />
              )}
              {step.state === 'active' && (
                <span aria-hidden="true" className="size-2 bg-ink motion-safe:animate-pulse" />
              )}
            </li>
          ))}
        </ol>
      </section>
    )
  }
  if (run.phase !== 'done') {
    return (
      <section aria-labelledby="result-title" className={frame}>
        <div className="px-5 py-5 md:px-6">
          <h2 id="result-title" className="m-0 text-lg font-semibold text-serious">
            {run.phase === 'offline' ? t.offline : t.failed}
          </h2>
        </div>
      </section>
    )
  }

  const { report, id } = run
  const verdict = toolVerdict(report, reportsOnly)
  // What is listed: the failed rules and those that need a review. A rule that only lists what it
  // finds is listed too, with a label that says it is a note; it is no problem, so it is neither
  // the worst severity nor a reason to point to the fixes.
  const listed = problemsOf(report)
  const worst = worstProblem(report)
  const shareHref = localePath(lang, `/r/${id}`)

  return (
    <section aria-labelledby="result-title" className={frame}>
      <div className={head}>
        <div className="flex flex-wrap items-center gap-3">
          {worst !== undefined && <SeverityPill severity={worst} lang={lang} />}
          <h2 id="result-title" className="m-0 text-xl font-semibold">
            {toolHeadline(report, t, reportsOnly)}
          </h2>
        </div>
        <span dir="ltr" className="font-mono text-[13px] break-all text-ink-3">
          {report.target.url}
        </span>
      </div>
      {report.scan.notices.length > 0 && (
        <div className="border-b border-rule-soft px-5 py-4 md:px-6">
          <Notices notices={report.scan.notices} lang={lang} id="result-notices" level={3} />
        </div>
      )}
      {listed.map((entry) => (
        <article
          key={entry.rule.id}
          aria-labelledby={`result-${entry.rule.id}`}
          className="flex flex-col border-b border-rule-soft"
        >
          <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-5 pt-5 md:px-6">
            <h3 id={`result-${entry.rule.id}`} className="m-0 text-lg leading-snug font-semibold">
              <Bidi text={entry.rule.title[lang]} lang={lang} />
            </h3>
            {isNote(entry.rule) && (
              <span className="text-xs text-ink-3">{r.findings.notDeducted}</span>
            )}
            {entry.rule.status === 'needs-review' && (
              <span className="bg-measure-soft px-2 py-px text-xs text-measure">
                {r.findings.review}
              </span>
            )}
          </header>
          <ul className="m-0 flex list-none flex-col p-0">
            {entry.findings.map((finding) => (
              <li
                key={finding.fingerprint}
                className="flex flex-col gap-3 border-b border-rule-soft px-5 py-5 last:border-b-0 md:px-6"
              >
                <p className="m-0 text-base leading-[1.8]">
                  <Bidi text={finding.message[lang]} lang={lang} />
                </p>
                <Evidence finding={finding} lang={lang} />
              </li>
            ))}
            {entry.rule.findingsOmitted !== undefined && (
              <li className="px-5 py-3 text-sm text-ink-3 md:px-6">
                {r.findings.more(entry.rule.findingsOmitted)}
              </li>
            )}
          </ul>
        </article>
      ))}
      {/* Nothing was checked on a page the site refused to send, or asked us not to check. */}
      {verdict !== 'blocked' && verdict !== 'opted-out' && (
        <Checked rules={report.rules} lang={lang} reportsOnly={reportsOnly} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-ink-3 md:px-6">
        <span className="flex flex-wrap gap-x-2">
          {t.rules(report.rules.length)}
          {report.rules.map((rule) => (
            <a
              key={rule.id}
              href={localePath(lang, PATHS.rule(rule.id))}
              dir="ltr"
              className="font-mono text-ink-2 underline decoration-tick underline-offset-4 hover:text-brand-ink"
            >
              {rule.id}
            </a>
          ))}
        </span>
        <span className="flex flex-wrap gap-x-5 gap-y-1">
          {worst !== undefined && (
            <a href="#fix" className="underline underline-offset-4">
              {t.howToFix}
            </a>
          )}
          <a href={shareHref} className="underline underline-offset-4">
            {t.share}
          </a>
        </span>
      </div>
    </section>
  )
}

const STATUS_STYLE: Readonly<Record<RuleResult['status'], string>> = {
  pass: 'bg-pass-soft text-pass',
  fail: 'bg-serious-soft text-serious',
  'needs-review': 'bg-measure-soft text-measure',
  error: 'bg-moderate-soft text-moderate',
  'not-applicable': 'bg-paper text-ink-3',
}

/**
 * Each rule the tool ran, with what became of it: a green check for a rule that passed alone. A
 * rule that only lists what it finds is not passed or failed: it noted something, or, in a tool
 * whose rules all only list, found nothing (M2.3c review).
 */
function Checked({
  rules,
  lang,
  reportsOnly,
}: {
  rules: readonly RuleResult[]
  lang: Lang
  reportsOnly: boolean
}) {
  const t = TOOL_APP[lang].result
  return (
    <section aria-labelledby="result-checked" className="flex flex-col border-b border-rule-soft">
      <h3
        id="result-checked"
        className="m-0 px-5 pt-4 pb-2 text-sm font-semibold text-ink-3 md:px-6"
      >
        {t.checked}
      </h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {rules.map((rule) => {
          const noted = isNote(rule) && rule.status === 'fail'
          const none = isNote(rule) && rule.status === 'pass' && reportsOnly
          return (
            <li
              key={rule.id}
              className="flex items-start gap-3 border-t border-rule-soft px-5 py-3 md:px-6"
            >
              {noted ? (
                <Info
                  size={16}
                  strokeWidth={2.4}
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-ink-3"
                />
              ) : rule.status === 'pass' && !none ? (
                <Check
                  size={16}
                  strokeWidth={2.4}
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-pass"
                />
              ) : rule.status === 'fail' ? (
                <X
                  size={16}
                  strokeWidth={2.4}
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-serious"
                />
              ) : (
                <Minus
                  size={16}
                  strokeWidth={2.4}
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-ink-3"
                />
              )}
              <span className="grow leading-[1.6]">
                <Bidi text={rule.title[lang]} lang={lang} />
              </span>
              <span
                className={`shrink-0 px-2 py-px text-xs ${
                  noted || none ? 'bg-paper text-ink-2' : STATUS_STYLE[rule.status]
                }`}
              >
                {noted ? t.information.found : none ? t.information.none : t.status[rule.status]}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
