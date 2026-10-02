import { REPORT } from '@arablyzer/i18n/report'
import type { Report, RuleResult, Severity } from '@arablyzer/report-schema'
import { STRINGS } from '@arablyzer/seo/strings'
import { localePath, PATHS, type Lang } from '@arablyzer/seo/site'
import { Check, CircleCheck, Info, Minus, TriangleAlert, Wrench } from 'lucide-preact'
import { useState } from 'preact/hooks'
import {
  noProblemsNote,
  onlyEngine,
  problemsOf,
  renderedEngines,
  type RuleFindings,
} from '../report-model'
import { Bidi } from './Bidi'
import { Disclosure } from './Disclosure'
import { Evidence } from './Evidence'
import { ENGINE_LABEL, SeverityPill } from './ui'

/** The rules' "how to fix" sections, by rule, in the page's language. */
export type Fixes = Readonly<Record<string, { readonly fix: string }>>

/** A set of ids, as the open items of an accordion; toggling one gives a new set. */
function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set)
  if (!next.delete(id)) next.add(id)
  return next
}

/**
 * What the scan found (the approved Report design): each failed rule, and each that needs a
 * review, as an accordion, the most severe first. Its head says how severe, what it is and which
 * category it belongs to; opened, it shows what was seen, where, and how to fix it. The most
 * severe opens first, so a report starts with its worst problem in view.
 */
