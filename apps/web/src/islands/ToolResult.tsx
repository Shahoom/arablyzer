import { REPORT } from '@arablyzer/i18n/report'
import { TOOL_APP } from '@arablyzer/i18n/tool-app'
import type { RuleResult } from '@arablyzer/report-schema'
import { localePath, PATHS, type Lang } from '@arablyzer/seo/site'
import { Check, Info, Minus, TriangleAlert, X } from 'lucide-preact'
import type { ComponentChildren } from 'preact'
import { Bidi } from './report/Bidi'
import { CountryFit } from './report/CountryFit'
import { Evidence } from './report/Evidence'
import { FontSlimmer } from './report/FontSlimmer'
import { SearchTest } from './report/SearchTest'
import { Notices } from './report/Notices'
import { SeverityPill } from './report/ui'
import {
  isNote,
  problemsOf,
  stepsOf,
  toolHeadline,
  toolVerdict,
  worstProblem,
  type ToolVerdict,
} from './report-model'
import { useRun, type Run } from './tool-run'

interface Props {
  lang: Lang
  /** As ToolApp has it: whether every rule of the tool only lists what it finds. */
  reportsOnly: boolean
}

/**
 * A tool's check as it goes and what it found, at the head of the main column of its page (M2.6
 * R7). The box that starts the check is ToolApp's, in the aside; the two share the run
 * (tool-run.ts). Before a check it draws nothing, so the text it stands over starts at the top;
 * during it, the steps; after it, each problem with its evidence, or the page passing.
 */
export default function ToolResult({ lang, reportsOnly }: Props) {
  const run = useRun()
  if (run === null) return null
  return <Result run={run} lang={lang} reportsOnly={reportsOnly} />
}

/** A round tile for a small icon: its tint and the icon's colour, a mark that says a state. */
function Mark({ tone, children }: { tone: string; children: ComponentChildren }) {
  return (
    <span className={`grid size-6 shrink-0 place-items-center rounded-full ${tone}`}>
      {children}
    </span>
  )
}

/** The mark before a result's headline: what the result is, where no severity says it. */
function VerdictMark({ verdict }: { verdict: ToolVerdict }) {
  switch (verdict) {
    case 'passed':
      return (
        <Mark tone="bg-pass-soft">
          <Check size={14} strokeWidth={2.6} aria-hidden="true" className="text-pass" />
        </Mark>
      )
    case 'none-found':
    case 'noted':
      return (
        <Mark tone="bg-surface-2">
          <Info size={14} strokeWidth={2.4} aria-hidden="true" className="text-ink-2" />
        </Mark>
      )
    case 'review':
    case 'incomplete':
    case 'blocked':
    case 'opted-out':
      return (
        <Mark tone="bg-moderate-soft">
          <TriangleAlert size={14} strokeWidth={2.4} aria-hidden="true" className="text-moderate" />
        </Mark>
      )
    case 'not-applicable':
      return (
        <Mark tone="bg-surface-2">
          <Minus size={14} strokeWidth={2.4} aria-hidden="true" className="text-ink-2" />
        </Mark>
      )
    case 'problems':
      return null
  }
}

