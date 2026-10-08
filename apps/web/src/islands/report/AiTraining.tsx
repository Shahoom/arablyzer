import { NATIVE2 } from '@arablyzer/i18n/native2'
import type { AiTrainingFact, Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { Check, TriangleAlert } from 'lucide-preact'

type Check = AiTrainingFact['checks'][number]
const GROUPS = ['language', 'gopher-repetition', 'fineweb-quality', 'gopher-quality', 'c4'] as const

/**
 * The AI-training filter test (rule ai-training-filters): each check of the FineWeb-2 pipeline for
 * Arabic with the value measured and the threshold. Draws nothing when the rule did not run.
 */
export function AiTraining({ report, lang }: { report: Report; lang: Lang }) {
  const fact = report.facts.aiTraining
  if (fact === undefined) return null
  const t = NATIVE2[lang].training
  const applied = fact.checks.filter((item) => item.applied)
  const failed = applied.filter((item) => !item.pass).length
  const label = (item: Check) => {
    const gram = /^(top|duplicated)_(\d+)_/.exec(item.id)
    if (gram !== null) return t.gram(gram[1] === 'top' ? 'top' : 'dup', Number(gram[2]))
    return t.ids[item.id] ?? item.id
  }
  return (
    <section
      aria-labelledby="training-title"
      className="flex flex-col gap-3 border-b border-line p-card"
    >
      <h3 id="training-title" className="heading-3 m-0">
        {t.title}
      </h3>
      <p className="m-0 text-body font-semibold">
        {fact.outcome === 'too-little'
          ? t.tooLittle(fact.words)
          : failed === 0
            ? t.passes(applied.length, applied.length)
            : t.fails(failed, applied.length)}
      </p>
      <p className="m-0 text-small text-ink-2">{t.intro}</p>
      {GROUPS.map((group) => {
        const rows = fact.checks.filter((item) => item.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group} className="flex flex-col">
            <h4 className="m-0 mb-1 text-small font-semibold">{t.groups[group]}</h4>
            <ul className="m-0 flex list-none flex-col p-0">
              {rows.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 text-small first:border-t-0"
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full ${
                      item.pass
                        ? 'bg-pass-soft'
                        : item.applied
                          ? 'bg-moderate-soft'
                          : 'bg-surface-2'
                    }`}
                  >
                    {item.pass ? (
                      <Check size={14} strokeWidth={2.6} aria-hidden="true" className="text-pass" />
                    ) : (
                      <TriangleAlert
                        size={14}
                        strokeWidth={2.4}
                        aria-hidden="true"
                        className={item.applied ? 'text-moderate' : 'text-ink-2'}
                      />
                    )}
                  </span>
                  <span className="grow">{label(item)}</span>
                  <span className="tabular-nums text-ink-2" dir="ltr">
                    {item.measured}
                  </span>
                  <span className="text-meta text-ink-3">
                    {t.limit[item.limit]} <span dir="ltr">{item.threshold}</span>
                  </span>
                  <span className="text-meta text-ink-2">
                    {item.proxy ? (item.group === 'c4' ? t.reference : t.proxy) : ''}{' '}
                    {item.pass ? t.passed : t.failed}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      <p className="m-0 text-meta text-ink-3">{t.note}</p>
    </section>
  )
}
