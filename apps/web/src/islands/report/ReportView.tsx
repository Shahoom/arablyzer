import { reportPath } from '@arablyzer/api-contract/codes'
import { CATEGORIES, REPORT } from '@arablyzer/i18n/report'
import type { Report, RuleResult, Severity } from '@arablyzer/report-schema'
import { STRINGS } from '@arablyzer/seo/strings'
import { localePath, type Lang } from '@arablyzer/seo/site'
import { Braces, Check, Copy, EyeOff, RotateCcw } from 'lucide-preact'
import type { TargetedKeyboardEvent } from 'preact'
import { useState } from 'preact/hooks'
import { METHODOLOGY } from '../../lib/site'
import { ENGINES, problemsOf, type RuleFindings } from '../report-model'
import { Bidi } from './Bidi'
import { Evidence } from './Evidence'
import { Notices } from './Notices'
import { Crosshairs, ENGINE_LABEL, SectionHead, SeverityPill } from './ui'

export type Fixes = Readonly<Record<string, { readonly fix: string }>>

/** The finished report (the approved Report design). */
export function ReportView({
  id,
  report,
  fixes,
  lang,
  tool,
}: {
  id: string
  report: Report
  fixes: Fixes | null
  lang: Lang
  /** The tool a tool page's scan ran (M2.2): its rules alone, so no overall score. */
  tool?: string | undefined
}) {
  const problems = problemsOf(report)
  const [tab, setTab] = useState<Tab>('problems')
  return (
    <div className="flex flex-col">
      <ReportHeader id={id} report={report} lang={lang} tool={tool} />
      <div className="grid items-start gap-8 px-5 pt-8 pb-16 md:px-16 lg:grid-cols-12 lg:gap-x-8">
        <aside
          className="flex flex-col gap-5 lg:sticky lg:top-6 lg:col-span-4"
          aria-label={REPORT[lang].contents.title}
        >
          {tool === undefined && <ScoreCard report={report} lang={lang} />}
          <Contents report={report} problems={problems.length} lang={lang} onOpen={setTab} />
        </aside>
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          {report.scan.status === 'partial' && (
            <div
              role="note"
              className="flex flex-col gap-1 border border-moderate-line bg-moderate-soft px-5 py-4"
            >
              <strong className="text-moderate">{REPORT[lang].states.partial.title}</strong>
              <span className="text-[15px] leading-[1.7] text-ink-2">
                {REPORT[lang].states.partial.text}
              </span>
            </div>
          )}
          <Engines report={report} lang={lang} />
          <Notices notices={report.scan.notices} lang={lang} id="notices-title" />
          <Results
            report={report}
            problems={problems}
            fixes={fixes}
            lang={lang}
            tab={tab}
            onTab={setTab}
          />
        </div>
      </div>
    </div>
  )
}

