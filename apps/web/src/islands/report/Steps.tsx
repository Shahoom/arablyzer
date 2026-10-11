import { REPORT } from '@arablyzer/i18n/report'
import type { Lang } from '@arablyzer/seo/site'
import { Check, X } from 'lucide-preact'
import type { ComponentChildren } from 'preact'
import type { Step, StepState } from '../report-model'

/** A step's mark: a teal disc with a check once done, a ring that turns while it is under way. */
function Dot({ state }: { state: StepState }) {
  const base = 'relative z-[1] grid size-6 shrink-0 place-items-center rounded-full border-2'
  switch (state) {
    case 'done':
      return (
        <span aria-hidden="true" className={`${base} border-transparent bg-brand text-white`}>
          <Check size={12} strokeWidth={3} />
        </span>
      )
    case 'failed':
      return (
        <span
          aria-hidden="true"
          className={`${base} border-transparent bg-serious-soft text-serious`}
        >
          <X size={12} strokeWidth={3} />
        </span>
      )
    case 'active':
      // The ring is drawn whole, in the brand's colour, when motion is off: still "under way".
      return (
        <span
          aria-hidden="true"
          className={`${base} border-line border-t-brand bg-surface motion-safe:animate-spin motion-reduce:border-brand`}
        />
      )
    case 'waiting':
      return <span aria-hidden="true" className={`${base} border-line bg-surface`} />
  }
}

/** A step's label: the one under way is the one in ink; those done are quieter, those to come dim. */
const LABEL: Readonly<Record<StepState, string>> = {
  done: 'text-ink-2',
  active: 'font-semibold text-ink',
  waiting: 'text-ink-3',
  failed: 'font-semibold text-serious',
}

/**
 * The steps of a scan, one under the other, each joined to the next by a line: the same list for a
 * scan under way and for a finished scan's report. What each read is said beside its name, in
 * plain text. `extra` holds what a step shows under its label, such as the engines under the one
 * that renders.
 */
export function Steps({
  steps,
  lang,
  extra = {},
}: {
  steps: readonly Step[]
  lang: Lang
  extra?: Partial<Record<Step['key'], ComponentChildren>>
}) {
  const t = REPORT[lang].progress
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {steps.map((step, index) => (
        <li key={step.key} className="relative flex items-start gap-3 pb-4 last:pb-0">
          {index < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={`absolute start-[11px] top-7 -bottom-0.5 w-0.5 rounded-full ${
                step.state === 'done' ? 'bg-brand/35' : 'bg-line'
              }`}
            />
          )}
          <Dot state={step.state} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={`text-body ${LABEL[step.state]}`}>
                {step.label}
                <span className="sr-only"> ({t.state[step.state]})</span>
              </span>
              {step.detail !== null && step.state !== 'waiting' && (
                <span dir={step.ltr ? 'ltr' : undefined} className="text-small text-ink-2">
                  {step.detail}
                </span>
              )}
            </div>
            {extra[step.key]}
          </div>
        </li>
      ))}
    </ol>
  )
}
