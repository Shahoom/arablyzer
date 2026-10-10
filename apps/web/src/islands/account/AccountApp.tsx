import type { AccountSummary, Language } from '@arablyzer/api-contract/codes'
import { ACCOUNT_UI, type AccountProblem } from '@arablyzer/i18n/account'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import { PUBLIC_AUTH_GOOGLE_CLIENT_ID } from 'astro:env/client'
import { LockKeyhole, LogOut, Trash2, TriangleAlert } from 'lucide-preact'
import type { ComponentChildren, RefObject } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  deleteAccount,
  readAccount,
  setLanguage,
  signInWithCredential,
  signOut,
  signOutEverywhere,
  startGoogle,
  type Outcome,
} from '../auth-api'
import { accountHref, problemFromQuery } from '../auth-model'
import GoogleSignIn from './GoogleSignIn'
import AlertsPanel from './AlertsPanel'
import BrandPanel from './BrandPanel'
import PdfPanel from './PdfPanel'
import SitesPanel from './SitesPanel'

interface Props {
  lang: Language
  /** Which page this is: a signed-in visitor of the sign-in page is sent on to their account. */
  page: 'login' | 'account'
}

type View =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'out'; message: 'signed-out' | null }
  | { kind: 'in'; account: AccountSummary }
  | { kind: 'deleted' }

interface Notice {
  readonly problem: AccountProblem
  readonly retryAfterSeconds?: number
}

