import {
  SEARCH_SUGGEST_PATH,
  type SuggestRequest,
  type SuggestResponse,
} from '@arablyzer/api-contract/codes'
import { SEARCH_UI } from '@arablyzer/i18n/search'
import type { Lang } from '@arablyzer/seo/site'
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client'
import { Download, Search } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { fetchSearchStatus, postSearch, type SearchError } from '../api'
import { Revealed } from '../report/Bidi'
import { ScanNote } from '../ScanNote'
import { challenge } from '../turnstile'
import { FIELD, LABEL, SUBMIT, ToolBox } from '../ToolBox'
import { filterGroups, parseSeed, suggestRows } from './model'
import { downloadCsv, errorText, Notice } from './shared'

type Status = 'checking' | 'off' | 'on' | 'unknown'
type Run =
  | { readonly phase: 'idle' }
  | { readonly phase: 'running' }
  | { readonly phase: 'done'; readonly response: SuggestResponse }
  | { readonly phase: 'failed'; readonly error: SearchError | 'seed' }

/**
 * «اقتراحات البحث العربية» (M5.3): a seed word asked of Google's public suggestions through the
 * API (33 questions, one at a time, so it takes a while), the answer grouped and searchable here
 * and downloadable as a CSV built in the browser. Off unless the operator turned it on.
 */
export default function SuggestTree({
  lang,
  tool,
  title,
  dot,
}: {
  lang: Lang
  tool: string
  title: string
  dot: string
}) {
  const t = SEARCH_UI[lang].suggest
  const common = SEARCH_UI[lang].common
  const [status, setStatus] = useState<Status>('checking')
  const [run, setRun] = useState<Run>({ phase: 'idle' })
  const [filter, setFilter] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const check = useMemo(() => challenge(PUBLIC_TURNSTILE_SITE_KEY, () => box.current, lang), [lang])

  useEffect(() => {
    let active = true
    void fetchSearchStatus().then((found) => {
      if (active) setStatus(found === null ? 'unknown' : found.suggest ? 'on' : 'off')
    })
    return () => {
      active = false
    }
  }, [])

  async function onSubmit(event: TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (run.phase === 'running') return
    const value = new FormData(event.currentTarget).get('seed')
    const seed = parseSeed(typeof value === 'string' ? value : '')
    if (seed === null) {
      setRun({ phase: 'failed', error: 'seed' })
      return
    }
    setRun({ phase: 'running' })
    setFilter('')
    let token: string
    try {
      token = await check.token()
    } catch {
      setRun({ phase: 'failed', error: { code: 'turnstile-failed' } })
      return
    }
    const request: SuggestRequest = { seed, turnstileToken: token }
    const answered = await postSearch<SuggestResponse>(SEARCH_SUGGEST_PATH, request)
    setRun(
      answered.ok
        ? { phase: 'done', response: answered.value }
        : { phase: 'failed', error: answered.error },
    )
  }

  const busy = run.phase === 'running'
  const shown = run.phase === 'done' ? filterGroups(run.response.groups, filter) : []
  return (
    <div className="flex flex-col gap-4" data-tool={tool}>
      <ToolBox
        title={title}
        dot={dot}
        busy={busy}
        note={
          <ScanNote
            lang={lang}
            id="suggest-note"
            line={common.working.replace('…', '')}
            keep={[t.sentOut]}
          />
        }
      >
        {status === 'checking' && (
          <p role="status" className="m-0 text-small text-ink-2">
            {common.working}
          </p>
        )}
        {status === 'off' && <Notice>{common.off}</Notice>}
        {status === 'unknown' && <Notice role="alert">{common.errors.network}</Notice>}
        {status === 'on' && (
          <form
            noValidate
            onSubmit={(event) => void onSubmit(event)}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="suggest-seed" className={LABEL}>
                {t.seedLabel}
              </label>
              <input
                id="suggest-seed"
                name="seed"
                type="text"
                maxLength={60}
                autoComplete="off"
                spellcheck={false}
                placeholder={t.seedPlaceholder}
                aria-invalid={run.phase === 'failed' && run.error === 'seed' ? true : undefined}
                aria-describedby="suggest-error"
                className={FIELD}
              />
            </div>
            <div ref={box} className="empty:hidden" />
            <p id="suggest-error" role="alert" className="m-0 text-small text-serious empty:hidden">
              {run.phase === 'failed'
                ? run.error === 'seed'
                  ? t.seedProblem
                  : errorText(lang, run.error)
                : ''}
            </p>
            <button
              type="submit"
              aria-disabled={busy ? true : undefined}
              className={`${SUBMIT} aria-disabled:cursor-wait`}
            >
              <Search size={18} aria-hidden="true" />
              {busy ? common.working : t.submit}
            </button>
          </form>
        )}
      </ToolBox>
      <p role="status" className="sr-only">
        {run.phase === 'running'
          ? common.working
          : run.phase === 'done'
            ? t.summary(run.response.total, run.response.answered, run.response.asked)
            : ''}
      </p>
      {run.phase === 'done' && (
        <section className="card flex flex-col gap-4 p-card" aria-label={title}>
          {run.response.stopped !== null && <Notice>{t.stopped[run.response.stopped]}</Notice>}
          {run.response.total === 0 ? (
            <p className="m-0 text-small text-ink-2">{t.empty}</p>
          ) : (
            <>
              <p className="m-0 text-small text-ink-2">
                {t.summary(run.response.total, run.response.answered, run.response.asked)}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-0 grow flex-col gap-2">
                  <label htmlFor="suggest-filter" className={LABEL}>
                    {t.filter}
                  </label>
                  <input
                    id="suggest-filter"
                    type="search"
                    value={filter}
                    autoComplete="off"
                    spellcheck={false}
                    onInput={(event) => {
                      setFilter(event.currentTarget.value)
                    }}
                    className={FIELD}
                  />
                </div>
                <button
                  type="button"
                  className="btn-white"
                  onClick={() => {
                    downloadCsv(
                      t.csvName,
                      suggestRows(run.response, t.csvColumns, (kind) => t.groups[kind]),
                    )
                  }}
                >
                  <Download size={16} aria-hidden="true" />
                  {common.download}
                </button>
              </div>
              {shown.length === 0 && <p className="m-0 text-small text-ink-2">{t.noMatch}</p>}
              {shown.map((group) => (
                <div key={`${group.kind}:${group.trigger}`} className="flex flex-col gap-2">
                  <h3 className="heading-3 m-0">
                    {t.trigger(group.kind, group.trigger)}{' '}
                    <span className="text-meta font-normal text-ink-3">
                      <bdi dir="ltr">({group.suggestions.length})</bdi>
                    </span>
                  </h3>
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {group.suggestions.map((suggestion) => (
                      <li
                        key={suggestion}
                        className="rounded-full bg-surface-2 px-3 py-1 text-small text-ink"
                      >
                        <bdi dir="auto">
                          <Revealed text={suggestion} />
                        </bdi>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}
        </section>
      )}
    </div>
  )
}
