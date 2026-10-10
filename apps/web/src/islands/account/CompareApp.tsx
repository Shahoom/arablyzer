import type {
  ChangeKind,
  CrawlComparison,
  CrawlIssueChange,
  ScanComparison,
  ScoreChange,
} from '@arablyzer/api-contract/codes'
import { CHANGE_KINDS } from '@arablyzer/api-contract/codes'
import { ACCOUNT_UI } from '@arablyzer/i18n/account'
import { COMPARE_UI } from '@arablyzer/i18n/compare'
import { CRAWL_UI } from '@arablyzer/i18n/crawl'
import { REPORT } from '@arablyzer/i18n/report'
import { localePath, PATHS, type Lang } from '@arablyzer/seo/site'
import { PUBLIC_AUTH_GOOGLE_CLIENT_ID } from 'astro:env/client'
import { ArrowLeft, ExternalLink } from 'lucide-preact'
import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { compareCrawls, compareScans, type CompareProblem } from '../compare-api'
import { readQuery, signed, toneOf, type Tone } from '../compare-model'
import PdfDownload from '../pdf/PdfDownload'
import { templateLabel } from '../crawl-model'
import { SeverityPill } from '../report/ui'
import { dayLabel, reportHref, shortUrl } from '../sites-model'

interface Props {
  lang: Lang
}

type View =
  | { readonly kind: 'loading' }
  | { readonly kind: 'off' }
  | { readonly kind: 'problem'; readonly problem: CompareProblem }
  | { readonly kind: 'scan'; readonly data: ScanComparison }
  | { readonly kind: 'crawl'; readonly data: CrawlComparison }

const TONE_CLASS: Readonly<Record<Tone, string>> = {
  better: 'bg-pass-soft text-pass',
  worse: 'bg-critical-soft text-critical-ink',
  same: 'bg-surface-2 text-ink-2',
  none: 'bg-surface-2 text-ink-2',
}
const KIND_CLASS: Readonly<Record<ChangeKind, string>> = {
  new: 'bg-critical-soft text-critical-ink',
  worsened: 'bg-serious-soft text-serious',
  fixed: 'bg-pass-soft text-pass',
  improved: 'bg-pass-soft text-pass',
  unchanged: 'bg-surface-2 text-ink-2',
}

/**
 * The comparison page's island (M4.6): two reports of one site, or two crawls, as the address
 * names them. It asks for nothing until the page has loaded, and says plainly when the two cannot
 * be compared. Every number is the API's.
 */
