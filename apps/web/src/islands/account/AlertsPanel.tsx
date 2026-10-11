import {
  DROP_THRESHOLD_MAX,
  DROP_THRESHOLD_MIN,
  type AlertSettings,
  type AlertsResponse,
} from '@arablyzer/api-contract/codes'
import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import type { Lang } from '@arablyzer/seo/site'
import { KeyRound, Send, TriangleAlert } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { getAlerts, saveAlerts, testAlerts, type SiteOutcome } from '../sites-api'
import { SIGNATURE_RECIPE, type SiteProblem } from '../sites-model'

interface Props {
  lang: Lang
}

type Note =
  | { readonly kind: 'problem'; readonly problem: SiteProblem; readonly retryAfterSeconds?: number }
  | { readonly kind: 'ok'; readonly text: string }

/**
 * Where alerts go (M4.3): a webhook the person pastes, what triggers a message, and a test. The
 * address is never read back (the API gives its host and kind); the signing secret appears once,
 * right after it is made. Hidden when the API says monitoring is not there.
 */
export default function AlertsPanel({ lang }: Props) {
  const t = ACCOUNT_UI[lang]
  const a = t.alerts
  const form = SCAN_FORM[lang]
  const [settings, setSettings] = useState<AlertSettings | 'loading' | 'failed' | 'absent'>(
    'loading',
  )
  const [note, setNote] = useState<Note | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void getAlerts().then((loaded) => {
      if (!live) return
      if (loaded.ok) {
        setSettings(loaded.value)
      } else if (loaded.problem === 'not-found') {
        setSettings('absent')
      } else {
        setSettings('failed')
        setNote({ kind: 'problem', ...loaded })
      }
    })
    return () => {
      live = false
    }
  }, [])

  const problem = (outcome: Extract<SiteOutcome<unknown>, { ok: false }>) => {
    setNote({
      kind: 'problem',
      problem: outcome.problem,
      ...(outcome.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: outcome.retryAfterSeconds }),
    })
  }

  const message = (n: Note): string => {
    if (n.kind === 'ok') return n.text
    const wait = n.retryAfterSeconds === undefined ? '' : ` ${form.retryAfter(n.retryAfterSeconds)}`
    if (n.problem === 'unsupported-scheme') return a.httpsOnly
    if (n.problem === 'empty') return form.errors.empty
    if (n.problem === 'monitor-limit') return ''
    if (n.problem in form.errors && n.problem !== 'network') {
      return `${form.errors[n.problem as keyof typeof form.errors]}${wait}`
    }
    return `${t.problems[n.problem as keyof typeof t.problems]}${wait}`
  }

  if (settings === 'absent') return null

  const notice = note !== null && (
    <p
      role={note.kind === 'ok' ? 'status' : 'alert'}
      className={`m-0 flex items-start gap-3 rounded-xl p-3 text-small text-ink-2 forced-colors:border ${note.kind === 'ok' ? 'bg-surface-2' : 'bg-moderate-soft'}`}
    >
      {note.kind === 'problem' && (
        <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
      )}
      <span className="min-w-0">{message(note)}</span>
    </p>
  )

  if (settings === 'loading' || settings === 'failed') {
    return (
      <section
        aria-busy={settings === 'loading'}
        className="card flex flex-col gap-3 rounded-card p-card"
      >
        <h2 className="heading-2 m-0">{a.title}</h2>
        {settings === 'loading' ? (
          <p role="status" className="m-0 text-small text-ink-2">
            {a.loading}
          </p>
        ) : (
          notice
        )}
      </section>
    )
  }

  async function onSave(event: TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy !== null || typeof settings === 'string') return
    const elements = event.currentTarget.elements
    const field = (name: string) => {
      const found = elements.namedItem(name)
      return found instanceof HTMLInputElement ? found : null
    }
    const address = field('webhook')?.value.trim() ?? ''
    const threshold = Number(field('threshold')?.value)
    const email = field('email')
    setNote(null)
    setBusy('save')
    const saved = await saveAlerts({
      ...(address === '' ? {} : { webhookUrl: address }),
      dropThreshold: Math.min(
        DROP_THRESHOLD_MAX,
        Math.max(DROP_THRESHOLD_MIN, Number.isFinite(threshold) ? Math.round(threshold) : 10),
      ),
      onCritical: field('critical')?.checked ?? true,
      onDown: field('down')?.checked ?? true,
      weeklySummary: field('weekly')?.checked ?? false,
      ...(email === null ? {} : { email: email.checked }),
    })
    setBusy(null)
    if (!saved.ok) {
      problem(saved)
      return
    }
    setSettings(withoutSecret(saved.value))
    setSecret(saved.value.secret ?? null)
    const input = field('webhook')
    if (input !== null) input.value = ''
    setNote({ kind: 'ok', text: a.saved })
  }

  async function onRemove() {
    if (busy !== null) return
    setNote(null)
    setBusy('remove')
    const removed = await saveAlerts({ webhookUrl: null })
    setBusy(null)
    if (!removed.ok) {
      problem(removed)
      return
    }
    setSettings(withoutSecret(removed.value))
    setSecret(null)
  }

  async function onRotate() {
    if (busy !== null) return
    setNote(null)
    setBusy('rotate')
    const rotated = await saveAlerts({ rotateSecret: true })
    setBusy(null)
    if (!rotated.ok) {
      problem(rotated)
      return
    }
    setSettings(withoutSecret(rotated.value))
    setSecret(rotated.value.secret ?? null)
  }

  async function onTest() {
    if (busy !== null) return
    setNote(null)
    setBusy('test')
    const tested = await testAlerts()
    setBusy(null)
    if (!tested.ok) {
      problem(tested)
      return
    }
    if (tested.value.ok) {
      setNote({ kind: 'ok', text: a.testOk })
      setSettings((current) =>
        typeof current === 'string' || current.webhook === null
          ? current
          : { ...current, webhook: { ...current.webhook, failures: 0, disabled: false } },
      )
    } else {
      setNote({ kind: 'ok', text: a.testFailed(tested.value.status) })
    }
  }

  const { webhook } = settings
  return (
    <section
      aria-labelledby="alerts-title"
      className="card flex flex-col gap-5 rounded-card p-card"
    >
      <div className="flex flex-col gap-2">
        <h2 id="alerts-title" className="heading-2 m-0">
          {a.title}
        </h2>
        <p className="m-0 text-body text-ink-2">{a.lead}</p>
      </div>

      {webhook !== null && (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
          <p className="m-0 text-small font-semibold text-ink">
            {a.sendingTo(webhook.host, a.kinds[webhook.kind])}
          </p>
          {webhook.disabled ? (
            <p className="m-0 text-small text-ink-2">{a.disabled}</p>
          ) : (
            webhook.failures > 0 && (
              <p className="m-0 text-small text-ink-2">{a.failures(webhook.failures)}</p>
            )
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-white"
              disabled={busy !== null}
              onClick={() => void onTest()}
            >
              <Send size={16} aria-hidden="true" className="rtl:-scale-x-100" />
              {busy === 'test' ? a.testing : a.test}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy !== null}
              onClick={() => void onRotate()}
            >
              <KeyRound size={16} aria-hidden="true" />
              {a.rotate}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy !== null}
              onClick={() => void onRemove()}
            >
              {busy === 'remove' ? a.removing : a.remove}
            </button>
          </div>
        </div>
      )}

      {secret !== null && (
        <div
          role="group"
          aria-labelledby="secret-title"
          className="flex flex-col gap-2 rounded-xl border border-line p-4"
        >
          <h3 id="secret-title" className="heading-3 m-0">
            {a.secretTitle}
          </h3>
          <p className="m-0 text-small text-ink-2">{a.secretLead}</p>
          <bdi dir="ltr" className="break-all font-mono text-meta text-ink-2">
            {SIGNATURE_RECIPE}
          </bdi>
          <bdi
            dir="ltr"
            className="select-all break-all rounded-lg bg-surface-2 p-3 font-mono text-small text-ink"
          >
            {secret}
          </bdi>
          <div>
            <button
              type="button"
              className="btn-white"
              onClick={() => {
                setSecret(null)
              }}
            >
              {a.secretDone}
            </button>
          </div>
        </div>
      )}

      <form noValidate onSubmit={(event) => void onSave(event)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="webhook-url" className="text-small font-semibold text-ink">
            {a.webhookLabel}
          </label>
          <input
            id="webhook-url"
            name="webhook"
            type="url"
            dir="ltr"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellcheck={false}
            placeholder={a.webhookPlaceholder}
            aria-describedby="webhook-hint"
            disabled={busy !== null}
            className="h-12 w-full min-w-0 rounded-md border border-field bg-white px-3 text-start text-body text-ink placeholder:text-ink-3"
          />
          <p id="webhook-hint" className="m-0 text-meta text-ink-2">
            {a.webhookHint}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor="alert-threshold" className="text-small text-ink">
            {a.thresholdBefore}
          </label>
          <input
            id="alert-threshold"
            name="threshold"
            type="number"
            inputMode="numeric"
            min={DROP_THRESHOLD_MIN}
            max={DROP_THRESHOLD_MAX}
            step={1}
            defaultValue={settings.dropThreshold}
            disabled={busy !== null}
            className="h-12 w-24 rounded-md border border-field bg-white px-3 text-start text-body text-ink"
          />
          <span className="text-small text-ink">{a.thresholdAfter}</span>
        </div>

        <div className="flex flex-col">
          <Check
            name="critical"
            label={a.onCritical}
            on={settings.onCritical}
            disabled={busy !== null}
          />
          <Check name="down" label={a.onDown} on={settings.onDown} disabled={busy !== null} />
          <Check
            name="weekly"
            label={a.weeklySummary}
            on={settings.weeklySummary}
            disabled={busy !== null}
          />
          {settings.email.available && (
            <Check
              name="email"
              label={a.email}
              on={settings.email.enabled}
              disabled={busy !== null}
            />
          )}
        </div>

        {notice}
        <div>
          <button type="submit" className="btn-grad" disabled={busy !== null}>
            {busy === 'save' ? a.saving : a.save}
          </button>
        </div>
      </form>
    </section>
  )
}

/** The settings of an answer, without the secret it may carry. */
function withoutSecret(response: AlertsResponse): AlertSettings {
  return {
    webhook: response.webhook,
    dropThreshold: response.dropThreshold,
    onCritical: response.onCritical,
    onDown: response.onDown,
    weeklySummary: response.weeklySummary,
    email: response.email,
  }
}

function Check(props: { name: string; label: string; on: boolean; disabled: boolean }) {
  const id = `alert-${props.name}`
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-small text-ink">
      <input
        id={id}
        name={props.name}
        type="checkbox"
        defaultChecked={props.on}
        disabled={props.disabled}
        className="h-5 w-5 shrink-0"
      />
      {props.label}
    </label>
  )
}
