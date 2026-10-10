import { NATIVE } from '@arablyzer/i18n/native'
import type { Report, SearchTestFact } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { Revealed } from './Bidi'

type Outcome = SearchTestFact['words'][number]['variants'][number]['outcome']

const OUTCOME_STYLE: Readonly<Record<Outcome, string>> = {
  same: 'bg-pass-soft text-pass',
  differs: 'bg-moderate-soft text-moderate',
  lost: 'bg-serious-soft text-serious',
  unanswered: 'bg-surface-2 text-ink-3',
}

/**
 * The spelling search test's table: for each word of the page, what its own spelling found, and
 * for each variant asked what it found and how that compares. Draws nothing when the report holds
 * no search test (it was not run, or nothing could be asked).
 */
export function SearchTest({ report, lang }: { report: Report; lang: Lang }) {
  const fact = report.facts.searchTest
  if (fact === undefined) return null
  const t = NATIVE[lang].search
  return (
    <section
      aria-labelledby="search-title"
      className="flex flex-col gap-3 border-b border-line p-card"
    >
      <h3 id="search-title" className="heading-3 m-0">
        {t.title}
      </h3>
      <p className="m-0 text-body font-semibold">
        {fact.lost > 0 ? t.summary(fact.lost, fact.total) : t.clean(fact.total)}
      </p>
      <p className="m-0 text-small text-ink-2">
        {t.via[fact.via]} <span className="ms-3">{t.requests(fact.requests)}</span>
      </p>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {fact.words.map((word) => (
          <li key={word.word} className="flex flex-col gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-meta text-ink-3">{t.word}</span>
              <span dir="rtl" lang="ar" className="heading-3">
                <Revealed text={word.word} />
              </span>
              <span className="text-small text-ink-2">
                {word.results === null ? '·' : t.found(word.results)}
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {word.variants.map((variant) => (
                <li
                  key={variant.kind + variant.query}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 text-small first:border-t-0"
                >
                  <span className="min-w-28 text-ink-2">{t.kinds[variant.kind]}</span>
                  <span dir="rtl" lang="ar" className="grow font-semibold">
                    <Revealed text={variant.query} />
                  </span>
                  <span className="tabular-nums text-ink-2">
                    {variant.results === null ? '·' : t.found(variant.results)}
                  </span>
                  <span
                    className={`rounded-full px-3 py-0.5 text-meta ${
                      variant.counted ? OUTCOME_STYLE[variant.outcome] : 'bg-surface-2 text-ink-2'
                    }`}
                  >
                    {variant.counted ? t.outcomes[variant.outcome] : t.notCounted}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="m-0 text-meta text-ink-3">{t.floor}</p>
    </section>
  )
}
