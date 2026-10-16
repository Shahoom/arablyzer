import type { Language } from '@arablyzer/api-contract/codes'
import { ACCOUNT_UI, type AccountProblem } from '@arablyzer/i18n/account'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import { PUBLIC_AUTH_GOOGLE_CLIENT_ID } from 'astro:env/client'
import { LockKeyhole, TriangleAlert } from 'lucide-preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  readAccount,
  setLanguage,
  signInWithCredential,
  startGoogle,
  type Outcome,
} from '../auth-api'
import { problemFromQuery } from '../auth-model'
import { appHref } from '../app/app-model'
import GoogleSignIn from './GoogleSignIn'

interface Props {
  lang: Language
  /** Which page this is: a signed-in visitor of the sign-in page is sent on to their account. */
  page: 'login' | 'account'
}

type View =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'out' }
  /** Signed in: on its way to the dashboard. */
  | { kind: 'in' }

interface Notice {
  readonly problem: AccountProblem
  readonly retryAfterSeconds?: number
}

/**
 * The sign-in and account pages' one island (M4.1): who is signed in decides what it shows. Signed
 * out: Google's button and One Tap. Signed in: on to the dashboard (M4.9), which has the account's
 * details, its sites and the rest. Nothing is requested until the page loads, and the pages are the
 * only ones that load it.
 */
export default function AccountApp({ lang, page }: Props) {
  const t = ACCOUNT_UI[lang]
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const clientId = PUBLIC_AUTH_GOOGLE_CLIENT_ID ?? ''

  // Who is signed in, and why a sign-in on Google's page ended without an account (?error=).
  useEffect(() => {
    let live = true
    const returned = problemFromQuery(window.location.search)
    if (returned !== null) {
      // The address is the page's alone: nothing of the return stays in it.
      window.history.replaceState(null, '', window.location.pathname)
    }
    if (clientId === '') {
      setView({ kind: 'off' })
      return
    }
    void readAccount().then((read) => {
      if (!live) return
      if (!read.ok) {
        if (read.problem === 'not-found') setView({ kind: 'off' })
        else {
          setView({ kind: 'out' })
          setNotice({ problem: read.problem, ...retry(read) })
        }
        return
      }
      if (read.value === null) {
        setView({ kind: 'out' })
        if (returned !== null) setNotice({ problem: returned })
        return
      }
      // The account's language is set from the page's, once, so both ways in take the same path.
      if (read.value.language === null) void setLanguage(lang)
      setView({ kind: 'in' })
      window.location.replace(appHref(lang, 'overview'))
    })
    return () => {
      live = false
    }
  }, [clientId, lang, page])

  // A change of view puts the reader at its heading, for a screen reader and the keyboard.
  const kind = view.kind
  useEffect(() => {
    if (kind !== 'loading') heading.current?.focus({ preventScroll: true })
  }, [kind])

  const failed = (outcome: Extract<Outcome<unknown>, { ok: false }>) => {
    setNotice({ problem: outcome.problem, ...retry(outcome) })
  }

  async function onCredential(credential: string) {
    if (busy) return
    setBusy(true)
    setNotice(null)
    const signedIn = await signInWithCredential(credential)
    setBusy(false)
    if (!signedIn.ok) {
      failed(signedIn)
      return
    }
    // The dashboard sets the account's language from its own page's, once.
    if (signedIn.value.language === null) await setLanguage(lang)
    window.location.assign(appHref(lang, 'overview'))
  }

  async function onRedirect() {
    if (busy) return
    setBusy(true)
    setNotice(null)
    const started = await startGoogle(lang)
    if (started.ok) {
      window.location.assign(started.value)
      return
    }
    setBusy(false)
    failed(started)
  }

  const text = (problem: AccountProblem, wait?: number) =>
    wait === undefined
      ? t.problems[problem]
      : `${t.problems[problem]} ${SCAN_FORM[lang].retryAfter(wait)}`

  const message = notice === null ? null : text(notice.problem, notice.retryAfterSeconds)
  const alert = message !== null && (
    <p
      role="alert"
      className="m-0 flex items-start gap-3 rounded-xl bg-moderate-soft p-3 text-small text-ink-2 forced-colors:border"
    >
      <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
      <span className="min-w-0">{message}</span>
    </p>
  )

  if (view.kind === 'loading') {
    return (
      <section
        className="card mx-auto flex w-full max-w-[560px] flex-col gap-4 rounded-card p-card"
        aria-busy="true"
      >
        <h1 ref={heading} tabIndex={-1} className="heading-1 m-0 outline-none">
          {page === 'login' ? t.login.title : t.account.title}
        </h1>
        <p role="status" className="m-0 text-small text-ink-2">
          {t.account.loading}
        </p>
      </section>
    )
  }

  if (view.kind === 'off') {
    return (
      <section className="card mx-auto flex w-full max-w-[560px] flex-col gap-4 rounded-card p-card">
        <h1 ref={heading} tabIndex={-1} className="heading-1 m-0 outline-none">
          {page === 'login' ? t.login.title : t.account.title}
        </h1>
        <p className="m-0 text-body text-ink-2">{t.account.unavailable}</p>
      </section>
    )
  }

  if (view.kind === 'out') {
    return (
      <section className="card mx-auto flex w-full max-w-[560px] flex-col gap-5 rounded-card p-card">
        <h1 ref={heading} tabIndex={-1} className="heading-1 m-0 outline-none">
          {t.login.title}
        </h1>
        <p className="lead m-0">{t.login.lead}</p>
        {alert}
        <GoogleSignIn
          lang={lang}
          clientId={clientId}
          onCredential={(credential) => void onCredential(credential)}
          onRedirect={() => void onRedirect()}
          disabled={busy}
        />
        {busy && (
          <p role="status" className="m-0 text-small text-ink-2">
            {t.login.working}
          </p>
        )}
        <Keeps text={t.login.keeps} />
      </section>
    )
  }

  // Signed in: the dashboard is on its way.
  return (
    <section
      className="card mx-auto flex w-full max-w-[560px] flex-col gap-4 rounded-card p-card"
      aria-busy="true"
    >
      <h1 ref={heading} tabIndex={-1} className="heading-1 m-0 outline-none">
        {page === 'login' ? t.login.title : t.account.title}
      </h1>
      <p role="status" className="m-0 text-small text-ink-2">
        {t.account.loading}
      </p>
    </section>
  )
}

/** The wait a refusal came with, in the shape a notice takes. */
function retry(outcome: { retryAfterSeconds?: number }): { retryAfterSeconds?: number } {
  return outcome.retryAfterSeconds === undefined
    ? {}
    : { retryAfterSeconds: outcome.retryAfterSeconds }
}

function Keeps({ text }: { text: string }) {
  return (
    <p className="m-0 flex items-start gap-2 text-meta text-ink-2">
      <LockKeyhole size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      {text}
    </p>
  )
}