function Result({ run, lang, reportsOnly }: { run: Run; lang: Lang; reportsOnly: boolean }) {
  const t = TOOL_APP[lang].result
  const r = REPORT[lang]
  // On a phone the result is the box's, and sits closer to it than a section does.
  const frame = 'card overflow-hidden max-lg:-mt-3'
  const head =
    'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-card py-3'

  if (run.phase === 'running') {
    const steps = stepsOf(run.progress, r.progress).filter((step) => step.key !== 'score')
    return (
      <section aria-labelledby="result-title" className={frame}>
        <div className={head}>
          <h2 id="result-title" className="heading-3 m-0">
            {t.running}
          </h2>
        </div>
        <ol className="m-0 flex list-none flex-col p-0">
          {steps.map((step) => (
            <li
              key={step.key}
              className="flex items-center gap-3 border-b border-line px-card py-2.5 text-small last:border-b-0"
            >
              <Mark
                tone={
                  step.state === 'done'
                    ? 'bg-pass-soft'
                    : step.state === 'failed'
                      ? 'bg-serious-soft'
                      : 'bg-surface-2'
                }
              >
                {step.state === 'done' && (
                  <Check size={14} strokeWidth={2.6} aria-hidden="true" className="text-pass" />
                )}
                {step.state === 'failed' && (
                  <X size={14} strokeWidth={2.6} aria-hidden="true" className="text-serious" />
                )}
                {step.state === 'active' && (
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full bg-indigo motion-safe:animate-pulse"
                  />
                )}
                {step.state === 'waiting' && (
                  <span aria-hidden="true" className="size-2 rounded-full bg-line-2" />
                )}
              </Mark>
              <span className={step.state === 'waiting' ? 'text-ink-3' : 'font-semibold'}>
                {step.label}
                <span className="sr-only"> ({r.progress.state[step.state]})</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    )
  }
  if (run.phase !== 'done') {
    return (
      <section aria-labelledby="result-title" className={frame}>
        <div className="flex items-center gap-3 p-card">
          <Mark tone="bg-serious-soft">
            <TriangleAlert
              size={14}
              strokeWidth={2.4}
              aria-hidden="true"
              className="text-serious"
            />
          </Mark>
          <h2 id="result-title" className="heading-3 m-0 text-serious">
            {run.phase === 'offline' ? t.offline : t.failed}
          </h2>
        </div>
      </section>
    )
  }

  const { report, id } = run
  const verdict = toolVerdict(report, reportsOnly)
  // What is listed: the failed rules and those that need a review. A rule that only lists what it
  // finds is listed too, with a label that says it is a note; it is no problem, so it is neither
  // the worst severity nor a reason to point to the fixes.
  const listed = problemsOf(report)
  const worst = worstProblem(report)
  const shareHref = localePath(lang, `/r/${id}`)

  return (
    <section aria-labelledby="result-title" className={frame}>
      <div className={head}>
        <div className="flex flex-wrap items-center gap-3">
          <VerdictMark verdict={verdict} />
          {worst !== undefined && <SeverityPill severity={worst} lang={lang} />}
          <h2 id="result-title" className="heading-3 m-0">
            {toolHeadline(report, t, reportsOnly)}
          </h2>
        </div>
        <span dir="ltr" className="font-mono text-meta break-all text-ink-3">
          {report.target.url}
        </span>
      </div>
      {report.scan.notices.length > 0 && (
        <div className="border-b border-line px-card py-3">
          <Notices notices={report.scan.notices} lang={lang} id="result-notices" level={3} />
        </div>
      )}
      {listed.map((entry) => (
        <article
          key={entry.rule.id}
          aria-labelledby={`result-${entry.rule.id}`}
          className="flex flex-col border-b border-line"
        >
          <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-card pt-4">
            <h3 id={`result-${entry.rule.id}`} className="heading-3 m-0">
              <Bidi text={entry.rule.title[lang]} lang={lang} />
            </h3>
            {isNote(entry.rule) && (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-meta text-ink-2">
                {r.findings.notDeducted}
              </span>
            )}
            {entry.rule.status === 'needs-review' && (
              <span className="rounded-full bg-blue-soft px-2.5 py-0.5 text-meta text-blue">
                {r.findings.review}
              </span>
            )}
          </header>
          <ul className="m-0 flex list-none flex-col p-0">
            {entry.findings.map((finding) => (
              <li
                key={finding.fingerprint}
                className="flex flex-col gap-3 border-b border-line px-card py-4 last:border-b-0"
              >
                <p className="m-0 text-body">
                  <Bidi text={finding.message[lang]} lang={lang} />
                </p>
                <Evidence finding={finding} lang={lang} />
              </li>
            ))}
            {entry.rule.findingsOmitted !== undefined && (
              <li className="px-card py-3 text-small text-ink-2">
                {r.findings.more(entry.rule.findingsOmitted)}
              </li>
            )}
          </ul>
        </article>
      ))}
      {verdict !== 'blocked' && verdict !== 'opted-out' && (
        <FontSlimmer report={report} id={id} lang={lang} />
      )}
      <SearchTest report={report} lang={lang} />
      <CountryFit report={report} lang={lang} />
      {/* Nothing was checked on a page the site refused to send, or asked us not to check. */}
      {verdict !== 'blocked' && verdict !== 'opted-out' && (
        <Checked rules={report.rules} lang={lang} reportsOnly={reportsOnly} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-surface-2 px-card py-3 text-small text-ink-2">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0">
          {t.rules(report.rules.length)}
          {report.rules.map((rule) => (
            <a
              key={rule.id}
              href={localePath(lang, PATHS.rule(rule.id))}
              dir="ltr"
              className="inline-flex min-h-7 items-center font-mono text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-brand-ink"
            >
              {rule.id}
            </a>
          ))}
        </span>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {worst !== undefined && (
            <a
              href="#fix"
              className="inline-flex min-h-11 items-center font-semibold text-indigo-ink underline underline-offset-4 hover:text-ink"
            >
              {t.howToFix}
            </a>
          )}
          <a
            href={shareHref}
            className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-brand-ink"
          >
            {t.share}
          </a>
        </span>
      </div>
    </section>
  )
}

const STATUS_STYLE: Readonly<Record<RuleResult['status'], string>> = {
  pass: 'bg-pass-soft text-pass',
  fail: 'bg-serious-soft text-serious',
  'needs-review': 'bg-blue-soft text-blue',
  error: 'bg-moderate-soft text-moderate',
  'not-applicable': 'bg-surface-2 text-ink-3',
}

/**
 * Each rule the tool ran, with what became of it: a green check for a rule that passed alone. A
 * rule that only lists what it finds is not passed or failed: it noted something, or, in a tool
 * whose rules all only list, found nothing (M2.3c review).
 */
function Checked({
  rules,
  lang,
  reportsOnly,
}: {
  rules: readonly RuleResult[]
  lang: Lang
  reportsOnly: boolean
}) {
  const t = TOOL_APP[lang].result
  return (
    <section aria-labelledby="result-checked" className="flex flex-col border-b border-line">
      <h3 id="result-checked" className="m-0 px-card pt-3 pb-1 text-small font-semibold text-ink-2">
        {t.checked}
      </h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {rules.map((rule) => {
          const noted = isNote(rule) && rule.status === 'fail'
          const none = isNote(rule) && rule.status === 'pass' && reportsOnly
          return (
            <li
              key={rule.id}
              className="flex items-start gap-3 border-t border-line px-card py-2.5 text-small"
            >
              {noted ? (
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-2">
                  <Info size={14} strokeWidth={2.4} aria-hidden="true" className="text-ink-2" />
                </span>
              ) : rule.status === 'pass' && !none ? (
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-pass-soft">
                  <Check size={14} strokeWidth={2.6} aria-hidden="true" className="text-pass" />
                </span>
              ) : rule.status === 'fail' ? (
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-serious-soft">
                  <X size={14} strokeWidth={2.6} aria-hidden="true" className="text-serious" />
                </span>
              ) : (
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-2">
                  <Minus size={14} strokeWidth={2.4} aria-hidden="true" className="text-ink-2" />
                </span>
              )}
              <span className="grow pt-0.5">
                <Bidi text={rule.title[lang]} lang={lang} />
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-meta ${
                  noted || none ? 'bg-surface-2 text-ink-2' : STATUS_STYLE[rule.status]
                }`}
              >
                {noted ? t.information.found : none ? t.information.none : t.status[rule.status]}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