export function Findings({
  report,
  fixes,
  lang,
}: {
  report: Report
  fixes: Fixes | null
  lang: Lang
}) {
  const t = REPORT[lang]
  const problems = problemsOf(report)
  const rendered = renderedEngines(report).length
  const [only, setOnly] = useState<Severity | null>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(problems[0] === undefined ? [] : [problems[0].rule.id]),
  )
  const severities = [...new Set(problems.map(({ rule }) => rule.severity))]
  const shown = only === null ? problems : problems.filter(({ rule }) => rule.severity === only)
  return (
    <section aria-labelledby="found-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 id="found-title" className="m-0 text-xl font-semibold">
          {t.thread.findings.title}
        </h2>
        {severities.length > 1 && (
          <div role="group" aria-label={t.tabs.filter} className="flex flex-wrap gap-1.5">
            {severities.map((severity) => (
              <button
                key={severity}
                type="button"
                aria-pressed={only === severity}
                onClick={() => {
                  setOnly(only === severity ? null : severity)
                }}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line-2 bg-surface px-3.5 text-[13px] font-semibold text-ink-2 hover:border-ink-3 aria-pressed:border-aurora-indigo aria-pressed:bg-indigo-soft aria-pressed:text-indigo-ink forced-colors:aria-pressed:border-2"
              >
                {STRINGS[lang].report.severity[severity]}
                <span dir="ltr" className="tabular-nums">
                  {problems.filter(({ rule }) => rule.severity === severity).length}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {problems.length === 0 ? (
        <NoProblems report={report} lang={lang} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {shown.map((entry) => (
            <li
              key={entry.rule.id}
              className={`card transition-shadow duration-200 ${
                open.has(entry.rule.id) ? 'shadow-lg' : ''
              }`}
            >
              <Finding
                entry={entry}
                fix={fixes?.[entry.rule.id]?.fix ?? null}
                lang={lang}
                rendered={rendered}
                open={open.has(entry.rule.id)}
                onToggle={() => {
                  setOpen((current) => toggled(current, entry.rule.id))
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** No problem listed: a clean page only when every rule finished (noProblemsNote). */
function NoProblems({ report, lang }: { report: Report; lang: Lang }) {
  const t = REPORT[lang].findings
  const note = noProblemsNote(report)
  if (note === 'none') {
    return (
      <p className="m-0 flex items-center gap-3 rounded-xl bg-pass-soft px-5 py-4 text-pass forced-colors:border">
        <CircleCheck aria-hidden="true" size={20} className="shrink-0" />
        {t.none}
      </p>
    )
  }
  return (
    <p className="m-0 flex items-start gap-3 rounded-xl bg-surface-2 px-5 py-4 text-ink-2 forced-colors:border">
      <Info aria-hidden="true" size={20} className="mt-1 shrink-0" />
      {note === 'incomplete' ? t.noneIncomplete : t.noneUnknown}
    </p>
  )
}

function Finding({
  entry,
  fix,
  lang,
  rendered,
  open,
  onToggle,
}: {
  entry: RuleFindings
  fix: string | null
  lang: Lang
  /** How many engines rendered the page. */
  rendered: number
  open: boolean
  onToggle: () => void
}) {
  const t = REPORT[lang]
  const { rule, findings } = entry
  const alone = onlyEngine(findings, rendered)
  return (
    <Disclosure
      id={`finding-${rule.id}`}
      open={open}
      onToggle={onToggle}
      buttonClass="rounded-xl px-4 py-4 hover:bg-surface-2/60 sm:px-5"
      head={
        <>
          <SeverityPill severity={rule.severity} lang={lang} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-base leading-[1.6] font-semibold text-ink md:text-[17px]">
              <Bidi text={rule.title[lang]} lang={lang} />
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
              <span>{t.categories[rule.category]}</span>
              {alone !== null && (
                <span className="text-serious">
                  <Bidi text={t.thread.findings.only(ENGINE_LABEL[alone])} lang={lang} />
                </span>
              )}
              {rule.severity === 'info' && <span>{t.findings.notDeducted}</span>}
              {rule.status === 'needs-review' && (
                <span className="rounded-full bg-indigo-soft px-2 py-px text-xs text-indigo-ink">
                  {t.findings.review}
                </span>
              )}
            </span>
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-5 border-t border-line px-4 pt-5 pb-5 sm:px-5">
        {findings.map((finding) => (
          <div
            key={finding.fingerprint}
            className="flex flex-col gap-4 border-b border-line pb-5 last:border-b-0 last:pb-0"
          >
            <p className="m-0 text-base leading-[1.9] text-ink">
              <Bidi text={finding.message[lang]} lang={lang} />
            </p>
            <Evidence finding={finding} lang={lang} />
          </div>
        ))}
        {rule.findingsOmitted !== undefined && (
          <p className="m-0 text-sm text-ink-3">{t.findings.more(rule.findingsOmitted)}</p>
        )}
        {fix !== null && (
          <section className="flex flex-col gap-3 rounded-xl bg-brand-soft/60 p-4 forced-colors:border sm:p-5">
            <h4 className="m-0 flex items-center gap-2 text-base font-semibold">
              <Wrench aria-hidden="true" size={18} className="text-brand-ink" />
              {t.findings.fix}
            </h4>
            <div
              className="prose-fix text-[15px] leading-[1.8] text-ink-2"
              // Our own copy, rendered by packages/seo's strict Markdown, which escapes all text.
              dangerouslySetInnerHTML={{ __html: fix }}
            />
          </section>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <a
            href={localePath(lang, PATHS.rule(rule.id))}
            className="font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
          >
            {t.thread.findings.about}
          </a>
          <span dir="ltr" className="font-mono text-[13px] text-ink-3">
            {rule.id}
          </span>
        </div>
      </div>
    </Disclosure>
  )
}

type Fold = 'passed' | 'not-applicable' | 'error'

/**
 * The rules that did not fail, folded away (the approved Report design): those that passed, those
 * that did not apply to the page, and, when the scan has any, those that could not run.
 */
export function Checks({ report, lang }: { report: Report; lang: Lang }) {
  const t = REPORT[lang]
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const folds: readonly {
    readonly key: Fold
    readonly title: string
    readonly tone: string
    readonly rules: readonly RuleResult[]
  }[] = [
    {
      key: 'passed',
      title: t.passed.title,
      tone: 'sev-pass',
      rules: report.rules.filter((rule) => rule.status === 'pass'),
    },
    {
      key: 'not-applicable',
      title: t.passed.notApplicable,
      tone: 'sev-info',
      rules: report.rules.filter((rule) => rule.status === 'not-applicable'),
    },
    {
      key: 'error',
      title: STRINGS[lang].report.ruleErrors,
      tone: 'sev-moderate',
      rules: report.rules.filter((rule) => rule.status === 'error'),
    },
  ]
  const listed = folds.filter((fold) => fold.rules.length > 0)
  if (listed.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      {listed.map(({ key, title, tone, rules }) => (
        <div key={key} className="card">
          <Disclosure
            id={`fold-${key}`}
            level={2}
            open={open.has(key)}
            onToggle={() => {
              setOpen((current) => toggled(current, key))
            }}
            buttonClass="min-h-14 items-center rounded-xl px-4 py-3 hover:bg-surface-2/60 sm:px-5"
            head={
              <>
                <span className="flex-1 text-base font-semibold">{title}</span>
                <span className={`sev ${tone}`}>
                  <span dir="ltr" className="tabular-nums">
                    {rules.length}
                  </span>
                </span>
              </>
            }
          >
            <RuleList rules={rules} lang={lang} fold={key} />
          </Disclosure>
        </div>
      ))}
    </div>
  )
}

function RuleList({ rules, lang, fold }: { rules: readonly RuleResult[]; lang: Lang; fold: Fold }) {
  const Icon = fold === 'passed' ? Check : fold === 'error' ? TriangleAlert : Minus
  const tone = fold === 'passed' ? 'text-pass' : fold === 'error' ? 'text-moderate' : 'text-ink-3'
  return (
    <ul className="m-0 grid list-none gap-x-6 gap-y-3 border-t border-line p-4 text-[15px] sm:grid-cols-2 sm:p-5">
      {rules.map((rule) => (
        <li key={rule.id} className="flex min-w-0 items-start gap-2.5">
          <Icon
            aria-hidden="true"
            size={16}
            strokeWidth={2.4}
            className={`mt-1.5 shrink-0 ${tone}`}
          />
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
            <a
              href={localePath(lang, PATHS.rule(rule.id))}
              className="text-ink-2 underline decoration-field underline-offset-4 hover:text-brand-ink"
            >
              <Bidi text={rule.title[lang]} lang={lang} />
            </a>
            <code dir="ltr" className="font-mono text-xs break-all text-ink-3">
              {fold === 'error' && rule.error !== undefined ? rule.error : rule.id}
            </code>
          </span>
        </li>
      ))}
    </ul>
  )
}
