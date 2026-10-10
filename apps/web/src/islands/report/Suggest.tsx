import { NATIVE2 } from '@arablyzer/i18n/native2'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { Revealed } from './Bidi'

/**
 * The common search misspellings (rule misspellings-uncovered): for each key term, its misspellings,
 * which of them Google's suggestions show people type, and which the page writes. Draws nothing
 * when the tool was off or did not run.
 */
export function Suggest({ report, lang }: { report: Report; lang: Lang }) {
  const fact = report.facts.suggest
  if (fact === undefined) return null
  const t = NATIVE2[lang].suggest
  const all = fact.terms.flatMap((term) => term.variants)
  const typed = all.filter((variant) => variant.typed === true)
  const uncovered = typed.filter((variant) => !variant.covered)
  return (
    <section
      aria-labelledby="suggest-title"
      className="flex flex-col gap-3 border-b border-line p-card"
    >
      <h3 id="suggest-title" className="heading-3 m-0">
        {t.title}
      </h3>
      <p className="m-0 text-body font-semibold">
        {t.summary(typed.length, uncovered.length, fact.calls)}
      </p>
      {fact.stopped && <p className="m-0 text-small text-ink-2">{t.stopped}</p>}
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {fact.terms.map((term) => (
          <li
            key={term.term}
            className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-meta text-ink-3">{t.term}</span>
              <span dir="rtl" lang="ar" className="heading-3">
                <Revealed text={term.term} />
              </span>
              <span className="text-small text-ink-2">
                {term.written ? t.written : t.notWritten}
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {term.variants.map((variant) => (
                <li
                  key={variant.kind + variant.text}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 text-small first:border-t-0"
                >
                  <span className="min-w-28 text-ink-2">{t.kinds[variant.kind]}</span>
                  <span
                    dir="auto"
                    lang={variant.kind === 'arabizi' ? 'en' : 'ar'}
                    className="grow font-semibold"
                  >
                    <Revealed text={variant.text} />
                  </span>
                  <span className="text-meta text-ink-2">
                    {variant.typed === null ? t.notAsked : variant.typed ? t.typed : t.notTyped}
                  </span>
                  <span
                    className={`rounded-full px-3 py-0.5 text-meta ${
                      variant.typed === true && !variant.covered
                        ? 'bg-moderate-soft text-moderate'
                        : 'bg-surface-2 text-ink-2'
                    }`}
                  >
                    {variant.covered ? t.covered : t.uncovered}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="m-0 text-meta text-ink-3">{t.note}</p>
    </section>
  )
}
