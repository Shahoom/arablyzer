import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import { APP_UI } from '@arablyzer/i18n/app'
import { LogOut, Trash2 } from 'lucide-preact'
import { useState } from 'preact/hooks'
import { deleteAccount, setLanguage, signOut, signOutEverywhere, startGoogle } from '../../auth-api'
import { loginHref } from '../../auth-model'
import type { ViewProps } from '../AppFrame'
import { appHref } from '../app-model'
import { useShared } from '../data'
import { useUsage } from '../usage'
import { Notice, PageHeader, UsageMeter } from '../ui'

type Stage = 'idle' | 'confirm' | 'fresh' | 'deleted'

/** Who is signed in, what the plan allows and what is used of it, the ways out, and erasing the account. */
export default function AccountView({ lang }: ViewProps) {
  const t = APP_UI[lang]
  const a = t.account
  const words = ACCOUNT_UI[lang]
  const shared = useShared()
  const usage = useUsage()
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [problem, setProblem] = useState<string | null>(null)
  const { account } = shared
  const monitored = shared.sites.filter((site) => site.monitor !== null).length
  const rows: [string, string][] = [
    [a.planRows.savedSites, a.planValues.count(shared.limits.sites)],
    [a.planRows.monitoredSites, a.planValues.count(shared.limits.monitored)],
    [a.planRows.monitorEvery, a.planValues.every(shared.limits.monitorEveryDays)],
    [a.planRows.crawlPages, a.planValues.pages(shared.limits.crawlPages)],
    [
      a.planRows.pdfPerMonth,
      usage?.pdfs == null
        ? '–'
        : usage.pdfs.limit > 0
          ? a.planValues.count(usage.pdfs.limit)
          : a.planValues.none,
    ],
    [
      a.planRows.apiKeys,
      usage?.keys == null
        ? '–'
        : usage.keys.enabled
          ? a.planValues.count(usage.keys.limit)
          : a.planValues.none,
    ],
    [a.planRows.history, shared.historyDays > 0 ? a.planValues.days(shared.historyDays) : '–'],
  ]

  async function leave(everywhere: boolean) {
    if (busy) return
    setBusy(true)
    const left = await (everywhere ? signOutEverywhere() : signOut())
    if (left.ok) window.location.assign(loginHref(lang))
    else {
      setBusy(false)
      setProblem(words.problems[left.problem])
    }
  }

  async function erase() {
    if (busy) return
    setBusy(true)
    setProblem(null)
    const gone = await deleteAccount()
    setBusy(false)
    if (gone.ok) {
      setStage('deleted')
      return
    }
    if (gone.problem === 'fresh-login-required') setStage('fresh')
    else setProblem(words.problems[gone.problem])
  }

  async function again() {
    if (busy) return
    setBusy(true)
    const started = await startGoogle(lang)
    if (started.ok) {
      window.location.assign(started.value)
      return
    }
    setBusy(false)
    setProblem(words.problems[started.problem])
  }

  if (stage === 'deleted') {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col gap-3 py-10">
        <h1 className="m-0 text-2xl font-semibold" tabIndex={-1}>
          {words.delete.done}
        </h1>
        <p role="status" className="m-0 text-body text-ink-2">
          {words.delete.doneDetail}
        </p>
      </div>
    )
  }

  return (
    <>
      <PageHeader title={t.pages.account.title} lead={t.pages.account.lead} />
      {problem !== null && (
        <div className="mb-4">
          <Notice text={problem} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="app-surface p-5" aria-labelledby="ac-profile">
            <h2 id="ac-profile" className="m-0 mb-4 text-[1.0625rem] font-semibold">
              {a.profile}
            </h2>
            <dl className="m-0 grid grid-cols-[max-content_1fr] items-baseline gap-x-6 gap-y-3 text-small">
              <dt className="text-ink-2">{words.account.email}</dt>
              <dd className="m-0 min-w-0 font-semibold break-words text-ink">
                <span dir="ltr">{account.email}</span>
              </dd>
              <dt className="text-ink-2">{words.account.name}</dt>
              <dd className="m-0 min-w-0 font-semibold break-words text-ink">
                <bdi>{account.name === '' ? '—' : account.name}</bdi>
              </dd>
              <dt className="text-ink-2">{words.account.language}</dt>
              <dd className="m-0">
                <div
                  role="group"
                  aria-label={words.account.languageHint}
                  className="flex flex-wrap gap-2"
                >
                  {(['ar', 'en'] as const).map((language) => (
                    <button
                      key={language}
                      type="button"
                      lang={language}
                      aria-pressed={account.language === language}
                      disabled={busy}
                      onClick={() => {
                        setBusy(true)
                        void setLanguage(language).then((set) => {
                          if (set.ok) window.location.assign(appHref(language, 'account'))
                          else setBusy(false)
                        })
                      }}
                      className="btn-white aria-pressed:border-indigo aria-pressed:bg-indigo-soft aria-pressed:text-indigo-ink"
                    >
                      {language === 'ar' ? 'العربية' : 'English'}
                    </button>
                  ))}
                </div>
              </dd>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
              <button
                type="button"
                className="btn-white"
                disabled={busy}
                onClick={() => void leave(false)}
              >
                <LogOut size={16} aria-hidden="true" className="rtl:-scale-x-100" />
                {words.account.signOut}
              </button>
              <button
                type="button"
                className="btn-white"
                disabled={busy}
                onClick={() => void leave(true)}
              >
                {words.account.signOutEverywhere}
              </button>
            </div>
          </section>

          <section className="app-surface p-5" aria-labelledby="ac-delete">
            <h2 id="ac-delete" className="m-0 mb-2 text-[1.0625rem] font-semibold">
              {words.delete.title}
            </h2>
            <p className="m-0 mb-4 text-small text-ink-2">{words.delete.text}</p>
            {stage === 'idle' && (
              <button
                type="button"
                className="btn-white"
                disabled={busy}
                onClick={() => {
                  setStage('confirm')
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
                {words.delete.open}
              </button>
            )}
            {stage === 'confirm' && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void erase()}
                  className="btn-white border-critical-ink text-critical-ink hover:bg-critical-soft"
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {busy ? words.delete.working : words.delete.confirm}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    setStage('idle')
                  }}
                >
                  {words.delete.cancel}
                </button>
              </div>
            )}
            {stage === 'fresh' && (
              <>
                <p role="alert" className="m-0 mb-3 text-small text-ink-2">
                  {words.delete.freshNeeded}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-grad"
                    disabled={busy}
                    onClick={() => void again()}
                  >
                    {words.delete.signInAgain}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setStage('idle')
                    }}
                  >
                    {words.delete.cancel}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="app-surface p-5" aria-labelledby="ac-plan">
            <h2 id="ac-plan" className="m-0 text-[1.0625rem] font-semibold">
              {a.planTitle}
            </h2>
            <p className="mt-1 mb-4 text-small text-ink-2">{a.planLead}</p>
            <dl className="m-0 flex flex-col text-small">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 border-t border-line py-3 first:border-t-0 first:pt-0"
                >
                  <dt className="text-ink-2">{label}</dt>
                  <dd className="m-0 font-semibold tabular-nums text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 mb-0 text-meta text-ink-3">{a.planNote}</p>
          </section>

          <section className="app-surface p-5" aria-labelledby="ac-usage">
            <h2 id="ac-usage" className="m-0 mb-4 text-[1.0625rem] font-semibold">
              {a.usageTitle}
            </h2>
            <div className="flex flex-col gap-4">
              <UsageMeter
                id="ac-m-sites"
                label={t.overview.meters.sites}
                used={shared.sites.length}
                limit={shared.limits.sites}
                text={t.common.of(shared.sites.length, shared.limits.sites)}
                full={t.overview.meterFull}
              />
              <UsageMeter
                id="ac-m-monitored"
                label={t.overview.meters.monitored}
                used={monitored}
                limit={shared.limits.monitored}
                text={t.common.of(monitored, shared.limits.monitored)}
                full={t.overview.meterFull}
              />
              {usage?.pdfs != null && (
                <UsageMeter
                  id="ac-m-pdfs"
                  label={t.overview.meters.pdfs}
                  used={usage.pdfs.used}
                  limit={usage.pdfs.limit}
                  text={t.common.of(usage.pdfs.used, usage.pdfs.limit)}
                  full={t.overview.meterFull}
                />
              )}
              {usage?.keys != null && usage.keys.enabled && (
                <UsageMeter
                  id="ac-m-keys"
                  label={t.overview.meters.keys}
                  used={usage.keys.used}
                  limit={usage.keys.limit}
                  text={t.common.of(usage.keys.used, usage.keys.limit)}
                  full={t.overview.meterFull}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