export default function CompareApp({ lang }: Props) {
  const t = COMPARE_UI[lang].compare
  const account = ACCOUNT_UI[lang]
  const [view, setView] = useState<View>({ kind: 'loading' })
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let live = true
    const asked = readQuery(window.location.search)
    if ((PUBLIC_AUTH_GOOGLE_CLIENT_ID ?? '') === '') {
      setView({ kind: 'off' })
      return
    }
    if (asked === null) {
      setView({ kind: 'problem', problem: 'other' })
      return
    }
    const done =
      asked.type === 'scan'
        ? compareScans(asked.base, asked.head)
        : compareCrawls(asked.base, asked.head)
    void done.then((got) => {
      if (!live) return
      if (!got.ok) setView({ kind: 'problem', problem: got.problem })
      else if (asked.type === 'scan') setView({ kind: 'scan', data: got.value as ScanComparison })
      else setView({ kind: 'crawl', data: got.value as CrawlComparison })
    })
    return () => {
      live = false
    }
  }, [])

  const kind = view.kind
  useEffect(() => {
    if (kind !== 'loading') heading.current?.focus({ preventScroll: true })
  }, [kind])

  const head = (
    <div className="flex flex-col gap-2">
      <a
        href={localePath(lang, PATHS.account)}
        className="inline-flex min-h-11 items-center gap-2 self-start text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" size={16} className="rtl:rotate-180" />
        {t.back}
      </a>
      <h1 ref={heading} tabIndex={-1} className="heading-1 m-0 outline-none">
        {t.title}
      </h1>
      <p className="m-0 text-body text-ink-2">{t.lead}</p>
    </div>
  )

  if (view.kind === 'loading') {
    return (
      <div aria-busy="true" className="flex flex-col gap-6">
        {head}
        <p role="status" className="m-0 text-small text-ink-2">
          {t.loading}
        </p>
      </div>
    )
  }
  if (view.kind === 'off') {
    return (
      <div className="flex flex-col gap-6">
        {head}
        <p className="card m-0 rounded-card p-card text-body text-ink-2">
          {account.account.unavailable}
        </p>
      </div>
    )
  }
  if (view.kind === 'problem') {
    return (
      <div className="flex flex-col gap-6">
        {head}
        <p role="alert" className="card m-0 rounded-card p-card text-body text-ink-2">
          {t.problems[view.problem]}{' '}
          {view.problem === 'unauthorized' && (
            <a
              className="font-semibold text-brand-ink underline underline-offset-4"
              href={localePath(lang, PATHS.login)}
            >
              {account.login.title}
            </a>
          )}
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      {head}
      <PdfDownload
        lang={lang}
        ask={
          view.kind === 'scan'
            ? { kind: 'compare-scans', base: view.data.base.id, head: view.data.head.id }
            : { kind: 'compare-crawls', base: view.data.base.id, head: view.data.head.id }
        }
        what={shortUrl(view.kind === 'scan' ? view.data.head.url : view.data.head.origin)}
        className="flex flex-col gap-2 self-start"
      />
      {view.kind === 'scan' ? (
        <ScanView lang={lang} data={view.data} />
      ) : (
        <CrawlView lang={lang} data={view.data} />
      )}
    </div>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ComponentChildren
}) {
  return (
    <section aria-labelledby={id} className="card flex flex-col gap-4 rounded-card p-card">
      <h2 id={id} className="heading-3 m-0">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** «70 → 82 +12»: the two scores and what changed, with a word as well as a colour. */
function ScoreRow({ lang, change, label }: { lang: Lang; change: ScoreChange; label: string }) {
  const t = COMPARE_UI[lang].compare.score
  const tone = toneOf(change)
  const word = { better: t.better, worse: t.worse, same: t.same, none: t.none }[tone]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-small font-semibold text-ink">{label}</span>
      <span className="text-body tabular-nums" dir="ltr">
        {change.before ?? '–'} <span aria-hidden="true">→</span> {change.after ?? '–'}
      </span>
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-small font-semibold ${TONE_CLASS[tone]}`}
      >
        <span dir="ltr" className="tabular-nums">
          {signed(change.change)}
        </span>
        {word}
      </span>
    </div>
  )
}

function ScoreTable({
  lang,
  rows,
  first,
}: {
  lang: Lang
  first: string
  rows: readonly { readonly label: string; readonly change: ScoreChange; readonly note?: string }[]
}) {
  const t = COMPARE_UI[lang].compare.score
  return (
    <div role="region" aria-label={first} tabIndex={0} className="overflow-x-auto">
      <table className="w-full border-collapse text-start text-small">
        <thead>
          <tr className="text-meta text-ink-2">
            <th scope="col" className="py-2 pe-3 text-start font-semibold">
              {first}
            </th>
            <th scope="col" className="py-2 pe-3 text-start font-semibold">
              {t.before}
            </th>
            <th scope="col" className="py-2 pe-3 text-start font-semibold">
              {t.after}
            </th>
            <th scope="col" className="py-2 text-start font-semibold">
              {t.change}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-line">
              <th scope="row" className="py-2 pe-3 text-start font-normal">
                {row.label}
                {row.note !== undefined && (
                  <span className="ms-2 text-meta text-ink-2">{row.note}</span>
                )}
              </th>
              <td className="py-2 pe-3 tabular-nums" dir="ltr">
                {row.change.before ?? '–'}
              </td>
              <td className="py-2 pe-3 tabular-nums" dir="ltr">
                {row.change.after ?? '–'}
              </td>
              <td className="py-2 tabular-nums" dir="ltr">
                {signed(row.change.change)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Counts({ lang, counts }: { lang: Lang; counts: Readonly<Record<ChangeKind, number>> }) {
  const t = COMPARE_UI[lang].compare.changes
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {CHANGE_KINDS.map((kind) => (
        <li
          key={kind}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-small font-semibold ${KIND_CLASS[kind]}`}
        >
          {t.kinds[kind]}
          <span dir="ltr" className="tabular-nums">
            {counts[kind]}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The findings in groups by what became of them; the unchanged stay folded until asked. */
function Grouped<T extends { kind: ChangeKind }>({
  lang,
  items,
  render,
  omitted,
}: {
  lang: Lang
  items: readonly T[]
  render: (item: T) => ComponentChildren
  omitted: number
}) {
  const t = COMPARE_UI[lang].compare.changes
  const [unchanged, setUnchanged] = useState(false)
  if (items.length === 0) return <p className="m-0 text-body text-ink-2">{t.none}</p>
  return (
    <div className="flex flex-col gap-5">
      {CHANGE_KINDS.map((kind) => {
        const group = items.filter((item) => item.kind === kind)
        if (group.length === 0) return null
        const folded = kind === 'unchanged' && !unchanged
        return (
          <div key={kind} className="flex flex-col gap-2">
            <h3 className="m-0 flex flex-wrap items-baseline gap-x-3 text-body font-semibold text-ink">
              {t.kinds[kind]}
              <span dir="ltr" className="text-small font-normal text-ink-2 tabular-nums">
                {group.length}
              </span>
              <span className="text-small font-normal text-ink-2">{t.kindHints[kind]}</span>
            </h3>
            {kind === 'unchanged' && (
              <button
                type="button"
                className="btn-ghost self-start"
                aria-expanded={unchanged}
                onClick={() => {
                  setUnchanged(!unchanged)
                }}
              >
                {unchanged ? t.hideUnchanged : t.showUnchanged(group.length)}
              </button>
            )}
            {!folded && (
              <ul className="m-0 flex list-none flex-col p-0">
                {group.map((item, index) => (
                  <li
                    key={index}
                    className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0"
                  >
                    {render(item)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {omitted > 0 && <p className="m-0 text-small text-ink-2">{t.omitted(omitted)}</p>}
    </div>
  )
}

function ScanView({ lang, data }: { lang: Lang; data: ScanComparison }) {
  const t = COMPARE_UI[lang].compare
  const names = REPORT[lang].categories as Readonly<Record<string, string>>
  const sides = [
    { label: t.reports.base, scan: data.base },
    { label: t.reports.head, scan: data.head },
  ]
  return (
    <>
      <Section id="cmp-reports" title={t.reports.title}>
        <div className="grid gap-3 sm:grid-cols-2">
          {sides.map(({ label, scan }) => (
            <div key={label} className="flex flex-col gap-1 rounded-xl border border-line p-4">
              <span className="text-meta text-ink-2">{label}</span>
              <bdi dir="ltr" className="text-small font-semibold break-all text-ink">
                {shortUrl(scan.url)}
              </bdi>
              <span className="text-small text-ink-2">{dayLabel(scan.createdAt, lang)}</span>
              <a
                className="inline-flex min-h-11 items-center gap-1 self-start text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                href={reportHref(lang, scan.id)}
              >
                {t.reports.openReport}
                <ExternalLink aria-hidden="true" size={14} />
              </a>
            </div>
          ))}
        </div>
      </Section>

      <Section id="cmp-score" title={t.score.title}>
        <ScoreRow lang={lang} change={data.overall} label={t.score.overall} />
        {!data.sameRules && <p className="m-0 text-small text-ink-2">{t.score.rulesNote}</p>}
        {data.categories.length > 0 && (
          <ScoreTable
            lang={lang}
            first={t.categories.category}
            rows={data.categories.map((row) => ({
              label: names[row.category] ?? row.category,
              change: row,
            }))}
          />
        )}
      </Section>

      <Section id="cmp-engines" title={t.engines.title}>
        {data.engines.length === 0 ? (
          <p className="m-0 text-body text-ink-2">{t.engines.none}</p>
        ) : (
          <div role="region" aria-label={t.engines.title} tabIndex={0} className="overflow-x-auto">
            <table className="w-full border-collapse text-start text-small">
              <thead>
                <tr className="text-meta text-ink-2">
                  <th scope="col" className="py-2 pe-3 text-start font-semibold">
                    {t.engines.engine}
                  </th>
                  <th scope="col" className="py-2 pe-3 text-start font-semibold">
                    {t.reports.base}
                  </th>
                  <th scope="col" className="py-2 text-start font-semibold">
                    {t.reports.head}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.engines.map((row) => (
                  <tr key={row.engine} className="border-t border-line">
                    <th scope="row" className="py-2 pe-3 text-start font-semibold">
                      {t.engines.names[row.engine]}
                    </th>
                    {[
                      { state: row.before, seen: row.findingsBefore },
                      { state: row.after, seen: row.findingsAfter },
                    ].map((side, index) => (
                      <td key={index} className="py-2 pe-3">
                        {side.state === null ? t.engines.notRun : t.engines.states[side.state]}
                        {side.seen !== null && (
                          <span className="text-ink-2">
                            {t.engines.findings}:{' '}
                            <span dir="ltr" className="tabular-nums">
                              {side.seen}
                            </span>
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="cmp-changes" title={t.changes.title}>
        <Counts lang={lang} counts={data.counts} />
        <Grouped
          lang={lang}
          items={data.changes}
          omitted={data.omitted}
          render={(item) => (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityPill severity={item.severity} lang={lang} />
                <code dir="ltr" className="text-meta text-ink-2">
                  {item.ruleId}
                </code>
                {item.before !== null && item.after !== null && item.before !== item.after && (
                  <span className="text-meta text-ink-2">
                    {t.changes.severityChange(
                      t.changes.severity[item.before],
                      t.changes.severity[item.after],
                    )}
                  </span>
                )}
              </div>
              <p className="m-0 text-body text-ink">{item.message[lang]}</p>
              {item.locator !== null && (
                <bdi dir="ltr" className="text-meta break-all text-ink-2">
                  {item.locator}
                </bdi>
              )}
              {item.engines.length > 0 && (
                <span className="text-meta text-ink-2">
                  {t.changes.seenIn}:{' '}
                  {item.engines.map((e) => t.engines.names[e]).join(lang === 'ar' ? '، ' : ', ')}
                </span>
              )}
            </>
          )}
        />
      </Section>
    </>
  )
}

function CrawlView({ lang, data }: { lang: Lang; data: CrawlComparison }) {
  const t = COMPARE_UI[lang].compare
  const r = CRAWL_UI[lang].report
  const sides = [
    { label: t.reports.base, crawl: data.base },
    { label: t.reports.head, crawl: data.head },
  ]
  const named = (item: { pattern: string; kind?: string; templateKind?: string }) =>
    templateLabel(r, {
      kind: (item.kind ?? item.templateKind ?? 'generic') as CrawlIssueChange['templateKind'],
      pattern: item.pattern,
    })
  return (
    <>
      <Section id="cmp-reports" title={t.reports.title}>
        <div className="grid gap-3 sm:grid-cols-2">
          {sides.map(({ label, crawl }) => (
            <div key={label} className="flex flex-col gap-1 rounded-xl border border-line p-4">
              <span className="text-meta text-ink-2">{label}</span>
              <bdi dir="ltr" className="text-small font-semibold break-all text-ink">
                {shortUrl(crawl.origin)}
              </bdi>
              <span className="text-small text-ink-2">{dayLabel(crawl.createdAt, lang)}</span>
              <span className="text-small text-ink-2">
                {CRAWL_UI[lang].row.summary(crawl.pagesChecked, crawl.templates)}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="cmp-score" title={t.score.title}>
        <ScoreRow lang={lang} change={data.score} label={t.crawl.score} />
        <h3 className="heading-3 m-0">{t.crawl.templatesTitle}</h3>
        <p className="m-0 text-small text-ink-2">{t.crawl.templatesLead}</p>
        <div
          role="region"
          aria-label={t.crawl.templatesTitle}
          tabIndex={0}
          className="overflow-x-auto"
        >
          <table className="w-full border-collapse text-start text-small">
            <thead>
              <tr className="text-meta text-ink-2">
                <th scope="col" className="py-2 pe-3 text-start font-semibold">
                  {t.crawl.template}
                </th>
                <th scope="col" className="py-2 pe-3 text-start font-semibold">
                  {t.crawl.pages}
                </th>
                <th scope="col" className="py-2 text-start font-semibold">
                  {t.crawl.score}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.templates.map((row) => (
                <tr key={row.pattern} className="border-t border-line align-top">
                  <th scope="row" className="py-2 pe-3 text-start font-semibold">
                    {named(row)}
                    {row.before === null && (
                      <span className="ms-2 text-meta text-ink-2">{t.crawl.appeared}</span>
                    )}
                    {row.after === null && (
                      <span className="ms-2 text-meta text-ink-2">{t.crawl.gone}</span>
                    )}
                  </th>
                  <td className="py-2 pe-3">
                    {[row.before, row.after].map((side, index) => (
                      <div key={index} className="text-ink-2">
                        {side === null ? '–' : t.crawl.pagesOf(side.found, side.checked)}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 tabular-nums" dir="ltr">
                    {row.score.before ?? '–'} → {row.score.after ?? '–'} ({signed(row.score.change)}
                    )
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="cmp-changes" title={t.crawl.issuesTitle}>
        <p className="m-0 text-small text-ink-2">{t.crawl.issuesLead}</p>
        <Counts lang={lang} counts={data.counts} />
        <Grouped
          lang={lang}
          items={data.changes}
          omitted={data.omitted}
          render={(item) => (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityPill severity={item.severity} lang={lang} />
                <code dir="ltr" className="text-meta text-ink-2">
                  {item.ruleId}
                </code>
                {item.rendered && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-meta text-ink-2">
                    {t.crawl.rendered}
                  </span>
                )}
              </div>
              <p className="m-0 text-body text-ink">{item.title[lang]}</p>
              <span className="text-small text-ink-2">{named(item)}</span>
              <span className="text-small text-ink-2">
                {t.score.before}:{' '}
                {item.before === null ? '–' : t.crawl.share(item.before.pages, item.before.checked)}
                {lang === 'ar' ? '،' : ','} {t.score.after}:{' '}
                {item.after === null ? '–' : t.crawl.share(item.after.pages, item.after.checked)}
              </span>
            </>
          )}
        />
      </Section>
    </>
  )
}
