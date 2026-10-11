import { NATIVE2 } from '@arablyzer/i18n/native2'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { Check, Minus } from 'lucide-preact'
import { Revealed } from './Bidi'

/**
 * AI visibility (rule ai-visibility-gap): for each assistant that answered, whether it named the
 * brand and cited the domain, and the other domains it cited. Draws nothing when the tool was off.
 */
export function AiVisibility({ report, lang }: { report: Report; lang: Lang }) {
  const fact = report.facts.aiVisibility
  if (fact === undefined) return null
  const t = NATIVE2[lang].ai
  const answered = fact.providers.filter((provider) =>
    provider.answers.some((answer) => answer.status === 'answered'),
  )
  const named = answered.filter((provider) => provider.answers.some((answer) => answer.mentioned))
  return (
    <section aria-labelledby="ai-title" className="flex flex-col gap-3 border-b border-line p-card">
      <h3 id="ai-title" className="heading-3 m-0">
        {t.title}
      </h3>
      <p className="m-0 text-body font-semibold">{t.summary(named.length, answered.length)}</p>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {fact.providers.map((provider) => {
          const done = provider.answers.filter((answer) => answer.status === 'answered')
          const mentioned = done.filter((answer) => answer.mentioned).length
          const cited = done.filter((answer) => answer.cited).length
          const competitors = [...new Set(done.flatMap((answer) => answer.competitors))].slice(0, 8)
          const sources = [...new Set(done.flatMap((answer) => answer.citations))].slice(0, 6)
          return (
            <li
              key={provider.provider}
              className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="heading-3">{t.providers[provider.provider]}</span>
                <span dir="ltr" className="font-mono text-meta text-ink-3">
                  {provider.model}
                </span>
                <span className="text-meta text-ink-2">{t.status[provider.status]}</span>
              </div>
              {done.length > 0 && (
                <>
                  <span className="flex items-center gap-2 text-small">
                    {mentioned > 0 ? (
                      <Check size={14} strokeWidth={2.6} aria-hidden="true" className="text-pass" />
                    ) : (
                      <Minus
                        size={14}
                        strokeWidth={2.4}
                        aria-hidden="true"
                        className="text-ink-2"
                      />
                    )}
                    {mentioned > 0 ? t.mentioned : t.notMentioned} ·{' '}
                    {cited > 0 ? t.cited : t.notCited}
                  </span>
                  <span className="text-meta text-ink-2">
                    {t.answers(done.length, mentioned, cited)}
                  </span>
                  {competitors.length > 0 && (
                    <p className="m-0 text-small text-ink-2">
                      {t.competitors}:{' '}
                      <span dir="ltr" className="font-mono">
                        {competitors.join(lang === 'ar' ? '، ' : ', ')}
                      </span>
                    </p>
                  )}
                  {sources.length > 0 && (
                    <details className="text-small">
                      <summary className="min-h-11 cursor-pointer py-2">{t.sources}</summary>
                      <ul className="m-0 flex list-none flex-col gap-1 p-0">
                        {sources.map((url) => (
                          <li
                            key={url}
                            dir="ltr"
                            className="font-mono text-meta break-all text-ink-3"
                          >
                            {url}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
      <details className="text-small">
        <summary className="min-h-11 cursor-pointer py-2">{t.questions}</summary>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {fact.questions.map((question) => (
            <li key={question} dir="rtl" lang="ar">
              <Revealed text={question} />
            </li>
          ))}
        </ul>
      </details>
      <p className="m-0 text-meta text-ink-3">{t.note}</p>
    </section>
  )
}
