import { REPORT } from '@arablyzer/i18n/report'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { ChevronDown, CircleCheck } from 'lucide-preact'
import { useState } from 'preact/hooks'
import { checklistOf, listOf, renderedEngines } from '../report-model'
import { Bidi } from './Bidi'
import { EngineCards } from './Engines'
import { Steps } from './Steps'
import { ENGINE_LABEL } from './ui'

/**
 * The line that opens the answer: what the scan read, and how many rules ran on it. It opens on
 * the steps the scan took, and, under the one that rendered, the browsers, with their versions,
 * and the one that shows a problem the others do not. A quiet line, with no box of its own.
 */
export function ReadLine({ report, lang }: { report: Report; lang: Lang }) {
  const t = REPORT[lang]
  const [open, setOpen] = useState(false)
  const engines = renderedEngines(report)
  const rules = report.score.rules.ran
  const line =
    engines.length === 0
      ? t.thread.read.html(rules)
      : t.thread.read.rendered(
          listOf(
            engines.map((engine) => ENGINE_LABEL[engine]),
            lang,
          ),
          rules,
        )
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="read-steps"
        onClick={() => {
          setOpen(!open)
        }}
        className="-ms-2 flex min-h-11 max-w-full cursor-pointer items-center gap-3 self-start rounded-lg px-2 py-1 text-start text-small text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <CircleCheck aria-hidden="true" size={18} className="shrink-0 text-brand" />
        <span className="min-w-0">
          <Bidi text={line} lang={lang} />
        </span>
        <ChevronDown
          aria-hidden="true"
          size={18}
          className={`shrink-0 text-ink-3 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div id="read-steps" hidden={!open}>
        <div className="card p-card">
          <Steps
            steps={checklistOf(report, t.progress)}
            lang={lang}
            extra={{ render: <EngineCards report={report} lang={lang} /> }}
          />
        </div>
      </div>
    </div>
  )
}