function ReportHeader({
  id,
  report,
  lang,
  tool,
}: {
  id: string
  report: Report
  lang: Lang
  tool: string | undefined
}) {
  const t = REPORT[lang].header
  const [copied, setCopied] = useState(false)
  const url = report.target.finalUrl ?? report.target.url
  const copy = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setCopied(true)
      })
      .catch(() => undefined)
  }
  // Again with the same page: the tool's page for a tool's result, the home page's form otherwise.
  const again = encodeURIComponent(report.target.url)
  const rescan =
    tool === undefined
      ? `${localePath(lang, '/')}?url=${again}#scan`
      : `${localePath(lang, `/tools/${tool}`)}?url=${again}`
  const button =
    'flex h-[46px] items-center gap-2 border-[1.5px] border-ink bg-white px-4 text-[15px] font-semibold hover:text-signal'
  return (
    <section
      aria-labelledby="report-title"
      className="flex flex-col gap-4 border-b border-ink bg-white px-5 pt-7 pb-6 md:px-16"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          {tool === undefined ? (
            <span className="text-sm font-semibold text-signal">{t.kicker}</span>
          ) : (
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-signal">
              {t.tool}
              <a
                href={localePath(lang, `/tools/${tool}`)}
                dir="ltr"
                className="font-mono font-normal text-ink-2 underline underline-offset-4 hover:text-signal"
              >
                {tool}
              </a>
            </span>
          )}
          <h1 id="report-title" className="m-0 text-3xl leading-tight font-semibold md:text-[38px]">
            {t.title}
          </h1>
          <a
            href={url}
            dir="ltr"
            rel="nofollow noreferrer noopener"
            className="self-start font-mono text-base break-all underline decoration-2 underline-offset-[5px] md:text-xl"
          >
            {url}
          </a>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <span>
              {t.scannedOn}{' '}
              <span dir="ltr" className="font-mono">
                {report.target.fetchedAt.slice(0, 10)}
              </span>
            </span>
            {report.target.http.status !== null && (
              <span dir="ltr" className="border border-rule-strong px-2 py-0.5 font-mono text-xs">
                HTTP {report.target.http.status}
              </span>
            )}
            <span className="border border-rule-strong px-2 py-0.5 text-xs">
              {t.rules}{' '}
              <span dir="ltr" className="font-mono">
                {report.generator.rulesetVersion}
              </span>
            </span>
            <span className="flex items-center gap-1.5 bg-paper px-2 py-0.5 text-xs">
              <EyeOff size={13} aria-hidden="true" />
              {t.noindex}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={copy} className={button}>
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            <span aria-live="polite">{copied ? t.copied : t.copyLink}</span>
          </button>
          <a href={reportPath(id)} className={button}>
            <Braces size={16} aria-hidden="true" />
            <span dir="ltr" className="font-mono">
              {t.json}
            </span>
          </a>
          <a
            href={rescan}
            className="flex h-[46px] items-center gap-2 bg-ink px-5 text-[15px] font-semibold text-white hover:bg-signal"
          >
            <RotateCcw size={16} aria-hidden="true" />
            {t.rescan}
          </a>
        </div>
      </div>
    </section>
  )
}

