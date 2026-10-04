import { NATIVE2 } from '@arablyzer/i18n/native2'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'

/**
 * The look-alike domain radar (rule lookalike-domains): the registered names, with their records
 * and the date of their first certificate. Draws nothing when the tool did not run.
 */
export function Lookalikes({ report, lang }: { report: Report; lang: Lang }) {
  const fact = report.facts.lookalikes
  if (fact === undefined) return null
  const t = NATIVE2[lang].lookalikes
  return (
    <section
      aria-labelledby="lookalikes-title"
      className="flex flex-col gap-3 border-b border-line p-card"
    >
      <h3 id="lookalikes-title" className="heading-3 m-0">
        {t.title}
      </h3>
      <p className="m-0 text-body font-semibold">
        {fact.found.length === 0 ? t.none(fact.asked) : t.summary(fact.found.length, fact.asked)}
      </p>
      {fact.ct !== 'checked' && <p className="m-0 text-small text-ink-2">{t.ct[fact.ct]}</p>}
      {fact.found.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {fact.found.map((item) => (
            <li
              key={item.domain}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 text-small first:border-t-0"
            >
              <span dir="ltr" className="font-mono font-semibold break-all">
                {item.domain}
              </span>
              <span className="text-ink-2">{t.kinds[item.kind]}</span>
              <span className="flex flex-wrap gap-1.5">
                {item.address && <span className="chip">{t.address}</span>}
                {item.mail && <span className="chip">{t.mail}</span>}
              </span>
              <span className="text-meta text-ink-2">
                {item.firstSeen === null ? (
                  item.certificates === 0 ? (
                    t.noCertificate
                  ) : null
                ) : (
                  <>
                    {t.firstCertificate} <span dir="ltr">{item.firstSeen}</span>
                  </>
                )}
              </span>
              {item.recent && (
                <span className="rounded-full bg-serious-soft px-2.5 py-0.5 text-meta text-serious">
                  {t.fresh}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-meta text-ink-3">{t.note}</p>
    </section>
  )
}
