import {
  GSC_FAILURES,
  GSC_RESULT_PATTERN,
  gscKeywordsStartPath,
  OPPORTUNITY_POSITIONS,
  type GscFailure,
  type GscKeywordsResult,
  type GscRow,
} from '@arablyzer/api-contract/codes'
import { SEARCH_UI } from '@arablyzer/i18n/search'
import type { Lang } from '@arablyzer/seo/site'
import { Download, Link2, RotateCcw } from 'lucide-preact'
import type { TargetedSubmitEvent } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { fetchGscStatus, fetchKeywordsResult } from '../api'
import { takeReturn } from '../gsc-return'
import { Revealed } from '../report/Bidi'
import { ScanNote } from '../ScanNote'
import { FIELD, LABEL, SUBMIT, ToolBox } from '../ToolBox'
import { DECIMAL, NUMBER, parseDomain, PERCENT, PERCENT_WHOLE, scriptParts } from './model'
import { downloadCsv, Notice, Num, Privacy } from './shared'

type View =
  | { readonly kind: 'checking' }
  /** The API has no Search Console client: the tool says so and offers nothing. */
  | { readonly kind: 'off' }
  | { readonly kind: 'connect' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly reason: GscFailure | 'gone' }
  | { readonly kind: 'result'; readonly result: GscKeywordsResult }

/** The scripts' colours in the bar, and the dot beside each name. */
const SCRIPT_FILL = {
  arabic: 'fill-brand',
  mixed: 'fill-cat-schema',
  latin: 'fill-cat-prices',
  other: 'fill-ink-3',
} as const
const SCRIPT_DOT = {
  arabic: 'bg-brand',
  mixed: 'bg-cat-schema',
  latin: 'bg-cat-prices',
  other: 'bg-ink-3',
} as const

/**
 * «كلماتك في جوجل» (M5.3): the report's account-free Search Console connection, started from the
 * tool's page. The visitor types the site; the button sends them to Google's consent through the
 * API, and they come back here with a one-time result, shown once and gone on reload. Nothing is
 * stored and the token is revoked by the API as soon as it has read.
 */