/**
 * The sign-in and account pages' one island (M4.1): who is signed in decides what it shows. Signed
 * out: Google's button and One Tap. Signed in: the address and name Google gave, the language, the
 * ways out, and deleting the account. Nothing is requested until the page loads, and the pages are
 * the only ones that load it.
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
          setView({ kind: 'out', message: null })
          setNotice({ problem: read.problem, ...retry(read) })
        }
        return
      }
      if (read.value === null) {
        setView({ kind: 'out', message: null })
        if (returned !== null) setNotice({ problem: returned })
        return
      }
      if (page === 'login') {
        window.location.replace(accountHref(lang))
        return
      }
      setView({ kind: 'in', account: read.value })
    })
    return () => {
      live = false
    }
  }, [clientId, lang, page])

  // The account's language is set from the page's, once, so both ways in take the same path.
  const account = view.kind === 'in' ? view.account : null
  useEffect(() => {
    if (account?.language !== null) return
    void setLanguage(lang).then((set) => {
      if (set.ok) setView({ kind: 'in', account: set.value })
    })
  }, [account, lang])

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
    if (page === 'login') {
      window.location.assign(accountHref(lang))
      return
    }
    setView({ kind: 'in', account: signedIn.value })
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

  async function leave(everywhere: boolean) {
    if (busy) return
    setBusy(true)
    setNotice(null)
    const left = await (everywhere ? signOutEverywhere() : signOut())
    setBusy(false)
    if (!left.ok) {
      failed(left)
      return
    }
    setView({ kind: 'out', message: 'signed-out' })
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
      <section className="card flex flex-col gap-4 rounded-card p-card" aria-busy="true">
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
      <section className="card flex flex-col gap-4 rounded-card p-card">
        <h1 ref={heading} tabIndex={-1} className="heading-1 m-0 outline-none">
          {page === 'login' ? t.login.title : t.account.title}
        </h1>
        <p className="m-0 text-body text-ink-2">{t.account.unavailable}</p>
      </section>
    )
  }

  if (view.kind === 'deleted') {
    return (
      <section className="card flex flex-col gap-4 rounded-card p-card">
        <h1 ref={heading} tabIndex={-1} className="heading-1 m-0 outline-none">
          {t.delete.done}
        </h1>
        <p role="status" className="m-0 text-body text-ink-2">
          {t.delete.doneDetail}
        </p>
      </section>
    )
  }

  if (view.kind === 'out') {
    return (
      <section className="card flex flex-col gap-5 rounded-card p-card">
        <h1 ref={heading} tabIndex={-1} className="heading-1 m-0 outline-none">
          {t.login.title}
        </h1>
        {view.message === 'signed-out' && (
          <p role="status" className="m-0 text-body font-semibold text-ink">
            {t.account.signedOut}
          </p>
        )}
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

  return (
    <SignedIn
      lang={lang}
      account={view.account}
      heading={heading}
      busy={busy}
      alert={alert}
      onLeave={(everywhere) => void leave(everywhere)}
      onLanguage={async (language) => {
        if (busy) return
        setBusy(true)
        const set = await setLanguage(language)
        setBusy(false)
        if (set.ok) setView({ kind: 'in', account: set.value })
        else failed(set)
      }}
      onDelete={async () => {
        if (busy) return 'busy'
        setBusy(true)
        setNotice(null)
        const gone = await deleteAccount()
        setBusy(false)
        if (gone.ok) {
          setView({ kind: 'deleted' })
          return 'done'
        }
        if (gone.problem === 'fresh-login-required') return 'fresh'
        failed(gone)
        return 'failed'
      }}
      onSignInAgain={() => void onRedirect()}
    />
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

interface SignedInProps {
  lang: Language
  account: AccountSummary
  heading: RefObject<HTMLHeadingElement>
  busy: boolean
  alert: ComponentChildren
  onLeave: (everywhere: boolean) => void
  onLanguage: (language: Language) => Promise<void>
  onDelete: () => Promise<'busy' | 'done' | 'fresh' | 'failed'>
  onSignInAgain: () => void
}

function SignedIn({
  lang,
  account,
  heading,
  busy,
  alert,
  onLeave,
  onLanguage,
  onDelete,
  onSignInAgain,
}: SignedInProps) {
  const t = ACCOUNT_UI[lang]
  const [stage, setStage] = useState<'idle' | 'confirm' | 'fresh'>('idle')
  const rows: [string, ComponentChildren][] = [
    [t.account.email, <span dir="ltr">{account.email}</span>],
    [t.account.name, <bdi>{account.name === '' ? '—' : account.name}</bdi>],
  ]
  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-5 rounded-card p-card">
        <h1 ref={heading} tabIndex={-1} className="heading-1 m-0 outline-none">
          {t.account.title}
        </h1>
        <p className="lead m-0">{t.account.lead}</p>
        <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-body sm:grid-cols-[max-content_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-2">{label}</dt>
              <dd className="m-0 min-w-0 font-semibold break-words text-ink">{value}</dd>
            </div>
          ))}
          <dt className="text-ink-2">{t.account.language}</dt>
          <dd className="m-0">
            <div role="group" aria-label={t.account.languageHint} className="flex flex-wrap gap-2">
              {(['ar', 'en'] as const).map((language) => (
                <button
                  key={language}
                  type="button"
                  lang={language}
                  aria-pressed={account.language === language}
                  disabled={busy}
                  onClick={() => void onLanguage(language)}
                  className="btn-white aria-pressed:border-indigo aria-pressed:bg-indigo-soft aria-pressed:text-indigo-ink"
                >
                  {language === 'ar' ? 'العربية' : 'English'}
                </button>
              ))}
            </div>
          </dd>
        </dl>
        {alert}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-white"
            disabled={busy}
            onClick={() => {
              onLeave(false)
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            {t.account.signOut}
          </button>
          <button
            type="button"
            className="btn-white"
            disabled={busy}
            onClick={() => {
              onLeave(true)
            }}
          >
            {t.account.signOutEverywhere}
          </button>
        </div>
      </section>

      <SitesPanel lang={lang} />

      <AlertsPanel lang={lang} />

      <PdfPanel lang={lang} />

      <BrandPanel lang={lang} />

      <section
        aria-labelledby="delete-title"
        className="card flex flex-col gap-4 rounded-card p-card"
      >
        <h2 id="delete-title" className="heading-3 m-0">
          {t.delete.title}
        </h2>
        <p className="m-0 text-small text-ink-2">{t.delete.text}</p>
        {stage === 'idle' && (
          <div>
            <button
              type="button"
              className="btn-white"
              disabled={busy}
              onClick={() => {
                setStage('confirm')
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
              {t.delete.open}
            </button>
          </div>
        )}
        {stage === 'confirm' && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void onDelete().then((outcome) => {
                  if (outcome === 'fresh') setStage('fresh')
                })
              }
              className="btn-white border-critical-ink text-critical-ink hover:bg-critical-soft"
            >
              <Trash2 size={16} aria-hidden="true" />
              {busy ? t.delete.working : t.delete.confirm}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => {
                setStage('idle')
              }}
            >
              {t.delete.cancel}
            </button>
          </div>
        )}
        {stage === 'fresh' && (
          <>
            <p role="alert" className="m-0 text-small text-ink-2">
              {t.delete.freshNeeded}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-grad" disabled={busy} onClick={onSignInAgain}>
                {t.delete.signInAgain}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setStage('idle')
                }}
              >
                {t.delete.cancel}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
