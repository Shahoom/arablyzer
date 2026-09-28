import type { ScanSummary } from '@arablyzer/api-contract/codes'
import { REPORT } from '@arablyzer/i18n/report'
import type { Lang } from '@arablyzer/seo/site'
import { Check } from 'lucide-react'
import type { Progress as ProgressState } from '../report-model'
import { Crosshairs, ENGINE_LABEL } from './ui'

type StepState = 'done' | 'active' | 'waiting'

interface Step {
  readonly key: string
  readonly label: string
  readonly done: boolean
  readonly detail: string | null
  /** A technical reading, such as "200 · text/html" or "1 / 3", read left to right in Arabic too. */
  readonly ltr?: boolean
}

/** The scan while it runs (the approved Audit-Progress design): its engines, its steps, its log. */
export function Progress({
  summary,
  progress,
  lang,
}: {
  summary: ScanSummary
  progress: ProgressState
  lang: Lang
}) {
  const t = REPORT[lang].progress
  const engines = progress.planned
  const renderBegun = engines.some((engine) => progress.engines[engine].state !== 'waiting')
  // The steps in the order the engine takes them. A step this scan has no use for (no rule reads
  // robots.txt or real-user data, no browser was asked for) leaves the list once a later one began.
  const pastCrux = renderBegun || progress.rules !== null
  const pastRobots = progress.crux !== null || pastCrux
  const listed: Step[] = [
    {
      key: 'page',
      label: t.steps.page,
      done: progress.page !== null,
      detail:
        progress.page === null
          ? null
          : [progress.page.status, progress.page.contentType?.split(';')[0]]
              .filter((part) => part !== null && part !== undefined)
              .join(' · '),
      ltr: true,
    },
    ...(progress.robots === null && pastRobots
      ? []
      : [
          {
            key: 'robots',
            label: t.steps.robots,
            done: progress.robots !== null,
            detail: progress.robots === null ? null : t.robots[progress.robots.outcome],
          },
        ]),
    ...(progress.crux === null && pastCrux
      ? []
      : [
          {
            key: 'crux',
            label: t.steps.crux,
            done: progress.crux !== null,
            detail: progress.crux === null ? null : t.crux[progress.crux.outcome],
          },
        ]),
    ...(progress.started && engines.length === 0
      ? []
      : [
          {
            key: 'render',
            label: t.steps.render,
            done:
              (engines.length > 0 && progress.enginesDone === engines.length) ||
              progress.rules !== null,
            detail: `${progress.enginesDone} / ${engines.length}`,
            ltr: true,
          },
        ]),
    {
      key: 'rules',
      label: t.steps.rules,
      done: progress.rules !== null,
      detail: progress.rules === null ? null : t.rules(progress.rules),
    },
    { key: 'score', label: t.steps.score, done: progress.done !== null, detail: null },
  ]
  // One step at a time: the first that is not done, once the scan has started.
  const open = listed.findIndex((step) => !step.done)
  const steps = listed.map((step, index): Step & { state: StepState } => ({
    ...step,
    state: step.done ? 'done' : progress.started && index === open ? 'active' : 'waiting',
  }))
  const active = steps.find((step) => step.state === 'active')

  return (
    <div className="flex flex-col">
      <section className="flex flex-col gap-3 border-b border-ink bg-white px-5 pt-7 pb-6 md:px-16">
        <span className="text-sm font-semibold text-signal">{t.kicker}</span>
        <h1 className="m-0 text-3xl leading-tight font-bold md:text-[38px]">{t.title}</h1>
        <span dir="ltr" className="self-start font-mono text-base break-all text-ink-2 md:text-lg">
          {summary.url}
        </span>
        {progress.queued !== null && !progress.started && (
          <p className="m-0 text-sm text-ink-3" role="status">
            {t.queued(progress.queued)}
          </p>
        )}
      </section>
      <div className="grid gap-8 px-5 py-8 md:px-16 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <section className="relative flex flex-col bg-panel-grid text-panel-text">
            <Crosshairs />
            <div className="flex items-center justify-between border-b border-panel-line px-5 py-3 text-xs text-panel-dim">
              <span>{t.engines}</span>
              <span dir="ltr" className="font-mono tracking-[0.06em]">
                {engines.length} ENGINES
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {engines.map((engine) => {
                const run = progress.engines[engine]
                const bad = !['waiting', 'rendering', 'rendered'].includes(run.state)
                return (
                  <li
                    key={engine}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-panel-line px-5 py-4 last:border-b-0"
                  >
                    <span className="flex flex-col gap-1">
                      <span
                        dir="ltr"
                        className="self-start font-mono text-sm tracking-[0.06em] text-white"
                      >
                        {ENGINE_LABEL[engine].toUpperCase()}
                      </span>
                      {run.version !== null && (
                        <span dir="ltr" className="self-start font-mono text-xs text-panel-dim">
                          {run.version}
                        </span>
                      )}
                    </span>
                    <span
                      className={`flex items-center gap-2 text-sm ${
                        run.state === 'rendered'
                          ? 'text-panel-pass'
                          : bad
                            ? 'text-panel-signal'
                            : run.state === 'rendering'
                              ? 'text-white'
                              : 'text-panel-dim'
                      }`}
                    >
                      {run.state === 'rendering' && (
                        <span
                          aria-hidden="true"
                          className="size-2 animate-pulse bg-panel-measure"
                        />
                      )}
                      {t.engine[run.state]}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
          <ol className="m-0 flex list-none flex-col border border-rule-strong bg-white p-0">
            {steps.map((step) => (
              <li
                key={step.key}
                className="flex items-start gap-3 border-b border-rule-soft px-5 py-3.5 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className={`flex size-6 shrink-0 items-center justify-center border ${
                    step.state === 'done'
                      ? 'border-pass bg-pass-soft text-pass'
                      : step.state === 'active'
                        ? 'border-ink'
                        : 'border-rule-strong'
                  }`}
                >
                  {step.state === 'done' ? (
                    <Check size={14} strokeWidth={3} />
                  ) : step.state === 'active' ? (
                    <span className="size-2 animate-pulse bg-ink" />
                  ) : null}
                </span>
                {/* On a phone the reading goes under its step; wider, it sits at the row's end. */}
                <span className="flex min-w-0 grow flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className={step.state === 'waiting' ? 'text-ink-3' : 'font-semibold'}>
                    {step.label}
                    <span className="sr-only"> ({t.state[step.state]})</span>
                  </span>
                  {step.detail !== null && step.state !== 'waiting' && (
                    <span
                      dir={step.ltr === true ? 'ltr' : undefined}
                      className="self-start text-sm text-ink-2 sm:self-auto"
                    >
                      {step.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {/* For a screen reader: the step under way, said as it changes. */}
          <p className="sr-only" role="status">
            {active?.label ?? ''}
          </p>
        </div>
        <aside className="flex flex-col gap-4 lg:col-span-5">
          <p className="m-0 border-s-2 border-ink ps-4 text-sm leading-[1.8] text-ink-2">
            {t.note}
          </p>
          <pre
            dir="ltr"
            className="m-0 overflow-x-auto bg-panel px-5 py-4 font-mono text-xs leading-[1.9] text-panel-soft"
          >
            {[
              progress.page !== null && `GET ${summary.url}  ${progress.page.status ?? '—'}`,
              progress.robots !== null && `GET /robots.txt  ${progress.robots.status ?? '—'}`,
              ...engines.map((engine) => {
                const run = progress.engines[engine]
                if (run.state === 'waiting') return false
                return `${engine} ${run.version ?? ''}  ${run.state}${
                  run.requests === null ? '' : ` · ${run.requests} requests`
                }`
              }),
              progress.rules !== null && `rules  ${progress.rules}`,
            ]
              .filter((line): line is string => typeof line === 'string')
              .join('\n')}
          </pre>
        </aside>
      </div>
    </div>
  )
}
