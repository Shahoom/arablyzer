import {
  SEARCH_SERP_PATH,
  type SerpRequest,
  type SerpResponse,
  type SerpResult,
} from '@arablyzer/api-contract/codes'
import { SEARCH_UI } from '@arablyzer/i18n/search'
import type { Lang } from '@arablyzer/seo/site'
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client'
import { Check, Search } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { fetchSearchStatus, postSearch, type SearchError } from '../api'
import { Revealed } from '../report/Bidi'
import { ScanNote } from '../ScanNote'
import { challenge } from '../turnstile'
import { AREA, FIELD, LABEL, SUBMIT, ToolBox } from '../ToolBox'
import { parseDomain, parseQueries } from './model'
import { errorText, Notice } from './shared'

type Status = 'checking' | 'off' | 'on' | 'unknown'
type Run =
  | { readonly phase: 'idle' }
  | { readonly phase: 'running' }
  | { readonly phase: 'done'; readonly response: SerpResponse }
  | { readonly phase: 'failed'; readonly error: SearchError | 'queries' | 'domain' }

/**
 * «من ينافسك في جوجل» (M5.3): up to five queries asked of Google's results page by the API (the
 * organic results' domains alone), with the Arabic sites marked, the visitor's own domain found,
 * and the domains that recur. Off unless the operator turned it on; a sample from a server, not
 * the visitor's rank, and the page says so.
 */
