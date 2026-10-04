import {
  GSC_FAILURES,
  GSC_RESULT_PATTERN,
  gscStartPath,
  type GscFailure,
  type GscInspection,
  type GscResult,
  type GscRow,
} from '@arablyzer/api-contract/codes'
import { REPORT } from '@arablyzer/i18n/report'
import type { Lang } from '@arablyzer/seo/site'
import { Link2, LockKeyhole, RotateCcw, TriangleAlert } from 'lucide-preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { fetchGscResult, fetchGscStatus } from '../api'
import { Revealed } from './Bidi'

type View =
  /** Not asked yet, or the feature is off: nothing is drawn. */
  | { readonly kind: 'hidden' }
  | { readonly kind: 'connect' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly reason: GscFailure | 'gone' }
  | { readonly kind: 'result'; readonly result: GscResult }

/**
 * What `?gsc=` holds when the visitor comes back from Google: a one-time result's id, or a word.
 * It is taken out of the address at once, so a reload, a copied link or the history never has it.
 */
function takeReturn(): string | null {
  try {
    const url = new URL(window.location.href)
    const value = url.searchParams.get('gsc')
    if (value === null) return null
    url.searchParams.delete('gsc')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    return value
  } catch {
    return null
  }
}

const NUMBER = new Intl.NumberFormat('en', { maximumFractionDigits: 0 })
const DECIMAL = new Intl.NumberFormat('en', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const PERCENT = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})

/** A number as the page shows them: Latin digits, left to right, so a row reads the same in both. */
function Num({ children }: { children: string }) {
  return (
    <span dir="ltr" className="tabular-nums">
      {children}
    </span>
  )
}

/**
 * Google Search Console on a finished report (account-free, nothing stored). Hidden unless the API
 * has an OAuth client. The button goes through the API to Google's consent; the visitor comes back
 * with a one-time result, shown here and gone on reload.
 */
export function GscSection({ id, lang }: { id: string; lang: Lang }) {
  const t = REPORT[lang].gsc
  const [view, setView] = useState<View>({ kind: 'hidden' })
  const heading = useRef<HTMLHeadingElement>(null)
  // True when the visitor has just come back: the card takes the focus, since it is far down.
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
        void fetchGscResult(back).then((loaded) => {
          if (!active) return
          setView(
            loaded.ok
              ? { kind: 'result', result: loaded.value }
              : { kind: 'failed', reason: 'gone' },
          )
        })
        return
      }
    }
    void fetchGscStatus().then((enabled) => {
      if (active && enabled) setView({ kind: 'connect' })
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (returned.current && view.kind !== 'hidden' && view.kind !== 'loading') {
      returned.current = false
      heading.current?.focus()
    }
  }, [view.kind])

  if (view.kind === 'hidden') return null
  const connect = gscStartPath(id, lang)
  return (
    <section aria-labelledby="gsc-title" className="card flex flex-col gap-4 p-card">
      <h2 id="gsc-title" ref={heading} tabIndex={-1} className="heading-3 m-0 outline-none">
        {t.title}
      </h2>
      {view.kind === 'connect' && (
        <>
          <p className="m-0 text-small text-ink-2">{t.intro}</p>
          <div>
            <a href={connect} className="btn-grad">
              <Link2 size={16} aria-hidden="true" />
              {t.connect}
            </a>
          </div>
          <Privacy text={t.privacy} />
        </>
      )}
      {view.kind === 'loading' && (
        <p role="status" className="m-0 text-small text-ink-2">
          {t.loading}
        </p>
      )}
      {view.kind === 'failed' && (
        <>
          <p
            role="note"
            className="m-0 flex items-start gap-3 rounded-xl bg-moderate-soft p-3 text-small text-ink-2 forced-colors:border"
          >
            <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
            <span className="min-w-0">{view.reason === 'denied' ? t.denied : t.failed}</span>
          </p>
          <div>
            <a href={connect} className="btn-white">
              <RotateCcw size={16} aria-hidden="true" />
              {t.retry}
            </a>
          </div>
        </>
      )}
      {view.kind === 'result' && (
        <Result
          result={view.result}
          lang={lang}
          connect={connect}
          onClear={() => {
            setView({ kind: 'connect' })
          }}
        />
      )}
    </section>
  )
}

function Privacy({ text }: { text: string }) {
  return (
    <p className="m-0 flex items-start gap-2 text-meta text-ink-2">
      <LockKeyhole size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      {text}
    </p>
  )
}