function ScoreCard({ report, lang }: { report: Report; lang: Lang }) {
  const t = REPORT[lang].score
  const { overall, rules, categories } = report.score
  const listed = CATEGORIES.filter((category) => category in categories)
  return (
    <section
      aria-labelledby="score-title"
      className="relative flex flex-col bg-panel-grid text-panel-text"
    >
      <Crosshairs />
      <div className="flex items-center justify-between border-b border-panel-line px-5 py-3.5 text-xs text-panel-dim">
        <h2 id="score-title" className="m-0 text-xs font-semibold">
          {t.title}
        </h2>
        <span dir="ltr" lang="en" className="font-mono">
          {rules.ran} / {rules.total} rules
        </span>
      </div>
      <div className="flex flex-col gap-3 px-5 pt-6 pb-5">
        <span dir="ltr" className="self-end font-mono text-[88px] leading-[0.85] text-white">
          {overall ?? '—'}
          <span className="text-xl text-panel-dim">/100</span>
        </span>
        <span className="text-xs text-panel-dim">
          {overall === null
            ? ''
            : STRINGS[lang].report.score(overall, report.score.partial, rules.ran, rules.total)}
        </span>
      </div>
      <dl className="m-0 grid grid-cols-3 border-y border-panel-line">
        {(
          [
            ['fail', report.summary.fail, 'text-panel-signal'],
            ['pass', report.summary.pass, 'text-panel-pass'],
            ['not-applicable', report.summary.notApplicable, 'text-panel-text'],
          ] as const
        ).map(([status, count, colour]) => (
          <div
            key={status}
            className="flex flex-col gap-1 border-e border-panel-line px-5 py-3.5 last:border-e-0"
          >
            <dt className="text-xs text-panel-dim">{STRINGS[lang].report.status[status]}</dt>
            <dd dir="ltr" className={`m-0 self-start font-mono text-2xl ${colour}`}>
              {count}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2.5 px-5 py-5 text-[13px]">
        <span className="pb-1 text-xs font-semibold text-panel-dim">{t.categories}</span>
        {listed.map((category) => {
          const value = categories[category] ?? null
          const low = value !== null && value < 100
          return (
            <div
              key={category}
              className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2rem] items-center gap-2.5"
            >
              <span className={low ? 'font-semibold text-white' : 'text-panel-soft'}>
                {REPORT[lang].categories[category]}
              </span>
              <span className="relative h-1.5 bg-panel-line" aria-hidden="true">
                {value !== null && (
                  <span
                    className={`absolute inset-y-0 start-0 ${
                      value === 0 ? 'bg-panel-signal' : low ? 'bg-panel-text' : 'bg-panel-tick'
                    }`}
                    style={{ width: value === 0 ? '3px' : `${value}%` }}
                  />
                )}
              </span>
              <span
                dir="ltr"
                className={`text-end font-mono ${value === 0 ? 'text-panel-signal' : 'text-white'}`}
                title={value === null ? t.none : undefined}
              >
                {value ?? '—'}
              </span>
            </div>
          )
        })}
      </div>
      <a
        href={METHODOLOGY}
        className="border-t border-panel-line px-5 py-3.5 text-[13px] text-panel-measure underline underline-offset-4"
      >
        {t.methodology}
      </a>
    </section>
  )
}

function Contents({
  report,
  problems,
  lang,
  onOpen,
}: {
  report: Report
  problems: number
  lang: Lang
  onOpen: (tab: Tab) => void
}) {
  const t = REPORT[lang].contents
  const runs = report.scan.render ?? []
  const rendered = runs.filter((run) => run.status === 'rendered').length
  const items: [string, string, string, Tab | null][] = [
    ['#results-title', t.findings, String(problems), 'problems'],
    // No browser ran (a page that is not HTML): no section to go to.
    ...(runs.length === 0
      ? []
      : [['#engines-title', t.engines, String(rendered), null] as [string, string, string, null]]),
    ['#results-title', t.passed, String(report.summary.pass), 'pass'],
  ]
  return (
    <nav
      aria-labelledby="contents-title"
      className="flex flex-col border border-rule-strong bg-white"
    >
      <h2
        id="contents-title"
        className="m-0 border-b border-rule-soft px-5 py-3 text-sm font-semibold"
      >
        {t.title}
      </h2>
      {items.map(([href, label, count, tab]) => (
        <a
          key={label}
          href={href}
          onClick={() => {
            if (tab !== null) onOpen(tab)
          }}
          className="flex items-center justify-between border-b border-rule-soft px-5 py-3 text-[15px] hover:text-signal"
        >
          {label}
          <span dir="ltr" className="font-mono text-ink-3">
            {count}
          </span>
        </a>
      ))}
    </nav>
  )
}

function Engines({ report, lang }: { report: Report; lang: Lang }) {
  const t = REPORT[lang]
  const runs = report.scan.render ?? []
  if (runs.length === 0) return null
  const rendered = runs.filter((run) => run.status === 'rendered').length
  // An engine that shows a problem no other engine shows is the one worth a look: said only
  // where at least two rendered, so there are others to compare it with.
  const alone = new Set(
    rendered < 2
      ? []
      : report.findings
          .map((finding) => finding.evidence.engines)
          .filter((engines) => engines?.length === 1)
          .map((engines) => engines?.[0]),
  )
  return (
    <section aria-labelledby="engines-title" className="flex flex-col gap-3.5">
      <SectionHead
        number={1}
        id="engines-title"
        title={rendered === 0 ? t.contents.engines : t.engines.title(rendered)}
      />
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3">
        {ENGINES.map((engine) => {
          const run = runs.find((candidate) => candidate.engine === engine)
          if (run === undefined) return null
          const flagged = alone.has(engine)
          return (
            <li
              key={engine}
              className={`flex flex-col gap-1.5 bg-white px-4 py-3 ${
                flagged ? 'border-[1.5px] border-signal' : 'border border-rule-strong'
              }`}
            >
              <span dir="ltr" className="self-start font-mono text-[13px] font-semibold">
                {ENGINE_LABEL[engine]} {run.version ?? ''}
              </span>
              <span
                className={`text-[13px] ${
                  run.status === 'rendered' && !flagged ? 'text-pass' : 'text-signal'
                }`}
              >
                {flagged
                  ? t.engines.alone
                  : run.status === 'rendered'
                    ? `${t.progress.engine.rendered} · ${t.engines.requests(run.requests.total)}`
                    : t.progress.engine[run.status]}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

type Tab = 'problems' | 'pass' | 'not-applicable'

function Results({
  report,
  problems,
  fixes,
  lang,
  tab,
  onTab,
}: {
  report: Report
  problems: readonly RuleFindings[]
  fixes: Fixes | null
  lang: Lang
  tab: Tab
  onTab: (tab: Tab) => void
}) {
  const t = REPORT[lang]
  const [only, setOnly] = useState<Severity | null>(null)
  const severities = [...new Set(problems.map(({ rule }) => rule.severity))]
  const shown = only === null ? problems : problems.filter(({ rule }) => rule.severity === only)
  const tabs: [Tab, string, number][] = [
    ['problems', t.tabs.problems, problems.length],
    ['pass', t.tabs.pass, report.summary.pass],
    ['not-applicable', t.tabs.notApplicable, report.summary.notApplicable],
  ]
  // The tabs as one control (WAI-ARIA tabs): the arrows move along them, in the page's direction.
  const move = (event: TargetedKeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex(([key]) => key === tab)
    const next = lang === 'ar' ? 'ArrowLeft' : 'ArrowRight'
    const previous = lang === 'ar' ? 'ArrowRight' : 'ArrowLeft'
    const to =
      event.key === next
        ? (index + 1) % tabs.length
        : event.key === previous
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null
    const key = to === null ? undefined : tabs[to]?.[0]
    if (key === undefined) return
    event.preventDefault()
    onTab(key)
    document.getElementById(`tab-${key}`)?.focus()
  }
  return (
    <section
      id="results"
      aria-labelledby="results-title"
      className="flex scroll-mt-6 flex-col gap-4"
    >
      {/* The browsers are § 01 when the scan rendered the page; without them, the results are. */}
      <SectionHead
        number={(report.scan.render ?? []).length > 0 ? 2 : 1}
        id="results-title"
        title={t.results}
      />
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b-2 border-ink">
        <div
          role="tablist"
          aria-label={t.findings.title}
          className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:flex-wrap"
        >
          {tabs.map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-selected={tab === key}
              aria-controls="results-panel"
              tabIndex={tab === key ? 0 : -1}
              onClick={() => {
                onTab(key)
              }}
              onKeyDown={move}
              className={`flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[15px] leading-tight sm:flex-row sm:gap-1.5 sm:px-4 sm:text-base ${
                tab === key ? 'bg-ink font-semibold text-white' : 'bg-transparent hover:text-signal'
              }`}
            >
              <span>{label}</span>
              <span dir="ltr" className={`font-mono ${tab === key ? '' : 'text-ink-3'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>
        {tab === 'problems' && severities.length > 1 && (
          <div role="group" aria-label={t.tabs.filter} className="flex flex-wrap gap-1.5 pb-2">
            {severities.map((severity) => (
              <button
                key={severity}
                type="button"
                aria-pressed={only === severity}
                onClick={() => {
                  setOnly(only === severity ? null : severity)
                }}
                className={`h-8 cursor-pointer border px-3 text-[13px] ${
                  only === severity ? 'border-ink bg-ink text-white' : 'border-rule-strong bg-white'
                }`}
              >
                {STRINGS[lang].report.severity[severity]}{' '}
                {problems.filter(({ rule }) => rule.severity === severity).length}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        role="tabpanel"
        id="results-panel"
        aria-labelledby={`tab-${tab}`}
        className="flex flex-col gap-5"
      >
        {tab === 'problems' &&
          (shown.length === 0 ? (
            <p className="m-0 border border-pass bg-pass-soft px-5 py-4 text-pass">
              {t.findings.none}
            </p>
          ) : (
            shown.map((entry, index) => (
              <FindingCard
                key={entry.rule.id}
                number={problems.indexOf(entry) + 1}
                entry={entry}
                fix={fixes?.[entry.rule.id]?.fix ?? null}
                lang={lang}
                first={index === 0}
              />
            ))
          ))}
        {tab !== 'problems' && (
          <RuleList rules={report.rules.filter((rule) => rule.status === tab)} lang={lang} />
        )}
      </div>
    </section>
  )
}

function FindingCard({
  number,
  entry,
  fix,
  lang,
  first,
}: {
  number: number
  entry: RuleFindings
  fix: string | null
  lang: Lang
  first: boolean
}) {
  const t = REPORT[lang]
  const { rule, findings } = entry
  const code = `F-${String(number).padStart(2, '0')}`
  return (
    <article
      aria-labelledby={`${code}-title`}
      className={`flex flex-col bg-white ${
        first ? 'border-[1.5px] border-ink shadow-key' : 'border border-rule-strong'
      }`}
    >
      <header className="flex flex-col gap-2.5 border-b border-rule-soft px-5 py-5 md:px-7">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span dir="ltr" className="font-mono text-xs text-ink-3">
            {code}
          </span>
          <SeverityPill severity={rule.severity} lang={lang} />
          <span className="text-[13px] text-ink-3">{REPORT[lang].categories[rule.category]}</span>
          <code dir="ltr" className="font-mono text-[13px] text-ink-2">
            {rule.id}
          </code>
          {rule.severity === 'info' && (
            <span className="text-xs text-ink-3">{t.findings.notDeducted}</span>
          )}
          {rule.status === 'needs-review' && (
            <span className="bg-measure-soft px-2 py-px text-xs text-measure">
              {t.findings.review}
            </span>
          )}
        </div>
        <h3 id={`${code}-title`} className="m-0 text-xl leading-snug font-semibold md:text-[23px]">
          <Bidi text={rule.title[lang]} lang={lang} />
        </h3>
      </header>
      <ul className="m-0 flex list-none flex-col p-0">
        {findings.map((finding) => (
          <li
            key={finding.fingerprint}
            className="flex flex-col gap-4 border-b border-rule-soft px-5 py-5 md:px-7"
          >
            <p className="m-0 text-base leading-[1.8] text-ink">
              <Bidi text={finding.message[lang]} lang={lang} />
            </p>
            <Evidence finding={finding} lang={lang} />
          </li>
        ))}
        {rule.findingsOmitted !== undefined && (
          <li className="px-5 py-3 text-sm text-ink-3 md:px-7">
            {t.findings.more(rule.findingsOmitted)}
          </li>
        )}
      </ul>
      {fix !== null && (
        <section className="flex flex-col gap-2.5 px-5 py-5 md:px-7">
          <h4 className="m-0 text-base font-semibold">{t.findings.fix}</h4>
          <div
            className="prose-fix text-[15px] leading-[1.8] text-ink-2"
            // Our own copy, rendered by packages/seo's strict Markdown, which escapes all text.
            dangerouslySetInnerHTML={{ __html: fix }}
          />
        </section>
      )}
    </article>
  )
}

function RuleList({ rules, lang }: { rules: readonly RuleResult[]; lang: Lang }) {
  if (rules.length === 0) {
    return <p className="m-0 px-1 py-2 text-ink-3">{REPORT[lang].noRules}</p>
  }
  return (
    <ul className="m-0 flex list-none flex-col border border-rule-strong bg-white p-0">
      {rules.map((rule) => (
        <li
          key={rule.id}
          className="flex flex-wrap items-center justify-between gap-3 border-b border-rule-soft px-5 py-3 last:border-b-0"
        >
          <span className="text-[15px]">
            <Bidi text={rule.title[lang]} lang={lang} />
          </span>
          <code dir="ltr" className="font-mono text-xs text-ink-3">
            {rule.id}
          </code>
        </li>
      ))}
    </ul>
  )
}
