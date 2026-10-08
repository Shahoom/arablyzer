import { NATIVE } from '@arablyzer/i18n/native'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { Check, Minus, TriangleAlert } from 'lucide-preact'
import { Revealed } from './Bidi'

/**
 * "Ready X% for <country>": the page's country, as the report's facts have it (rule country-fit),
 * with the items judged, and what told us. With thin or conflicting evidence it says so and shows
 * no percentage. Draws nothing when the rule did not run.
 */
export function CountryFit({
  report,
  lang,
  standalone = false,
}: {
  report: Report
  lang: Lang
  /** On the report page, a card of its own; inside a tool's result, a section of it. */
  standalone?: boolean
}) {
  const fact = report.facts.countryFit
  if (fact === undefined) return null
  const t = NATIVE[lang].country
  const name = fact.country === null ? null : t.names[fact.country]
  const headline =
    fact.country !== null && fact.percent !== null && name !== null
      ? t.ready(fact.percent, name)
      : fact.confidence === 'thin' && name !== null
        ? t.thin(name)
        : fact.signals.length === 0
          ? t.none
          : t.unclear
  return (
    <section
      aria-labelledby="country-title"
      className={`flex flex-col gap-3 p-card ${standalone ? 'card rounded-card' : 'border-b border-line'}`}
    >
      <h3 id="country-title" className="heading-3 m-0">
        {t.title}
      </h3>
      <p className="m-0 text-body font-semibold">{headline}</p>
      {fact.percent !== null && (
        <p className="m-0 text-small text-ink-2">
          {t.judged(fact.judged)} · {t.note}
        </p>
      )}
      {fact.percent !== null && (
        <ul className="m-0 flex list-none flex-col p-0">
          {fact.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 text-small first:border-t-0"
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full ${
                  item.status === 'ok'
                    ? 'bg-pass-soft'
                    : item.status === 'gap'
                      ? 'bg-moderate-soft'
                      : 'bg-surface-2'
                }`}
              >
                {item.status === 'ok' ? (
                  <Check size={14} strokeWidth={2.6} aria-hidden="true" className="text-pass" />
                ) : item.status === 'gap' ? (
                  <TriangleAlert
                    size={14}
                    strokeWidth={2.4}
                    aria-hidden="true"
                    className="text-moderate"
                  />
                ) : (
                  <Minus size={14} strokeWidth={2.4} aria-hidden="true" className="text-ink-2" />
                )}
              </span>
              <span className="grow">{t.items[item.id]}</span>
              {item.detail !== '' && (
                <span dir="auto" className="font-mono text-meta break-all text-ink-3">
                  <Revealed text={item.detail} />
                </span>
              )}
              <span className="text-meta text-ink-2">{t.status[item.status]}</span>
            </li>
          ))}
        </ul>
      )}
      {fact.signals.length > 0 && (
        <p className="m-0 text-meta text-ink-3">
          {t.evidence}:{' '}
          {fact.signals.map((signal, index) => (
            <span key={`${signal.kind}${signal.country}`}>
              {index > 0 && ' · '}
              {t.signal[signal.kind]} {signal.country}{' '}
              <span dir="ltr">
                (<Revealed text={signal.value} />)
              </span>
            </span>
          ))}
        </p>
      )}
    </section>
  )
}
