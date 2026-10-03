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
    <section aria-labelledby="found-title" className="flex flex-col gap-card">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <h2 id="found-title" className="heading-2 m-0">
          {t.thread.findings.title}
        </h2>
        {severities.length > 1 && (
          // A row that scrolls sideways on a phone, if there are more severities than it holds.
          <div role="group" aria-label={t.tabs.filter} className="scroll-row md:justify-end">
            {severities.map((severity) => (
              <button
                key={severity}
                type="button"
                aria-pressed={only === severity}
                onClick={() => {
                  setOnly(only === severity ? null : severity)
                }}
                className="chip"
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
        <ul className="m-0 flex list-none flex-col gap-card p-0">
          {shown.map((entry) => (
            <li key={entry.rule.id} className="card overflow-hidden">
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
      <p className="m-0 flex items-center gap-3 rounded-card bg-pass-soft p-card text-body text-pass forced-colors:border">
        <CircleCheck aria-hidden="true" size={20} className="shrink-0" />
        {t.none}
      </p>
    )
  }
  return (
    <p className="m-0 flex items-start gap-3 rounded-card bg-surface-2 p-card text-body text-ink-2 forced-colors:border">
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
      buttonClass="p-card hover:bg-surface-2/60"
      head={
        <>
          <SeverityPill severity={rule.severity} lang={lang} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="heading-3 text-ink">
              <Bidi text={rule.title[lang]} lang={lang} />
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-2">
              <span>{t.categories[rule.category]}</span>
              {alone !== null && (
                <span className="text-serious">
                  <Bidi text={t.thread.findings.only(ENGINE_LABEL[alone])} lang={lang} />
                </span>
              )}
              {rule.severity === 'info' && <span>{t.findings.notDeducted}</span>}
              {rule.status === 'needs-review' && (
                <span className="rounded-full bg-indigo-soft px-2 text-meta text-indigo-ink">
                  {t.findings.review}
                </span>
              )}
            </span>
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-5 border-t border-line p-card">
        {findings.map((finding) => (
          <div
            key={finding.fingerprint}
            className="flex flex-col gap-4 border-b border-line pb-5 last:border-b-0 last:pb-0"
          >
            <p className="m-0 max-w-[68ch] text-body text-ink">
              <Bidi text={finding.message[lang]} lang={lang} />
            </p>
            <Evidence finding={finding} lang={lang} />
          </div>
        ))}
        {rule.findingsOmitted !== undefined && (
          <p className="m-0 text-small text-ink-2">{t.findings.more(rule.findingsOmitted)}</p>
        )}
        {fix !== null && (
          <section className="flex flex-col gap-3 rounded-xl bg-brand-soft/60 p-4 forced-colors:border">
            <h4 className="heading-3 m-0 flex items-center gap-2">
              <Wrench aria-hidden="true" size={18} className="shrink-0 text-brand-ink" />
              {t.findings.fix}
            </h4>
            <div
              className="prose-fix max-w-[76ch] text-small text-ink-2"
              // Our own copy, rendered by packages/seo's strict Markdown, which escapes all text.
              dangerouslySetInnerHTML={{ __html: fix }}
            />
          </section>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-small">
          <a
            href={localePath(lang, PATHS.rule(rule.id))}
            className="font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
          >
            {t.thread.findings.about}
          </a>
          <span dir="ltr" className="font-mono text-meta text-ink-2">
            {rule.id}
          </span>
        </div>
      </div>
    </Disclosure>
  )
}

type Fold = 'passed' | 'not-applicable' | 'error'

/**
 * The rules that did not fail, folded away: those that passed, those that did not apply to the
 * page, and, when the scan has any, those that could not run. One card, a row for each.
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
    <div className="card overflow-hidden [&>div+div]:border-t [&>div+div]:border-line">
      {listed.map(({ key, title, tone, rules }) => (
        <div key={key}>
          <Disclosure
            id={`fold-${key}`}
            level={2}
            open={open.has(key)}
            onToggle={() => {
              setOpen((current) => toggled(current, key))
            }}
            buttonClass="min-h-14 items-center p-card hover:bg-surface-2/60"
            head={
              <>
                <span className="flex-1 text-body font-semibold">{title}</span>
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
  const tone = fold === 'passed' ? 'text-pass' : fold === 'error' ? 'text-moderate' : 'text-ink-2'
  return (
    <ul className="m-0 grid list-none gap-x-6 gap-y-3 border-t border-line p-card text-small sm:grid-cols-2">
      {rules.map((rule) => (
        <li key={rule.id} className="flex min-w-0 items-start gap-2.5">
          <Icon
            aria-hidden="true"
            size={16}
            strokeWidth={2.4}
            className={`mt-1 shrink-0 ${tone}`}
          />
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
            <a
              href={localePath(lang, PATHS.rule(rule.id))}
              className="text-ink-2 underline decoration-field underline-offset-4 hover:text-brand-ink"
            >
              <Bidi text={rule.title[lang]} lang={lang} />
            </a>
            <code dir="ltr" className="font-mono text-meta break-all text-ink-2">
              {fold === 'error' && rule.error !== undefined ? rule.error : rule.id}
            </code>
          </span>
        </li>
      ))}
    </ul>
  )
}
