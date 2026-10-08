import type { ScanSummary } from '@arablyzer/api-contract/codes'
import { REPORT } from '@arablyzer/i18n/report'
import type { Lang } from '@arablyzer/seo/site'
import { stepsOf, type Progress as ProgressState, type Step, type StepState } from '../report-model'
import { EngineChips } from './Engines'
import { Frame } from './Frame'
import { Steps } from './Steps'

/**
 * The scan while it runs (M2.6 R7): the address in its bubble and the heading over two columns.
 * The aside, first on a phone, is the scan box with the reading beam sweeping across it; the main
 * column is the steps the scan takes, the browsers rendering the page and the log of what it has
 * asked for. The box is the aside, in view from the first screen, instead of a bar stuck to the
 * foot of the page, where it covered the steps.
 */
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
  const steps = stepsOf(progress, t)
  const active = steps.find((step) => step.state === 'active')
  // In the engine's order: robots.txt before the page (M2.4 plan §2).
  const log = [
    progress.robots !== null && `GET /robots.txt  ${progress.robots.status ?? '—'}`,
    progress.page !== null && `GET ${summary.url}  ${progress.page.status ?? '—'}`,
    ...engines.map((engine) => {
      const run = progress.engines[engine]
      if (run.state === 'waiting') return false
      return `${engine} ${run.version ?? ''}  ${run.state}${
        run.requests === null ? '' : ` · ${run.requests} requests`
      }`
    }),
    progress.rules !== null && `rules  ${progress.rules}`,
  ].filter((line): line is string => typeof line === 'string')

  return (
    <Frame
      url={summary.url}
      head={
        <>
          <h1 id="progress-title" className="heading-1 m-0">
            {t.title}
          </h1>
          <p className="lead m-0">{t.engines}</p>
        </>
      }
      aside={
        <ProgressBox
          lang={lang}
          steps={steps}
          queued={progress.queued !== null && !progress.started ? t.queued(progress.queued) : ''}
        />
      }
    >
      <div className="card p-card">
        <Steps
          steps={steps}
          lang={lang}
          extra={{
            render: <EngineChips engines={engines} progress={progress.engines} lang={lang} />,
          }}
        />
      </div>
      {/* For a screen reader: the step under way, said as it changes. */}
      <p className="sr-only" role="status">
        {active?.label ?? ''}
      </p>
      {log.length > 0 && (
        <pre
          dir="ltr"
          lang="en"
          // Focusable, so a keyboard can scroll a line wider than the panel.
          tabIndex={0}
          className="panel-dark m-0 overflow-x-auto rounded-card p-card font-mono text-meta leading-[1.9] text-panel-soft"
        >
          {log.join('\n')}
        </pre>
      )}
      <p className="m-0 text-small text-ink-2">{t.note}</p>
    </Frame>
  )
}

/** A step's piece of the track: filled once done, half drawn while under way. */
const SEGMENT: Readonly<Record<StepState, string>> = {
  done: 'bg-brand forced-colors:bg-[Highlight]',
  active: 'bg-brand/45 forced-colors:bg-[Highlight] motion-safe:animate-pulse',
  waiting: 'bg-surface-2 forced-colors:bg-[GrayText]',
  failed: 'bg-serious forced-colors:bg-[Highlight]',
}

/**
 * The scan box while a scan runs: which step it is on, of how many, and the track of them, under
 * the reading beam sweeping across it from the start of the line to its end, the way the page is
 * read. A plain box (`scan-box`): the turning ring is the home page's. The beam stops under
 * reduced motion; the words, the step count and the track stay.
 */
function ProgressBox({
  lang,
  steps,
  queued,
}: {
  lang: Lang
  steps: readonly Step[]
  /** Where the scan is in the queue, said once it is queued and not yet started; else empty. */
  queued: string
}) {
  const t = REPORT[lang]
  const active = steps.findIndex((step) => step.state === 'active')
  const done = steps.filter((step) => step.state === 'done').length
  const at = active >= 0 ? active + 1 : Math.max(1, done)
  return (
    <div aria-busy="true" className="scan-box reading-beam p-card">
      <div className="relative z-[1] flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body font-semibold text-brand-ink">
            {active >= 0 ? steps[active]?.label : t.progress.waitingStart}
          </span>
          <span className="shrink-0 text-small text-ink-2 tabular-nums">
            {t.thread.stepOf(at, steps.length)}
          </span>
        </div>
        <ol aria-hidden="true" className="m-0 flex list-none gap-1.5 p-0">
          {steps.map((step) => (
            <li key={step.key} className={`h-1.5 flex-1 rounded-full ${SEGMENT[step.state]}`} />
          ))}
        </ol>
        {/* Rendered empty from the start, so a screen reader hears the queue when it is told. */}
        <p className="m-0 text-small text-ink-2 empty:hidden" role="status">
          {queued}
        </p>
      </div>
    </div>
  )
}
