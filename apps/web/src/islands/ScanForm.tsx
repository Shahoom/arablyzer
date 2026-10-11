import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import { URL_ERROR_CODES } from '@arablyzer/api-contract/codes'
import { localePath, type Lang } from '@arablyzer/seo/site'
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client'
import { ArrowLeft, ArrowRight, Link } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ENGINE_DOT, ENGINE_NAMES, ENGINE_ORDER } from '../lib/engines'
import { startScan } from './api'
import { askedUrl, precheck, type FormError } from './scan-request'
import { ScanNote } from './ScanNote'
import { challenge } from './turnstile'

interface Props {
  lang: Lang
  /** The input's id: the form's label points at it, and the notes and the error are named from it. */
  inputId: string
  /** What a scan runs, as a chip beside the browsers: «All checks · 61 rules». */
  scope: { readonly label: string; readonly detail: string }
  /** The list of browsers, for a screen reader: the page is opened in these. */
  enginesLabel: string
}

/**
 * The scan form, inside the home page's scan box (M2.6 R2): checks what it can, asks the API to
 * start the scan, and opens its page. The field is the box's first row, with its label for screen
 * readers; the row under it names what a scan runs and has the button.
 */
export default function ScanForm({ lang, inputId, scope, enginesLabel }: Props) {
  const t = SCAN_FORM[lang]
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const errorId = `${inputId}-error`
  const noteId = `${inputId}-note`
  const Forward = lang === 'ar' ? ArrowLeft : ArrowRight
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const check = useMemo(() => challenge(PUBLIC_TURNSTILE_SITE_KEY, () => box.current, lang), [lang])

  // The button stays disabled until the form can handle it, so an early click is not lost.
  useEffect(() => {
    setReady(true)
    // "Scan again", from a report, opens this page with the address: the form starts with it.
    const asked = askedUrl(window.location.search)
    if (asked !== null && field.current !== null && field.current.value === '') {
      field.current.value = asked
    }
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
    const value = new FormData(event.currentTarget).get('url')
    const checked = precheck(typeof value === 'string' ? value : '')
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
    const started = await startScan({ url: checked.url, turnstileToken: token })
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
        ? `${t.errors[error.code]} ${t.retryAfter(error.retryAfterSeconds)}`
        : t.errors[error.code]

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col">
      <label
        htmlFor={inputId}
        className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-0.5 text-ink-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo md:bg-transparent md:px-2 md:pt-2 md:pb-0"
      >
        <Link size={20} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
        <span className="sr-only">{t.label}</span>
        <input
          ref={field}
          id={inputId}
          name="url"
          type="url"
          dir="ltr"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellcheck={false}
          placeholder={t.placeholder}
          onFocus={() => {
            check.warm()
          }}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={error === null ? `${noteId}-keep` : `${errorId} ${noteId}-keep`}
          // The field is typed left to right (an address) and sits against the icon, which is
          // on the start side of the line: against the right edge in Arabic. 18 px on a phone: a
          // field under 16 px makes iOS zoom the page.
          className="min-w-0 flex-1 bg-transparent py-2 text-lg leading-normal text-ink outline-none placeholder:text-ink-3 md:text-[21px] rtl:text-end"
        />
      </label>
      {/* On a phone the button comes right after the field and what a scan runs is one line of
          small print under it; from sm, the chips are on the start side of the row and the button
          on the end side (the DOM keeps the chips first, the button's `order` moves it). */}
      <div className="mt-3 flex flex-col gap-3 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="order-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-meta text-ink-2 sm:order-none sm:gap-2 sm:px-0">
          <span className="inline-flex items-center gap-2 whitespace-nowrap sm:h-[34px] sm:gap-2 sm:rounded-[10px] sm:bg-surface-2 sm:px-3">
            <b className="hidden font-semibold text-ink sm:inline">{scope.label}</b>
            <span>{scope.detail}</span>
          </span>
          <ul
            aria-label={enginesLabel}
            className="m-0 flex min-w-0 list-none flex-wrap items-center gap-x-3 gap-y-1 p-0 sm:gap-2"
          >
            {ENGINE_ORDER.map((engine) => (
              <li
                key={engine}
                lang="en"
                dir="ltr"
                className="inline-flex items-center gap-2 sm:engine-chip"
              >
                <i aria-hidden="true" className={`size-2 rounded-full ${ENGINE_DOT[engine]}`} />
                {ENGINE_NAMES[engine]}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="submit"
          // Disabled only before the form works; while it sends, it keeps focus and ignores clicks.
          disabled={!ready}
          aria-disabled={busy ? true : undefined}
          className="btn-grad btn-lg order-1 w-full shrink-0 disabled:cursor-wait aria-disabled:cursor-wait sm:order-none sm:w-auto"
        >
          {busy ? t.submitting : t.submit}
          <Forward size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 px-1">
        <ScanNote lang={lang} id={noteId} />
      </div>
      <div ref={box} className="mt-2 empty:hidden" />
      <p
        id={errorId}
        role="alert"
        className={`text-small m-0 px-1 text-serious ${message === '' ? '' : 'mt-2'}`}
      >
        {message}
      </p>
    </form>
  )
}
