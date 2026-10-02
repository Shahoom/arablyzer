import type { EngineName } from '@arablyzer/api-contract/codes'
import { REPORT, type EngineState } from '@arablyzer/i18n/report'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { Check, X } from 'lucide-preact'
import { aloneEngines, ENGINES, renderedEngines, type EngineProgress } from '../report-model'
import { ENGINE_LABEL, EngineDot } from './ui'

/**
 * The engines of a scan under way, as chips (the approved Scan design): each with its colour and
 * name, and what it is doing: waiting, rendering with a dot that pulses, rendered with a check, or
 * why it did not.
 */
export function EngineChips({
  engines,
  progress,
  lang,
}: {
  engines: readonly EngineName[]
  progress: Readonly<Record<EngineName, EngineProgress>>
  lang: Lang
}) {
  const t = REPORT[lang].progress
  if (engines.length === 0) return null
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {engines.map((engine) => {
        const run = progress[engine]
        const bad = !['waiting', 'rendering', 'rendered'].includes(run.state)
        return (
          <li
            key={engine}
            className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 text-[13px] ${
              run.state === 'rendered'
                ? 'border-pass/30 bg-pass-soft text-pass'
                : bad
                  ? 'border-serious/30 bg-serious-soft text-serious'
                  : run.state === 'rendering'
                    ? 'border-indigo/30 bg-indigo-soft text-indigo-ink'
                    : 'border-line bg-surface text-ink-3'
            }`}
          >
            {run.state === 'rendered' ? (
              <Check aria-hidden="true" size={14} strokeWidth={3} />
            ) : bad ? (
              <X aria-hidden="true" size={14} strokeWidth={3} />
            ) : (
              <EngineDot engine={engine} />
            )}
            <span dir="ltr" lang="en" className="font-semibold">
              {ENGINE_LABEL[engine]}
            </span>
            {run.state === 'rendering' && (
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-indigo motion-safe:animate-pulse"
              />
            )}
            {/* The state is said in words, whatever the colour: a rendered engine says so too. */}
            <span className={run.state === 'rendered' ? 'sr-only' : ''}>{t.engine[run.state]}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The engines of a finished scan, as cards: the version, how it went and how many requests the
 * page made, and, on one that shows a problem none of the others does, that it does: the card
 * of the browser worth a second look takes the serious colour.
 */
export function EngineCards({ report, lang }: { report: Report; lang: Lang }) {
  const t = REPORT[lang]
  const runs = report.scan.render ?? []
  if (runs.length === 0) return null
  const rendered = renderedEngines(report).length
  const alone = aloneEngines(report)
  return (
    <ul
      aria-label={rendered === 0 ? t.contents.engines : t.engines.title(rendered)}
      className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3"
    >
      {ENGINES.map((engine) => {
        const run = runs.find((candidate) => candidate.engine === engine)
        if (run === undefined) return null
        const flagged = alone.has(engine)
        const state: EngineState = run.status
        return (
          <li
            key={engine}
            className={`flex min-w-0 flex-col gap-1.5 rounded-lg border px-4 py-3 ${
              flagged ? 'border-serious/40 bg-serious-soft/50' : 'border-line bg-surface'
            }`}
          >
            <span dir="ltr" lang="en" className="flex items-center gap-2 text-[13px] font-semibold">
              <EngineDot engine={engine} />
              <span className="min-w-0 break-all">
                {ENGINE_LABEL[engine]} {run.version ?? ''}
              </span>
            </span>
            <span
              className={`text-[13px] ${state === 'rendered' && !flagged ? 'text-pass' : 'text-serious'}`}
            >
              {flagged
                ? t.engines.alone
                : state === 'rendered'
                  ? `${t.progress.engine.rendered} · ${t.engines.requests(run.requests.total)}`
                  : t.progress.engine[state]}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
