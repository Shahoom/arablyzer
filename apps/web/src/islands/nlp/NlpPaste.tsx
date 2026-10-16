import {
  NLP_CHECK_PATH,
  NLP_TEXT_MAX,
  type NlpCheckRequest,
  type NlpCheckResponse,
  type NlpDialectAnswer,
  type NlpKind,
  type NlpSensitivity,
  type NlpSpellingAnswer,
} from '@arablyzer/api-contract/codes'
import { NLP_UI } from '@arablyzer/i18n/nlp'
import type { Lang } from '@arablyzer/seo/site'
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client'
import { SpellCheck } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { fetchNlpStatus, postSearch, type SearchError } from '../api'
import { Revealed } from '../report/Bidi'
import { Notice, Privacy } from '../search/shared'
import { ScanNote } from '../ScanNote'
import { challenge } from '../turnstile'
import { AREA, LABEL, SUBMIT, ToolBox } from '../ToolBox'

type Status = 'checking' | 'off' | 'on' | 'unknown'
type Run =
  | { readonly phase: 'idle' }
  | { readonly phase: 'running' }
  | { readonly phase: 'done'; readonly answer: NlpCheckResponse }
  | { readonly phase: 'failed'; readonly error: SearchError | 'short' }

/** What a refused request says, with when to come back where the API said. */
function failureText(lang: Lang, error: SearchError): string {
  const t = NLP_UI[lang].common
  const base = (t.errors as Readonly<Record<string, string>>)[error.code] ?? t.errors.unavailable
  return error.retryAfterSeconds === undefined
    ? base
    : `${base} ${t.retryAfter(error.retryAfterSeconds)}`
}

const VARIETIES = ['msa', 'gulf', 'egyptian', 'levantine', 'maghrebi'] as const
/** A page's worth of words is enough for the model to tell; fewer is "too little". */
const MIN_DIALECT_WORDS = 12

/**
 * The Arabic text tools (M7): «المدقق الإملائي العربي» and «كاشف اللهجة» on a pasted text, answered by
 * the Arabic NLP service through the API and the worker. The text is held for the seconds the answer
 * takes and kept nowhere. Where the operator does not run the service, the box says so, and the scan
 * box of the page checks a page by its address.
 */
export default function NlpPaste({
  lang,
  tool,
  title,
  dot,
  kind,
}: {
  lang: Lang
  tool: string
  title: string
  dot: string
  kind: NlpKind
}) {
  const t = NLP_UI[lang]
  const common = t.common
  const [status, setStatus] = useState<Status>('checking')
  const [run, setRun] = useState<Run>({ phase: 'idle' })
  const [used, setUsed] = useState(0)
  const [wide, setWide] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const check = useMemo(() => challenge(PUBLIC_TURNSTILE_SITE_KEY, () => box.current, lang), [lang])

  useEffect(() => {
    let active = true
    void fetchNlpStatus().then((found) => {
      if (active) setStatus(found === null ? 'unknown' : found.text ? 'on' : 'off')
    })
    return () => {
      active = false
    }
  }, [])

  async function onSubmit(event: TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (run.phase === 'running') return
    const value = new FormData(event.currentTarget).get('text')
    const text = typeof value === 'string' ? value.trim() : ''
    if ((text.match(/[ء-ي]/gu)?.length ?? 0) < 3) {
      setRun({ phase: 'failed', error: 'short' })
      return
    }
    setRun({ phase: 'running' })
    let token: string
    try {
      token = await check.token()
    } catch {
      setRun({ phase: 'failed', error: { code: 'turnstile-failed' } })
      return
    }
    const sensitivity: NlpSensitivity = wide ? 'wide' : 'sure'
    const request: NlpCheckRequest = { kind, text, sensitivity, turnstileToken: token }
    const answered = await postSearch<NlpCheckResponse>(NLP_CHECK_PATH, request)
    setRun(
      answered.ok
        ? { phase: 'done', answer: answered.value }
        : { phase: 'failed', error: answered.error },
    )
  }

  const busy = run.phase === 'running'
  const message =
    run.phase !== 'failed'
      ? ''
      : run.error === 'short'
        ? common.tooShort
        : failureText(lang, run.error)
  return (
    <div className="flex flex-col gap-4" data-tool={tool}>
      <ToolBox
        title={title}
        dot={dot}
        busy={busy}
        note={
          <ScanNote lang={lang} id="nlp-note" line={common.working.replace('…', '')} keep={[]} />
        }
      >
        {status === 'off' && <Notice>{common.off}</Notice>}
        {status === 'unknown' && <Notice role="alert">{common.errors.network}</Notice>}
        {status !== 'off' && (
          <form
            noValidate
            onSubmit={(event) => void onSubmit(event)}
            data-tool-kind="paste"
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-2">
              <label htmlFor={`nlp-text-${kind}`} className={LABEL}>
                {common.textLabel}
              </label>
              <textarea
                id={`nlp-text-${kind}`}
                name="text"
                rows={8}
                dir="auto"
                lang="ar"
                maxLength={NLP_TEXT_MAX}
                spellcheck={false}
                autoComplete="off"
                placeholder={common.textPlaceholder}
                aria-describedby={`nlp-count-${kind} nlp-error-${kind}`}
                aria-invalid={run.phase === 'failed' ? true : undefined}
                onInput={(event) => {
                  setUsed(event.currentTarget.value.length)
                }}
                className={AREA}
              />
              <p id={`nlp-count-${kind}`} className="m-0 text-meta text-ink-3">
                <bdi dir="ltr">{common.count(used, NLP_TEXT_MAX)}</bdi>
              </p>
            </div>
            {kind === 'spelling' && (
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className={`${LABEL} mb-2 p-0`}>{t.spelling.sensitivity}</legend>
                {[false, true].map((choice) => (
                  <label
                    key={String(choice)}
                    className="flex min-h-11 items-center gap-3 text-small text-ink"
                  >
                    <input
                      type="radio"
                      name="sensitivity"
                      checked={wide === choice}
                      onChange={() => {
                        setWide(choice)
                      }}
                      className="size-5"
                    />
                    {choice ? t.spelling.wide : t.spelling.sure}
                  </label>
                ))}
              </fieldset>
            )}
            <div ref={box} className="empty:hidden" />
            <p
              id={`nlp-error-${kind}`}
              role="alert"
              className="m-0 text-small text-serious empty:hidden"
            >
              {message}
            </p>
            <button
              type="submit"
              disabled={status === 'checking'}
              aria-disabled={busy ? true : undefined}
              className={`${SUBMIT} aria-disabled:cursor-wait`}
            >
              <SpellCheck size={18} aria-hidden="true" />
              {busy ? common.working : common.submit}
            </button>
            <Privacy text={common.privacy} />
          </form>
        )}
      </ToolBox>
      <p role="status" className="sr-only">
        {busy ? common.working : ''}
      </p>
      {run.phase === 'done' && run.answer.kind === 'spelling' && (
        <SpellingResult answer={run.answer} lang={lang} title={title} wide={wide} />
      )}
      {run.phase === 'done' && run.answer.kind === 'dialect' && (
        <DialectResult answer={run.answer} lang={lang} title={title} />
      )}
    </div>
  )
}

