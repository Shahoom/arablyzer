import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import { localePath, type Lang } from '@arablyzer/seo/site'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect, useState, type SubmitEvent } from 'react'
import { startScan } from './api'
import { precheck, type FormError } from './scan-request'

interface Props {
  lang: Lang
  /** The input's id; the page has two forms, so each needs its own. */
  inputId: string
  /** On the paper, or on the dark panel of the closing call to action. */
  tone: 'paper' | 'panel'
}

const TONE = {
  paper: {
    label: 'text-ink',
    row: 'sm:border-2 sm:border-ink sm:bg-white sm:shadow-key',
    input: 'border-[1.5px] border-ink sm:border-0',
    button: 'bg-ink hover:bg-signal',
    error: 'text-signal',
  },
  panel: {
    label: 'text-panel-soft',
    row: 'sm:border-2 sm:border-white sm:bg-white',
    input: 'border-0',
    button: 'bg-signal hover:bg-critical',
    error: 'text-panel-signal',
  },
} as const

/** The scan form: checks what it can, asks the API to start the scan, and opens its page. */
export default function ScanForm({ lang, inputId, tone }: Props) {
  const t = SCAN_FORM[lang]
  const style = TONE[tone]
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FormError | null>(null)
  const errorId = `${inputId}-error`
  const Forward = lang === 'ar' ? ArrowLeft : ArrowRight

  // The button stays disabled until the form can handle it, so an early click is not lost.
  useEffect(() => {
    setReady(true)
  }, [])

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
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
    // Turnstile's token comes with the API (M2.1b).
    const started = await startScan({ url: checked.url, turnstileToken: '' })
    if (started.ok) {
      window.location.assign(localePath(lang, `/r/${started.id}`))
      return
    }
    setBusy(false)
    setError(started.error)
  }

  const message =
    error === null
      ? ''
      : error.code === 'rate-limited' && error.retryAfterSeconds !== undefined
        ? `${t.errors[error.code]} ${t.retryAfter(error.retryAfterSeconds)}`
        : t.errors[error.code]

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-2.5">
      <label htmlFor={inputId} className={`text-sm font-semibold ${style.label}`}>
        {t.label}
      </label>
      <div className={`flex flex-col gap-2 sm:h-[66px] sm:flex-row sm:gap-0 ${style.row}`}>
        <input
          id={inputId}
          name="url"
          type="url"
          dir="ltr"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t.placeholder}
          aria-invalid={error === null ? undefined : true}
          aria-describedby={error === null ? undefined : errorId}
          className={`h-[54px] min-w-0 grow bg-white px-3.5 font-mono text-base text-ink placeholder:text-ink-3 sm:h-auto sm:px-5 sm:text-lg ${style.input}`}
        />
        <button
          type="submit"
          disabled={!ready || busy}
          className={`flex h-[54px] shrink-0 cursor-pointer items-center justify-center gap-2.5 px-[30px] text-[17px] font-semibold text-white disabled:cursor-wait sm:h-auto sm:text-lg ${style.button}`}
        >
          {busy ? t.submitting : t.submit}
          <Forward size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <p id={errorId} role="alert" className={`text-sm ${style.error}`}>
        {message}
      </p>
    </form>
  )
}