function Result({
  result,
  lang,
  connect,
  onClear,
}: {
  result: GscResult
  lang: Lang
  connect: string
  onClear: () => void
}) {
  const t = REPORT[lang].gsc
  if (result.property === null) {
    return (
      <>
        <p className="m-0 text-small text-ink-2">{t.noProperty}</p>
        <div className="flex flex-wrap gap-3">
          <a href={connect} className="btn-white">
            <Link2 size={16} aria-hidden="true" />
            {t.tryAnother}
          </a>
        </div>
      </>
    )
  }
  const { totals } = result
  return (
    <>
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
      {result.partial && (
        <p
          role="note"
          className="m-0 flex items-start gap-3 rounded-xl bg-moderate-soft p-3 text-small text-ink-2 forced-colors:border"
        >
          <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
          <span className="min-w-0">{t.partial}</span>
        </p>
      )}
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
      <div className="grid gap-4 md:grid-cols-2">
        <Rows title={t.lists.queries} rows={result.queries} kind="query" lang={lang} />
        <Rows title={t.lists.pages} rows={result.pages} kind="page" lang={lang} />
        <Rows title={t.lists.countries} rows={result.countries} kind="country" lang={lang} />
      </div>
      <Inspection inspection={result.inspection} lang={lang} />
      <p className="m-0 text-meta text-ink-2">{t.shownOnce}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onClear} className="btn-white">
          {t.clear}
        </button>
      </div>
    </>
  )
}

function Rows({
  title,
  rows,
  kind,
  lang,
}: {
  title: string
  rows: readonly GscRow[]
  kind: 'query' | 'page' | 'country'
  lang: Lang
}) {
  const t = REPORT[lang].gsc
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="heading-3 m-0">{title}</h3>
      {rows.length === 0 ? (
        <p className="m-0 text-small text-ink-2">{t.lists.none}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((row) => (
            <li key={row.key} className="flex min-w-0 flex-col gap-0.5">
              {/* Aligned at the page's start whatever the text: its own direction is set inside. */}
              <span
                className={
                  kind === 'page'
                    ? 'min-w-0 font-mono text-small break-all text-ink'
                    : 'min-w-0 text-small break-words text-ink'
                }
              >
                <bdi dir={kind === 'query' ? 'auto' : 'ltr'}>
                  <Revealed text={kind === 'country' ? row.key.toUpperCase() : row.key} />
                </bdi>
              </span>
              <span className="text-meta text-ink-2">
                {t.rowDetail(NUMBER.format(row.clicks), NUMBER.format(row.impressions))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

const VERDICT = { PASS: 'pass', PARTIAL: 'partial', FAIL: 'fail', NEUTRAL: 'neutral' } as const

function Inspection({ inspection, lang }: { inspection: GscInspection | null; lang: Lang }) {
  const t = REPORT[lang].gsc.inspection
  if (inspection === null) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="heading-3 m-0">{t.title}</h3>
        <p className="m-0 text-small text-ink-2">{t.none}</p>
      </div>
    )
  }
  const known: Readonly<Record<string, keyof typeof t.verdicts>> = VERDICT
  const verdict = known[inspection.verdict ?? ''] ?? 'unknown'
  const mobile = inspection.mobileUsability
  const mobileVerdict =
    mobile?.verdict === 'PASS' ? 'pass' : mobile?.verdict === 'FAIL' ? 'fail' : 'unknown'
  const differs =
    inspection.googleCanonical !== null &&
    inspection.userCanonical !== null &&
    inspection.googleCanonical !== inspection.userCanonical
  const rows: [string, preact.ComponentChildren][] = [
    [t.verdict, t.verdicts[verdict]],
    ...(inspection.coverageState === null
      ? []
      : [
          [
            t.coverage,
            <bdi dir="ltr" lang="en">
              {inspection.coverageState}
            </bdi>,
          ] as [string, preact.ComponentChildren],
        ]),
    ...(inspection.lastCrawlTime === null
      ? []
      : [
          [t.lastCrawl, <Num>{inspection.lastCrawlTime.slice(0, 10)}</Num>] as [
            string,
            preact.ComponentChildren,
          ],
        ]),
    ...(inspection.googleCanonical === null
      ? []
      : [
          [t.googleCanonical, <Url url={inspection.googleCanonical} />] as [
            string,
            preact.ComponentChildren,
          ],
        ]),
    ...(inspection.userCanonical === null
      ? []
      : [
          [t.userCanonical, <Url url={inspection.userCanonical} />] as [
            string,
            preact.ComponentChildren,
          ],
        ]),
    ...(mobile === null
      ? []
      : [[t.mobile, t.mobileVerdicts[mobileVerdict]] as [string, preact.ComponentChildren]]),
  ]
  return (
    <div className="flex flex-col gap-2">
      <h3 className="heading-3 m-0">{t.title}</h3>
      <dl className="m-0 flex flex-col gap-3 text-small">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid items-start gap-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-x-4"
          >
            <dt className="text-meta text-ink-2 sm:pt-0.5">{label}</dt>
            <dd className="m-0 min-w-0 text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {differs && (
        <p
          role="note"
          className="m-0 flex items-start gap-3 rounded-xl bg-moderate-soft p-3 text-small text-ink-2 forced-colors:border"
        >
          <TriangleAlert aria-hidden="true" size={16} className="mt-1 shrink-0 text-moderate" />
          <span className="min-w-0">{t.canonicalDiffers}</span>
        </p>
      )}
    </div>
  )
}

function Url({ url }: { url: string }) {
  return (
    <span className="block max-w-full font-mono text-meta break-all">
      <bdi dir="ltr">
        <Revealed text={url} />
      </bdi>
    </span>
  )
}