function SpellingResult({
  answer,
  lang,
  title,
  wide,
}: {
  answer: NlpSpellingAnswer
  lang: Lang
  title: string
  wide: boolean
}) {
  const t = NLP_UI[lang].spelling
  const families = t.families as Readonly<Record<string, string>>
  return (
    <section className="card flex flex-col gap-4 p-card" aria-label={title}>
      <p className="m-0 text-small text-ink-2" role="status">
        {answer.findings.length === 0
          ? t.none(answer.words)
          : t.summary(answer.findings.length, answer.words)}
      </p>
      {answer.truncated && <Notice>{t.truncated}</Notice>}
      {wide && answer.findings.length > 0 && <Notice>{t.wideNote}</Notice>}
      {answer.findings.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {answer.findings.map((finding) => (
            <li
              key={`${finding.word}:${finding.suggestion}`}
              className="flex flex-col gap-2 rounded-xl border border-line p-3"
            >
              <p className="m-0 flex flex-wrap items-center gap-2 text-body">
                <bdi dir="rtl" lang="ar" className="font-semibold text-serious line-through">
                  <Revealed text={finding.word} />
                </bdi>
                <span aria-hidden="true">←</span>
                <bdi dir="rtl" lang="ar" className="font-semibold text-pass">
                  <Revealed text={finding.suggestion} />
                </bdi>
                <span className="chip">{families[finding.family] ?? finding.family}</span>
                <span className="chip">
                  {finding.confidence >= 90 ? t.sureBadge : t.likely} ·{' '}
                  {t.confidence(finding.confidence)}
                </span>
              </p>
              <p className="m-0 text-small text-ink-2">
                <bdi dir="rtl" lang="ar">
                  {finding.before} <mark>{finding.word}</mark> {finding.after}
                </bdi>
              </p>
              {finding.alternatives.length > 0 && (
                <p className="m-0 text-meta text-ink-3">
                  {t.alternatives(finding.alternatives.join('، '))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-meta text-ink-3">{t.limits}</p>
    </section>
  )
}

function DialectResult({
  answer,
  lang,
  title,
}: {
  answer: NlpDialectAnswer
  lang: Lang
  title: string
}) {
  const t = NLP_UI[lang].dialect
  const leader = answer.label
  const sure = leader !== null && answer.probabilities[leader] >= 70
  const text =
    answer.words < MIN_DIALECT_WORDS || leader === null
      ? t.tooLittle
      : sure
        ? t.headline(t.varieties[leader])
        : t.unsure
  return (
    <section className="card flex flex-col gap-4 p-card" aria-label={title}>
      <p className="m-0 text-body font-semibold" role="status">
        {text}
      </p>
      {answer.chunks > 0 && (
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {VARIETIES.map((variety) => (
              <li key={variety} className="flex flex-col gap-1">
                <p className="m-0 flex items-baseline justify-between gap-3 text-small text-ink">
                  <span>{t.varieties[variety]}</span>
                  <span dir="ltr" className="tabular-nums text-ink-2">
                    {answer.probabilities[variety]}%
                  </span>
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2 forced-colors:border">
                  <div
                    className="h-2 rounded-full bg-brand"
                    style={{ width: `${String(answer.probabilities[variety])}%` }}
                  />
                </div>
                <p className="m-0 text-meta text-ink-3">
                  {t.won(answer.votes[variety], answer.chunks)}
                </p>
              </li>
            ))}
          </ul>
          <p className="m-0 text-small text-ink-2">{t.sentences(answer.chunks, answer.words)}</p>
        </>
      )}
      <p className="m-0 text-meta text-ink-3">{t.limits}</p>
    </section>
  )
}
