import type { ScanSummary } from '@arablyzer/api-contract/codes'
import { REPORT } from '@arablyzer/i18n/report'
import type { Lang } from '@arablyzer/seo/site'
import { stepsOf, type Progress as ProgressState } from '../report-model'
import { ProgressDock } from './Dock'
import { EngineChips } from './Engines'
import { Steps } from './Steps'
import { Thread } from './Thread'

/**
 * The scan while it runs (the approved Scan design, in the v2 look): the address in its bubble,
 * Arablyzer's answer under it with the steps it takes, the browsers rendering the page and, at the
 * end of the line, the scan box with the reading beam. Under the steps, the log of what it has
 * asked for, and the shape of the report that comes.
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
    <div className="flex flex-1 flex-col">
      <Thread lang={lang} url={summary.url}>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[22px] leading-[1.5] font-semibold md:text-[26px]">{t.title}</h1>
          <p className="m-0 text-ink-2">{t.engines}</p>
          {/* Rendered empty from the start, so a screen reader hears the queue when it is told. */}
          <p className="m-0 text-sm text-ink-3 empty:hidden" role="status">
            {progress.queued !== null && !progress.started ? t.queued(progress.queued) : ''}
          </p>
          {!progress.started && progress.queued === null && (
            <p className="m-0 text-sm text-ink-3">{t.waitingStart}</p>
          )}
        </div>
        <Steps
          steps={steps}
          lang={lang}
          extra={{
            render: <EngineChips engines={engines} progress={progress.engines} lang={lang} />,
          }}
        />
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
            className="panel-dark m-0 overflow-x-auto rounded-lg px-5 py-4 font-mono text-xs leading-[1.9] text-panel-soft"
          >
            {log.join('\n')}
          </pre>
        )}
        <ReportSkeleton />
        <p className="m-0 text-sm leading-[1.8] text-ink-3">{t.note}</p>
      </Thread>
      <ProgressDock lang={lang} url={summary.url} steps={steps} />
    </div>
  )
}

/** The shape of the report to come, in quiet blocks: the score's ring, its headline, two findings. */
function ReportSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
      <div className="card flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:gap-8">
        <span className="size-[120px] shrink-0 rounded-full border-[10px] border-surface-2" />
        <span className="flex w-full flex-col gap-3.5">
          <span className="h-3 w-3/5 rounded-full bg-surface-2" />
          <span className="h-3 w-5/6 rounded-full bg-surface-2" />
          <span className="h-3 w-2/5 rounded-full bg-surface-2" />
        </span>
      </div>
      <span className="card block h-14" />
      <span className="card block h-14" />
    </div>
  )
}
