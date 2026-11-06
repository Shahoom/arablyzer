import { WHATSAPP_CODE_LENGTH, type WhatsappState } from '@arablyzer/api-contract/codes'
import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import type { Lang } from '@arablyzer/seo/site'
import { MessageCircle, TriangleAlert } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useState } from 'preact/hooks'
import {
  removeWhatsapp,
  sendWhatsappCode,
  setWhatsappSite,
  verifyWhatsappCode,
  type SiteOutcome,
} from '../sites-api'
import type { SiteProblem } from '../sites-model'

interface Props {
  lang: Lang
  state: WhatsappState
  /** The account's WhatsApp state after a change. */
  onChange: (next: WhatsappState) => void
}

/** The shape of a number, as a hint inside the field; it is a format, not a number in the copy. */
const PHONE_FORMAT = '+CC XX XXX XXXX'

type Note =
  | { readonly kind: 'problem'; readonly text: string }
  | { readonly kind: 'ok'; readonly text: string }

/**
 * WhatsApp alerts (M5.6), inside the alerts card: a number, the code sent to it on WhatsApp, and
 * one switch for each monitored site. Shown only where the server can send WhatsApp and the plan
 * has it. The number is never read back whole (the API gives it with its middle hidden), and
 * nothing is sent to a number until its code has been given back.
 */
