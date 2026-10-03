import { URL_ERROR_CODES } from '@arablyzer/api-contract/codes'
import { REPORT } from '@arablyzer/i18n/report'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import { localePath, type Lang } from '@arablyzer/seo/site'
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client'
import { ArrowLeft, ArrowRight, Link2 } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { startScan } from '../api'
import { precheck, type FormError } from '../scan-request'
import { challenge } from '../turnstile'

/**
 * Scan another page, from the report. It sits after the report, at the end of its main column (it
 * is not stuck to the foot of the screen, where it covered what was being read), and starts the
 * scan as the home page's form does, with the same checks and the same Turnstile, and opens its
 * page. A tool's result goes on with that tool: the next page gets the same rules.
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
    <section aria-labelledby="dock-title" className="report-dock flex flex-col gap-3">
      <h2 id="dock-title" className="heading-3 m-0">
        {t.title}
      </h2>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-2">
        <div className="scan-box flex items-center gap-2 p-1.5">
          <Link2 aria-hidden="true" size={20} className="ms-2 shrink-0 text-ink-3" />
          <label htmlFor="dock-url" className="sr-only">
            {t.label}
          </label>
          <input
            id="dock-url"
            name="url"
            type="url"
            // Empty, it takes the page's direction, like its placeholder; typed, a URL is read from
            // the left.
            dir={value === '' ? undefined : 'ltr'}
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellcheck={false}
            placeholder={f.placeholder}
            value={value}
            onInput={(event) => {
              setValue(event.currentTarget.value)
            }}
            onFocus={() => {
              check.warm()
            }}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={error === null ? undefined : 'dock-error'}
            className="h-12 min-w-0 flex-1 bg-transparent px-1 text-body text-ink outline-none placeholder:text-ink-3"
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
        <p id="dock-error" role="alert" className="m-0 px-2 text-small text-serious empty:hidden">
          {message}
        </p>
      </form>
    </section>
  )
}