export default function SerpSampler({
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
  const t = SEARCH_UI[lang].serp
  const common = SEARCH_UI[lang].common
  const [status, setStatus] = useState<Status>('checking')
  const [run, setRun] = useState<Run>({ phase: 'idle' })
  const box = useRef<HTMLDivElement>(null)
  const check = useMemo(() => challenge(PUBLIC_TURNSTILE_SITE_KEY, () => box.current, lang), [lang])

  useEffect(() => {
    let active = true
    void fetchSearchStatus().then((found) => {
      if (active) setStatus(found === null ? 'unknown' : found.serp ? 'on' : 'off')
    })
    return () => {
      active = false
    }
  }, [])

  async function onSubmit(event: TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (run.phase === 'running') return
    const data = new FormData(event.currentTarget)
    const text = (name: string) => {
      const value = data.get(name)
      return typeof value === 'string' ? value : ''
    }
    const queries = parseQueries(text('queries'))
    if (queries === null) {
      setRun({ phase: 'failed', error: 'queries' })
      return
    }
    const domain = parseDomain(text('domain'))
    if (domain === null) {
      setRun({ phase: 'failed', error: 'domain' })
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
    const request: SerpRequest = {
      queries,
      ...(domain === '' ? {} : { domain }),
      turnstileToken: token,
    }
    const answered = await postSearch<SerpResponse>(SEARCH_SERP_PATH, request)
    setRun(
      answered.ok
        ? { phase: 'done', response: answered.value }
        : { phase: 'failed', error: answered.error },
    )
  }

  const busy = run.phase === 'running'
  const problem =
    run.phase !== 'failed'
      ? ''
      : run.error === 'queries'
        ? t.queriesProblem
        : run.error === 'domain'
          ? t.domainProblem
          : errorText(lang, run.error)
  return (
    <div className="flex flex-col gap-4" data-tool={tool}>
      <ToolBox
        title={title}
        dot={dot}
        busy={busy}
        note={<ScanNote lang={lang} id="serp-note" line={t.caveat} keep={[t.sentOut]} />}
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
              <label htmlFor="serp-queries" className={LABEL}>
                {t.queriesLabel}
              </label>
              <textarea
                id="serp-queries"
                name="queries"
                rows={5}
                spellcheck={false}
                placeholder={t.queriesHint}
                aria-invalid={run.phase === 'failed' && run.error === 'queries' ? true : undefined}
                aria-describedby="serp-error"
                className={AREA}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="serp-domain" className={LABEL}>
                {t.domainLabel}
              </label>
              <input
                id="serp-domain"
                name="domain"
                type="text"
                dir="ltr"
                inputMode="url"
                autoCapitalize="none"
                spellcheck={false}
                placeholder="example.com"
                aria-invalid={run.phase === 'failed' && run.error === 'domain' ? true : undefined}
                aria-describedby="serp-error"
                className={`${FIELD} font-mono ${lang === 'ar' ? 'text-end' : 'text-start'}`}
              />
            </div>
            <div ref={box} className="empty:hidden" />
            <p id="serp-error" role="alert" className="m-0 text-small text-serious empty:hidden">
              {problem}
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
        {busy ? common.working : ''}
      </p>
      {run.phase === 'done' && <Results response={run.response} lang={lang} />}
    </div>
  )
}

function Results({ response, lang }: { response: SerpResponse; lang: Lang }) {
  const t = SEARCH_UI[lang].serp
  const all = response.queries.flatMap((query) => query.results)
  const domains = new Map(all.map((result) => [result.domain, result]))
  const arabic = [...domains.values()].filter((result) => result.arabic).length
  return (
    <section className="card flex flex-col gap-5 p-card" aria-label={t.rivals.title}>
      {domains.size > 0 && (
        <p className="m-0 text-small text-ink-2">{t.summary(arabic, domains.size)}</p>
      )}
      {response.queries.map((query) => (
        <div key={query.query} className="flex flex-col gap-2">
          <h3 className="heading-3 m-0">
            <bdi dir="auto">
              <Revealed text={query.query} />
            </bdi>
          </h3>
          {query.outcome !== 'ok' ? (
            <Notice>{t.outcomes[query.outcome]}</Notice>
          ) : (
            <>
              {response.domain !== null && (
                <p
                  className={`m-0 inline-flex items-center gap-2 text-small font-semibold ${
                    query.you === null ? 'text-ink-2' : 'text-pass'
                  }`}
                >
                  {query.you !== null && <Check size={16} aria-hidden="true" />}
                  {query.you === null ? t.youAbsent : t.you(query.you)}
                </p>
              )}
              <ol className="m-0 flex list-none flex-col p-0">
                {query.results.map((result) => (
                  <ResultRow key={result.domain} result={result} lang={lang} />
                ))}
              </ol>
            </>
          )}
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <h3 className="heading-3 m-0">{t.rivals.title}</h3>
        <p className="m-0 text-small text-ink-2">{t.rivals.intro}</p>
        {response.rivals.length === 0 ? (
          <p className="m-0 text-small text-ink-2">{t.rivals.none}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {response.rivals.map((rival) => (
              <li
                key={rival.domain}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line py-2 first:border-t-0"
              >
                <bdi dir="ltr" lang="en" className="font-mono text-small break-all text-ink">
                  {rival.domain}
                </bdi>
                <span className="text-meta text-ink-2">
                  {t.rivalQueries(rival.queries)} · {t.rivalBest(rival.best)}
                </span>
                {rival.arabic && <span className="sev sev-pass">{t.arabic}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="m-0 text-meta text-ink-2">{t.caveat}</p>
    </section>
  )
}

function ResultRow({ result, lang }: { result: SerpResult; lang: Lang }) {
  const t = SEARCH_UI[lang].serp
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line py-2 first:border-t-0">
      <span className="w-20 shrink-0 text-meta text-ink-3">
        <bdi dir="auto">{t.position(result.position)}</bdi>
      </span>
      <bdi dir="ltr" lang="en" className="min-w-0 font-mono text-small break-all text-ink">
        {result.domain}
      </bdi>
      {result.arabic ? (
        <span className="sev sev-pass" title={result.signals.map((s) => t.signals[s]).join(' · ')}>
          {t.arabic}
        </span>
      ) : (
        <span className="text-meta text-ink-3">{t.notArabic}</span>
      )}
    </li>
  )
}
