import { URL_ERROR_CODES } from '@arablyzer/api-contract/codes'
import { REPORT } from '@arablyzer/i18n/report'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import { localePath, type Lang } from '@arablyzer/seo/site'
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client'
import { ArrowLeft, ArrowRight, Link2 } from 'lucide-preact'
import type { ComponentChildren, TargetedSubmitEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { startScan } from '../api'
import type { Step } from '../report-model'
import { precheck, type FormError } from '../scan-request'
import { challenge } from '../turnstile'

/**
 * The dock: a band stuck to the foot of the page, over which the thread scrolls and fades. It
 * lets clicks through but for its own box, and `report-dock` is the hook global.css needs to leave
 * room for it when a control is focused behind it.
 */
function Dock({ children }: { children: ComponentChildren }) {
  return (
    <div className="report-dock pointer-events-none sticky bottom-0 z-20 bg-[linear-gradient(to_bottom,transparent,var(--color-bg)_40%)] pt-10 pb-4">
      <div className="pointer-events-auto mx-auto w-full max-w-[860px] px-5 md:px-6">
        {children}
      </div>
    </div>
  )
}

/**
 * Scan another page, from the report (the approved Report design's dock). It starts the scan as
 * the home page's form does, with the same checks and the same Turnstile, and opens its page. A
 * tool's result goes on with that tool: the next page gets the same rules.
 */
export function ScanDock({ lang, tool }: { lang: Lang; tool?: string | undefined }) {
  const t = REPORT[lang].thread.dock
  const f = SCAN_FORM[lang]
  const [value, setValue] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const check = useMemo(() => challenge(PUBLIC_TURNSTILE_SITE_KEY, () => box.current, lang), [lang])
  const Forward = lang === 'ar' ? ArrowLeft : ArrowRight

  // The button stays disabled until the form can handle it, so an early click is not lost.
  useEffect(() => {
    setReady(true)
    // Back from the scan's page, a page the browser kept is shown as it was left: busy.
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false)
    }
    window.addEventListener('pageshow', shown)
    return () => {
      window.removeEventListener('pageshow', shown)
    }
  }, [])

  async function onSubmit(event: TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const checked = precheck(value)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    setError(null)
    setBusy(true)
    let token: string
    try {
      token = await check.token()
    } catch {
      setBusy(false)
      setError({ code: 'turnstile-failed' })
      return
    }
    const started = await startScan({
      url: checked.url,
      turnstileToken: token,
      ...(tool === undefined ? {} : { tool }),
    })
    if (started.ok) {
      window.location.assign(localePath(lang, `/r/${started.id}`))
      return
    }
    setBusy(false)
    setError(started.error)
  }

  // Only the URL itself is invalid; the service being busy or away says nothing about it.
  const invalid =
    error !== null &&
    (error.code === 'empty' || (URL_ERROR_CODES as readonly string[]).includes(error.code))
  const message =
    error === null
      ? ''
      : error.code === 'rate-limited' && error.retryAfterSeconds !== undefined
        ? `${f.errors[error.code]} ${f.retryAfter(error.retryAfterSeconds)}`
        : f.errors[error.code]

  return (
    <Dock>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-lg focus-within:border-indigo focus-within:ring-4 focus-within:ring-indigo/15">
          <Link2 aria-hidden="true" size={20} className="ms-2 shrink-0 text-ink-3" />
          <label htmlFor="dock-url" className="sr-only">
            {t.label}
          </label>
          <input
            id="dock-url"
            name="url"
            type="url"
            // Empty, it takes the page's direction, like its Arabic placeholder; typed, a URL is read
            // from the left.
            dir={value === '' ? undefined : 'ltr'}
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellcheck={false}
            placeholder={t.placeholder}
            value={value}
            onInput={(event) => {
              setValue(event.currentTarget.value)
            }}
            onFocus={() => {
              check.warm()
            }}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={error === null ? undefined : 'dock-error'}
            className="h-11 min-w-0 flex-1 bg-transparent px-1 text-base text-ink outline-none placeholder:text-ink-3 sm:text-[17px]"
          />
          <button
            type="submit"
            // Disabled only before the form works; while it sends, it keeps focus and ignores clicks.
            disabled={!ready}
            aria-disabled={busy ? true : undefined}
            className="btn-grad shrink-0 disabled:cursor-wait aria-disabled:cursor-wait"
          >
            {busy ? f.submitting : t.submit}
            <Forward size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div ref={box} className="empty:hidden" />
        <p id="dock-error" role="alert" className="m-0 px-2 text-sm text-serious empty:hidden">
          {message}
        </p>
      </form>
    </Dock>
  )
}

/**
 * The scan box while a scan runs: the address it reads, which step it is on, and the reading beam
 * sweeping across it, from the start of the line to its end, the way the page is read. The beam
 * and the ring's turning stop under reduced motion; the words, the step count and the track stay.
 */
export function ProgressDock({
  lang,
  url,
  steps,
}: {
  lang: Lang
  url: string
  steps: readonly Step[]
}) {
  const t = REPORT[lang]
  const active = steps.findIndex((step) => step.state === 'active')
  const done = steps.filter((step) => step.state === 'done').length
  // Between the steps done and the one under way, so the track moves before the first is over.
  const ratio = steps.length === 0 ? 0 : (done + (active >= 0 ? 0.5 : 0)) / steps.length
  const at = active >= 0 ? active + 1 : Math.max(1, done)
  return (
    <Dock>
      <div className="scan-ring">
        <div aria-busy="true" className="reading-beam rounded-2xl bg-surface forced-colors:border">
          <div className="relative z-[1] flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <Link2 aria-hidden="true" size={20} className="shrink-0 text-ink-3" />
              <span
                dir="ltr"
                className="min-w-0 text-lg break-all text-ink [overflow-wrap:anywhere]"
              >
                {url}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-brand-ink">
                {active >= 0 ? steps[active]?.label : t.progress.waitingStart}
              </span>
              <span className="shrink-0 text-ink-3 tabular-nums">
                {t.thread.stepOf(at, steps.length)}
              </span>
            </div>
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-brand bg-(image:--gradient-btn) transition-[width] duration-500"
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Dock>
  )
}