export default function GscKeywords({
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
  const t = SEARCH_UI[lang].keywords
  const [view, setView] = useState<View>({ kind: 'checking' })
  const [problem, setProblem] = useState(false)
  // Where the focus goes when the visitor comes back from Google: the tool, far down a long page.
  const top = useRef<HTMLDivElement>(null)
  const returned = useRef(false)

  useEffect(() => {
    let active = true
    const back = takeReturn()
    if (back !== null) {
      returned.current = true
      if ((GSC_FAILURES as readonly string[]).includes(back)) {
        setView({ kind: 'failed', reason: back as GscFailure })
        return
      }
      if (GSC_RESULT_PATTERN.test(back)) {
        setView({ kind: 'loading' })
        void fetchKeywordsResult(back).then((loaded) => {
          if (!active) return
          setView(
            loaded.ok
              ? { kind: 'result', result: loaded.value }
              : { kind: 'failed', reason: 'gone' },
          )
        })
        return () => {
          active = false
        }
      }
    }
    void fetchGscStatus().then((enabled) => {
      if (active) setView({ kind: enabled ? 'connect' : 'off' })
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (returned.current && view.kind !== 'checking' && view.kind !== 'loading') {
      returned.current = false
      top.current?.focus()
    }
  }, [view.kind])

  function onSubmit(event: TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get('site')
    const site = parseDomain(typeof value === 'string' ? value : '')
    if (site === null || site === '' || !site.includes('.')) {
      setProblem(true)
      return
    }
    setProblem(false)
    // The API starts the flow and sends the visitor to Google's consent (a navigation, not a form
    // post: the page's policy lets a form post only to this site, and Google is not this site).
    window.location.assign(gscKeywordsStartPath(site, lang))
  }

  const again = () => {
    setView({ kind: 'connect' })
  }

  return (
    <div ref={top} tabIndex={-1} className="flex flex-col gap-4 outline-none" data-tool={tool}>
      <ToolBox
        title={title}
        dot={dot}
        busy={view.kind === 'loading'}
        note={<ScanNote lang={lang} id="keywords-note" line={t.privacy} keep={[]} />}
      >
        {view.kind === 'off' && <Notice>{t.off}</Notice>}
        {/* The form is in the page as sent, its button waiting until the API has said the
            connection is on (the site's audit wants the tool before any section). */}
        {(view.kind === 'checking' || view.kind === 'connect') && (
          <form
            noValidate
            onSubmit={onSubmit}
            data-tool-kind="search"
            className="flex flex-col gap-3"
          >
            <p className="m-0 text-small text-ink-2">{t.intro}</p>
            <div className="flex flex-col gap-2">
              <label htmlFor="keywords-site" className={LABEL}>
                {t.siteLabel}
              </label>
              <input
                id="keywords-site"
                name="site"
                type="text"
                dir="ltr"
                inputMode="url"
                autoCapitalize="none"
                autoComplete="url"
                spellcheck={false}
                placeholder={t.sitePlaceholder}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? 'keywords-problem' : undefined}
                className={`${FIELD} font-mono ${lang === 'ar' ? 'text-end' : 'text-start'}`}
              />
              <p
                id="keywords-problem"
                role="alert"
                className="m-0 text-small text-serious empty:hidden"
              >
                {problem ? t.siteProblem : ''}
              </p>
            </div>
            <button type="submit" disabled={view.kind === 'checking'} className={SUBMIT}>
              <Link2 size={18} aria-hidden="true" />
              {t.connect}
            </button>
            <Privacy text={t.privacy} />
          </form>
        )}
        {view.kind === 'loading' && (
          <p role="status" className="m-0 text-small text-ink-2">
            {t.loading}
          </p>
        )}
        {view.kind === 'failed' && (
          <>
            <Notice role="alert">
              {view.reason === 'denied' ? t.denied : view.reason === 'gone' ? t.gone : t.failed}
            </Notice>
            <div>
              <button type="button" onClick={again} className="btn-white">
                <RotateCcw size={16} aria-hidden="true" />
                {t.retry}
              </button>
            </div>
          </>
        )}
      </ToolBox>
      {view.kind === 'result' && <Result result={view.result} lang={lang} onClear={again} />}
    </div>
  )
}

function Result({
  result,
  lang,
  onClear,
}: {
  result: GscKeywordsResult
  lang: Lang
  onClear: () => void
}) {
  const t = SEARCH_UI[lang].keywords
  if (result.property === null) {
    return (
      <section className="card flex flex-col gap-4 p-card" aria-label={t.property}>
        <p className="m-0 text-small text-ink-2">{t.noProperty}</p>
        <div>
          <button type="button" onClick={onClear} className="btn-white">
            <RotateCcw size={16} aria-hidden="true" />
            {t.tryAnother}
          </button>
        </div>
      </section>
    )
  }
  const { totals } = result
  const parts = scriptParts(result.scripts)
  const arabicImpressions = parts.find((part) => part.script === 'arabic')?.share ?? 0
  const hasScripts = parts.some((part) => part.share > 0)
  return (
    <section className="card flex flex-col gap-5 p-card" aria-label={t.property}>
      <div className="flex flex-col gap-1 text-meta text-ink-2">
        <p className="m-0 flex flex-col">
          <span>{t.property}</span>
          <span className="block font-mono text-ink">
            <bdi dir="ltr" lang="en" className="break-all">
              {result.property.siteUrl}
            </bdi>
          </span>
        </p>
        <p className="m-0">{t.period(result.period.start, result.period.end)}</p>
      </div>
      {result.partial && <Notice>{t.partial}</Notice>}
      {result.truncated && <Notice>{t.truncated(result.analysed)}</Notice>}
      {totals === null ? (
        <p className="m-0 text-small text-ink-2">{t.totals.none}</p>
      ) : (
        <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(
            [
              [t.totals.clicks, NUMBER.format(totals.clicks)],
              [t.totals.impressions, NUMBER.format(totals.impressions)],
              [t.totals.ctr, PERCENT.format(totals.ctr)],
              [t.totals.position, DECIMAL.format(totals.position)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3">
              <dt className="text-meta text-ink-2">{label}</dt>
              <dd className="m-0 text-body font-semibold text-ink">
                <Num>{value}</Num>
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="heading-3 m-0">{t.opportunities.title}</h3>
          {result.opportunities.length > 0 && (
            <button
              type="button"
              className="btn-white"
              onClick={() => {
                downloadCsv('opportunities', [
                  [
                    t.columns.query,
                    t.columns.clicks,
                    t.columns.impressions,
                    t.columns.ctr,
                    t.columns.position,
                  ],
                  ...result.opportunities.map((row) => [
                    row.key,
                    String(row.clicks),
                    String(row.impressions),
                    row.ctr.toFixed(4),
                    row.position.toFixed(1),
                  ]),
                ])
              }}
            >
              <Download size={16} aria-hidden="true" />
              {t.opportunities.csv}
            </button>
          )}
        </div>
        <p className="m-0 text-small text-ink-2">
          {t.opportunities.intro}{' '}
          <span className="text-ink-3">
            (<Num>{`${OPPORTUNITY_POSITIONS.from}–${OPPORTUNITY_POSITIONS.to}`}</Num>)
          </span>
        </p>
        <Rows rows={result.opportunities} none={t.opportunities.none} lang={lang} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="heading-3 m-0">{t.scripts.title}</h3>
        {hasScripts ? (
          <>
            <p className="m-0 text-small text-ink-2">
              {t.scripts.intro(PERCENT_WHOLE.format(arabicImpressions))}
            </p>
            <svg
              viewBox="0 0 100 3"
              preserveAspectRatio="none"
              role="img"
              aria-label={t.scripts.title}
              className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
            >
              {parts.map((part) => (
                <rect
                  key={part.script}
                  x={part.x}
                  y={0}
                  width={part.share * 100}
                  height={3}
                  className={SCRIPT_FILL[part.script]}
                />
              ))}
            </svg>
            <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2 p-0 text-small text-ink-2 md:grid-cols-4">
              {parts.map((part) => (
                <li key={part.script} className="flex min-w-0 flex-col gap-0.5">
                  <span className="inline-flex items-center gap-2 font-semibold text-ink">
                    <span
                      aria-hidden="true"
                      className={`size-2 shrink-0 rounded-full ${SCRIPT_DOT[part.script]}`}
                    />
                    {t.scripts[part.script]}
                  </span>
                  <span className="text-meta">
                    <Num>{PERCENT_WHOLE.format(part.share)}</Num>
                    {' · '}
                    <Num>{NUMBER.format(result.scripts[part.script].queries)}</Num>{' '}
                    {t.scripts.queries}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="m-0 text-small text-ink-2">{t.scripts.none}</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="heading-3 m-0">{t.variants.title}</h3>
        <p className="m-0 text-small text-ink-2">{t.variants.intro}</p>
        {result.variants.length === 0 ? (
          <p className="m-0 text-small text-ink-2">{t.variants.none}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {result.variants.map((group) => (
              <li
                key={group.spellings.map((row) => row.key).join('|')}
                className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3"
              >
                <span className="text-meta text-ink-2">
                  {t.variants.sum(NUMBER.format(group.impressions))}
                </span>
                <span className="flex flex-wrap gap-2">
                  {group.spellings.map((row) => (
                    <span
                      key={row.key}
                      className="inline-flex items-baseline gap-2 rounded-full bg-white px-3 py-1 text-small text-ink"
                    >
                      <bdi dir="auto">
                        <Revealed text={row.key} />
                      </bdi>
                      <span className="text-meta text-ink-3">
                        <Num>{NUMBER.format(row.impressions)}</Num>
                      </span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="heading-3 m-0">{t.top.title}</h3>
        <Rows rows={result.top} none={t.top.none} lang={lang} />
      </div>

      <p className="m-0 text-meta text-ink-2">{t.shownOnce}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onClear} className="btn-white">
          {t.clear}
        </button>
      </div>
    </section>
  )
}

/** A table of queries: the query, then clicks, impressions, CTR and position, left to right. */
function Rows({ rows, none, lang }: { rows: readonly GscRow[]; none: string; lang: Lang }) {
  const c = SEARCH_UI[lang].keywords.columns
  if (rows.length === 0) return <p className="m-0 text-small text-ink-2">{none}</p>
  const head = 'px-2 py-2 text-start text-meta font-semibold text-ink-2'
  const cell = 'px-2 py-2 text-small text-ink'
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="m-0 w-full border-collapse">
        <thead className="bg-surface-2">
          <tr>
            <th scope="col" className={head}>
              {c.query}
            </th>
            <th scope="col" className={head}>
              {c.clicks}
            </th>
            <th scope="col" className={head}>
              {c.impressions}
            </th>
            <th scope="col" className={head}>
              {c.ctr}
            </th>
            <th scope="col" className={head}>
              {c.position}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-line">
              <th scope="row" className={`${cell} min-w-40 font-normal break-words`}>
                <bdi dir="auto">
                  <Revealed text={row.key} />
                </bdi>
              </th>
              <td className={cell}>
                <Num>{NUMBER.format(row.clicks)}</Num>
              </td>
              <td className={cell}>
                <Num>{NUMBER.format(row.impressions)}</Num>
              </td>
              <td className={cell}>
                <Num>{PERCENT.format(row.ctr)}</Num>
              </td>
              <td className={cell}>
                <Num>{DECIMAL.format(row.position)}</Num>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
