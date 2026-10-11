import type { ApiKeySummary } from '@arablyzer/api-contract/codes'
import { MAX_API_KEY_NAME } from '@arablyzer/api-contract/codes'
import { DEVELOPERS_UI } from '@arablyzer/i18n/developers'
import type { Lang } from '@arablyzer/seo/site'
import { localePath, PATHS } from '@arablyzer/seo/site'
import { Check, Copy, KeyRound, Trash2 } from 'lucide-preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { createKey, listKeys, revokeKey } from '../keys-api'
import { dayLabel } from '../sites-model'

interface Loaded {
  readonly keys: readonly ApiKeySummary[]
  readonly limit: number
  readonly enabled: boolean
}

/**
 * The account's API keys (M5.1): the keys it holds, a form to make one, and the secret of a new
 * one, shown once with a way to copy it. A plan with no API sees why the form is not there.
 * Revoking asks once more, in place.
 */
export default function KeysPanel({ lang }: { lang: Lang }) {
  const t = DEVELOPERS_UI[lang].keys
  const [data, setData] = useState<Loaded | null | 'failed'>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [secret, setSecret] = useState<{ readonly value: string; readonly name: string } | null>(
    null,
  )
  const [copied, setCopied] = useState(false)
  const [asking, setAsking] = useState<string | null>(null)
  const secretBox = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    void listKeys().then((read) => {
      if (!live) return
      setData(read.ok ? read.value : 'failed')
    })
    return () => {
      live = false
    }
  }, [])

  // The secret is selected when it appears, so a keyboard user can copy it at once.
  useEffect(() => {
    if (secret !== null) secretBox.current?.focus()
  }, [secret])

  if (data === null || data === 'failed') return null
  const full = data.keys.length >= data.limit

  async function make(event: Event) {
    event.preventDefault()
    if (busy || name.trim() === '') return
    setBusy(true)
    setProblem(null)
    const made = await createKey(name.trim())
    setBusy(false)
    if (!made.ok) {
      setProblem(t.problems[made.problem])
      return
    }
    setSecret({ value: made.value.secret, name: made.value.key.name })
    setCopied(false)
    setName('')
    setData((now) =>
      now === null || now === 'failed' ? now : { ...now, keys: [...now.keys, made.value.key] },
    )
  }

  async function revoke(key: ApiKeySummary) {
    if (busy) return
    setBusy(true)
    setProblem(null)
    const gone = await revokeKey(key.id)
    setBusy(false)
    setAsking(null)
    if (!gone.ok && gone.problem !== 'not-found') {
      setProblem(t.problems[gone.problem])
      return
    }
    setData((now) =>
      now === null || now === 'failed'
        ? now
        : { ...now, keys: now.keys.filter((other) => other.id !== key.id) },
    )
  }

  async function copy() {
    if (secret === null) return
    try {
      await navigator.clipboard.writeText(secret.value)
      setCopied(true)
    } catch {
      // No clipboard (an insecure page, a refusal): the field is selected for the person to copy.
      secretBox.current?.select()
    }
  }

  return (
    <section aria-labelledby="keys-title" className="card flex flex-col gap-4 rounded-card p-card">
      <h2 id="keys-title" className="heading-2 m-0">
        {t.title}
      </h2>
      <p className="m-0 text-small text-ink-2">{t.lead}</p>
      <p className="m-0 text-small">
        <a
          href={localePath(lang, PATHS.developers)}
          className="text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          {t.docs}
        </a>
      </p>

      {secret !== null && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4"
        >
          <h3 className="heading-3 m-0">
            {t.createdTitle}: <bdi>{secret.name}</bdi>
          </h3>
          <p className="m-0 text-small text-ink-2">{t.createdLead}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={secretBox}
              readOnly
              dir="ltr"
              value={secret.value}
              aria-label={t.createdTitle}
              onFocus={(event) => {
                event.currentTarget.select()
              }}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 font-mono text-small text-ink"
            />
            <button type="button" className="btn-white" onClick={() => void copy()}>
              {copied ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
              {copied ? t.copied : t.copy}
            </button>
          </div>
          <div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSecret(null)
              }}
            >
              {t.done}
            </button>
          </div>
        </div>
      )}

      {!data.enabled ? (
        <p className="m-0 text-body text-ink-2">{t.closed}</p>
      ) : (
        <>
          <p className="m-0 text-small font-semibold text-ink">
            {t.count(data.keys.length, data.limit)}
          </p>
          {data.keys.length === 0 ? (
            <p className="m-0 text-body text-ink-2">{t.empty}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {data.keys.map((key) => (
                <li
                  key={key.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"
                >
                  <KeyRound aria-hidden="true" size={16} className="shrink-0 text-ink-3" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body font-semibold break-words text-ink">
                      <bdi>{key.name}</bdi>
                    </span>
                    <span className="meta-row text-meta text-ink-2">
                      <span>
                        {t.prefix}:{' '}
                        <span dir="ltr" className="font-mono">
                          {key.prefix}…
                        </span>
                      </span>
                      <span>
                        {t.createdOn}: {dayLabel(key.createdAt, lang)}
                      </span>
                      <span>
                        {t.lastUsed}:{' '}
                        {key.lastUsedAt === null ? t.neverUsed : dayLabel(key.lastUsedAt, lang)}
                      </span>
                    </span>
                  </div>
                  {asking === key.id ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void revoke(key)}
                        className="btn-white border-critical-ink text-critical-ink hover:bg-critical-soft"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        {busy ? t.revoking : t.revokeSure}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() => {
                          setAsking(null)
                        }}
                      >
                        {t.cancel}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-white"
                      aria-label={t.revokeAria(key.name)}
                      disabled={busy}
                      onClick={() => {
                        setAsking(key.id)
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      {t.revoke}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!full && (
            <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void make(event)}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor="key-name" className="text-small font-semibold text-ink">
                  {t.nameLabel}
                </label>
                <input
                  id="key-name"
                  type="text"
                  value={name}
                  maxLength={MAX_API_KEY_NAME}
                  placeholder={t.namePlaceholder}
                  autoComplete="off"
                  onInput={(event) => {
                    setName(event.currentTarget.value)
                  }}
                  className="min-h-11 rounded-xl border border-line bg-surface px-3 text-body text-ink"
                />
              </div>
              <button type="submit" className="btn-grad" disabled={busy || name.trim() === ''}>
                {busy ? t.creating : t.create}
              </button>
            </form>
          )}
        </>
      )}
      {problem !== null && (
        <p role="alert" className="m-0 text-small text-critical-ink">
          {problem}
        </p>
      )}
    </section>
  )
}