export default function WhatsappSection({ lang, state, onChange }: Props) {
  const t = ACCOUNT_UI[lang]
  const w = t.alerts.whatsapp
  const form = SCAN_FORM[lang]
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  // A code was sent to the number in the state, and is waited for.
  const [waiting, setWaiting] = useState(false)
  const [changing, setChanging] = useState(false)

  const problemText = (problem: SiteProblem, retryAfterSeconds?: number): string => {
    const wait = retryAfterSeconds === undefined ? '' : ` ${form.retryAfter(retryAfterSeconds)}`
    if (problem === 'invalid-token') return w.wrongCode
    if (problem === 'bad-request' || problem === 'unavailable') return w.sendFailed
    if (problem in form.errors && problem !== 'network') {
      return `${form.errors[problem as keyof typeof form.errors]}${wait}`
    }
    return `${t.problems[problem as keyof typeof t.problems]}${wait}`
  }
  const failed = (outcome: Extract<SiteOutcome<unknown>, { ok: false }>) => {
    setNote({ kind: 'problem', text: problemText(outcome.problem, outcome.retryAfterSeconds) })
  }

  async function onSend(event: TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy !== null) return
    const input = event.currentTarget.elements.namedItem('phone')
    const phone = input instanceof HTMLInputElement ? input.value.trim() : ''
    if (phone === '') {
      setNote({ kind: 'problem', text: form.errors.empty })
      return
    }
    setNote(null)
    setBusy('send')
    const sent = await sendWhatsappCode(phone)
    setBusy(null)
    if (!sent.ok) {
      failed(sent)
      return
    }
    onChange(sent.value)
    setWaiting(true)
    setChanging(false)
    setNote({ kind: 'ok', text: w.codeSent })
  }

  async function onVerify(event: TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy !== null) return
    const input = event.currentTarget.elements.namedItem('code')
    const code = input instanceof HTMLInputElement ? input.value.trim() : ''
    setNote(null)
    setBusy('verify')
    const checked = await verifyWhatsappCode(code)
    setBusy(null)
    if (!checked.ok) {
      failed(checked)
      return
    }
    onChange(checked.value)
    setWaiting(false)
    setNote({ kind: 'ok', text: w.verified })
  }

  async function onRemove() {
    if (busy !== null) return
    setNote(null)
    setBusy('remove')
    const removed = await removeWhatsapp()
    setBusy(null)
    if (!removed.ok) {
      failed(removed)
      return
    }
    onChange(removed.value)
    setWaiting(false)
  }

  async function onSite(id: string, enabled: boolean) {
    if (busy !== null) return
    setNote(null)
    setBusy(id)
    const set = await setWhatsappSite(id, enabled)
    setBusy(null)
    if (!set.ok) {
      failed(set)
      return
    }
    onChange(set.value)
    setNote({ kind: 'ok', text: w.saved })
  }

  const asking = state.phone === null || changing
  const notice = note !== null && (
    <p
      role={note.kind === 'ok' ? 'status' : 'alert'}
      className={`m-0 flex items-start gap-3 rounded-xl p-3 text-small text-ink-2 forced-colors:border ${note.kind === 'ok' ? 'bg-surface-2' : 'bg-moderate-soft'}`}
    >
      {note.kind === 'problem' && (
        <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
      )}
      <span className="min-w-0">{note.text}</span>
    </p>
  )

  return (
    <section
      aria-labelledby="whatsapp-title"
      className="flex flex-col gap-4 rounded-xl border border-line p-4"
    >
      <div className="flex flex-col gap-2">
        <h3 id="whatsapp-title" className="heading-3 m-0 flex items-center gap-2">
          <MessageCircle size={18} aria-hidden="true" />
          {w.title}
        </h3>
        <p className="m-0 text-small text-ink-2">{w.lead}</p>
      </div>

      {state.phone !== null && (
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-small text-ink">
          <span className="font-semibold">{w.numberLabel}</span>
          <bdi dir="ltr">{state.phone}</bdi>
        </p>
      )}

      {asking && (
        <form noValidate onSubmit={(event) => void onSend(event)} className="flex flex-col gap-2">
          <label htmlFor="whatsapp-phone" className="text-small font-semibold text-ink">
            {w.phoneLabel}
          </label>
          <input
            id="whatsapp-phone"
            name="phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            placeholder={PHONE_FORMAT}
            aria-describedby="whatsapp-phone-hint"
            disabled={busy !== null}
            className="h-12 w-full min-w-0 rounded-md border border-field bg-white px-3 text-start text-body text-ink placeholder:text-ink-3"
          />
          <p id="whatsapp-phone-hint" className="m-0 text-meta text-ink-2">
            {w.phoneHint}
          </p>
          <div>
            <button type="submit" className="btn-white" disabled={busy !== null}>
              {busy === 'send' ? w.sending : w.sendCode}
            </button>
          </div>
        </form>
      )}

      {state.phone !== null && !state.verified && !changing && (
        <form noValidate onSubmit={(event) => void onVerify(event)} className="flex flex-col gap-2">
          <label htmlFor="whatsapp-code" className="text-small font-semibold text-ink">
            {w.codeLabel}
          </label>
          <input
            id="whatsapp-code"
            name="code"
            type="text"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={WHATSAPP_CODE_LENGTH}
            pattern={`[0-9]{${String(WHATSAPP_CODE_LENGTH)}}`}
            disabled={busy !== null}
            className="h-12 w-40 rounded-md border border-field bg-white px-3 text-start text-body text-ink"
          />
          {waiting && <p className="m-0 text-meta text-ink-2">{w.codeSent}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-white" disabled={busy !== null}>
              {busy === 'verify' ? w.verifying : w.verify}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy !== null}
              onClick={() => {
                setChanging(true)
              }}
            >
              {w.changeNumber}
            </button>
          </div>
        </form>
      )}

      {state.phone !== null && state.verified && (
        <div className="flex flex-col gap-2">
          <h4 className="m-0 text-small font-semibold text-ink">{w.sitesTitle}</h4>
          <p className="m-0 text-small text-ink-2">{w.sitesLead}</p>
          {state.sites.length === 0 ? (
            <p className="m-0 text-small text-ink-2">{w.noSites}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {state.sites.map((site) => (
                <li key={site.id}>
                  <label
                    htmlFor={`whatsapp-site-${site.id}`}
                    className="flex min-h-11 items-center gap-3 text-small text-ink"
                  >
                    <input
                      id={`whatsapp-site-${site.id}`}
                      type="checkbox"
                      checked={site.enabled}
                      disabled={busy !== null}
                      onChange={(event) => {
                        void onSite(site.id, event.currentTarget.checked)
                      }}
                      className="h-5 w-5 shrink-0"
                    />
                    <bdi dir="ltr" className="min-w-0 break-all">
                      {site.url}
                    </bdi>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {notice}

      {state.phone !== null && (
        <div>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy !== null}
            onClick={() => void onRemove()}
          >
            {busy === 'remove' ? w.removing : w.remove}
          </button>
        </div>
      )}
    </section>
  )
}
