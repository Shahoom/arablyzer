import type { AiFix, AiStatus } from '@arablyzer/api-contract/codes'
import { AI_UI, type AiProblem } from '@arablyzer/i18n/ai'
import type { Lang } from '@arablyzer/seo/site'
import { PUBLIC_AUTH_GOOGLE_CLIENT_ID } from 'astro:env/client'
import { Check, Copy, Info, LoaderCircle, TriangleAlert } from 'lucide-preact'
import { useEffect, useState } from 'preact/hooks'
import { askFix, readAiStatus } from '../ai-api'
import { Bidi } from './Bidi'

/**
 * Whether the fix assistant is there for the person looking at the report: its status once the page
 * has loaded, or null (nothing is shown) where the deployment has none, nobody is signed in, or the
 * plan has none. `used` is kept here, so each new suggestion moves the count the buttons show.
 */
export function useAiStatus(): { status: AiStatus | null; spend: () => void } {
  const accountsOn = (PUBLIC_AUTH_GOOGLE_CLIENT_ID ?? '') !== ''
  const [status, setStatus] = useState<AiStatus | null>(null)
  useEffect(() => {
    if (!accountsOn) return
    let live = true
    void readAiStatus().then((read) => {
      if (live && read?.available === true) setStatus(read)
    })
    return () => {
      live = false
    }
  }, [accountsOn])
  return {
    status,
    spend: () => {
      setStatus((current) => (current === null ? null : { ...current, used: current.used + 1 }))
    },
  }
}

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'asking' }
  | { readonly kind: 'shown'; readonly fix: AiFix }
  | { readonly kind: 'failed'; readonly problem: AiProblem }

/**
 * «Suggest a fix with AI» on a failed rule (BUILD-PLAN §12). It asks the API for the rule of this
 * report; the answer is the model's and says so, and is shown as text, never as markup. Nothing
 * here changes a finding or a score.
 */
export function FixAssistant({
  reportId,
  ruleId,
  ruleTitle,
  lang,
  status,
  onSpent,
}: {
  reportId: string
  ruleId: string
  /** The rule's name in the page's language, for the button's name. */
  ruleTitle: string
  lang: Lang
  status: AiStatus
  onSpent: () => void
}) {
  const t = AI_UI[lang]
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)

  async function ask() {
    if (state.kind === 'asking') return
    setState({ kind: 'asking' })
    setCopied(false)
    const answer = await askFix(reportId, ruleId, lang)
    if (!answer.ok) {
      setState({ kind: 'failed', problem: answer.problem })
      return
    }
    // A stored answer used none of the day's suggestions.
    if (!answer.value.cached) onSpent()
    setState({ kind: 'shown', fix: answer.value })
  }

  const copy = (patch: string) => {
    navigator.clipboard
      .writeText(patch)
      .then(() => {
        setCopied(true)
      })
      .catch(() => undefined)
  }

  return (
    <div className="flex flex-col gap-3">
      {state.kind !== 'shown' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            className="btn-white"
            aria-label={t.buttonLabel(ruleTitle)}
            disabled={state.kind === 'asking'}
            onClick={() => void ask()}
          >
            {state.kind === 'asking' && (
              <LoaderCircle
                aria-hidden="true"
                size={16}
                className="animate-spin motion-reduce:animate-none"
              />
            )}
            {t.button}
          </button>
          <span className="text-meta text-ink-2">{t.left(status.used, status.perDay)}</span>
        </div>
      )}
      {state.kind === 'asking' && (
        <p role="status" className="m-0 text-small text-ink-2">
          {t.working}
        </p>
      )}
      {state.kind === 'failed' && (
        <p role="alert" className="m-0 flex items-start gap-2 text-small text-ink-2">
          <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
          {t.problems[state.problem]}
        </p>
      )}
      {state.kind === 'shown' && (
        <section
          aria-label={t.title}
          className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4 forced-colors:border"
        >
          <h4 className="heading-3 m-0">{t.title}</h4>
          <p className="m-0 flex items-start gap-2 text-meta text-ink-2">
            <Info aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
            {t.generated}
          </p>
          <p className="m-0 max-w-[76ch] text-small text-ink">
            <Bidi text={state.fix.explanation} lang={lang} />
          </p>
          {state.fix.steps.length > 0 && (
            <div className="flex flex-col gap-2">
              <h5 className="m-0 text-small font-semibold text-ink">{t.steps}</h5>
              <ol className="m-0 flex max-w-[76ch] list-decimal flex-col gap-1 ps-5 text-small text-ink-2">
                {state.fix.steps.map((step, index) => (
                  <li key={index}>
                    <Bidi text={step} lang={lang} />
                  </li>
                ))}
              </ol>
            </div>
          )}
          {state.fix.patch !== '' && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="m-0 text-small font-semibold text-ink">{t.patch}</h5>
                <button
                  type="button"
                  className="btn-white"
                  onClick={() => {
                    copy(state.fix.patch)
                  }}
                >
                  {copied ? (
                    <Check size={16} aria-hidden="true" />
                  ) : (
                    <Copy size={16} aria-hidden="true" />
                  )}
                  <span aria-live="polite">{copied ? t.copied : t.copy}</span>
                </button>
              </div>
              <pre
                dir="ltr"
                lang="en"
                className="m-0 overflow-x-auto rounded-xs bg-surface p-3 text-start font-mono text-meta text-ink"
              >
                <code>{state.fix.patch}</code>
              </pre>
            </div>
          )}
          <p className="m-0 text-meta text-ink-2">
            {t.confidenceLabel}: {t.confidence[state.fix.confidence]}
          </p>
        </section>
      )}
    </div>
  )
}
