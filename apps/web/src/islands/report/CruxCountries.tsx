import { NATIVE2 } from '@arablyzer/i18n/native2'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'

const METRICS = ['lcp', 'inp', 'cls'] as const

/**
 * The Chrome UX Report by country (rule crux-country-gaps): for each Arab country, the share of
 * good phone visits in each metric and the origin's popularity rank. Draws nothing when the tool was
 * off or did not run.
 */
export function CruxCountries({ report, lang }: { report: Report; lang: Lang }) {
  const fact = report.facts.cruxCountries
  if (fact === undefined) return null
  const t = NATIVE2[lang].crux
  const found = fact.countries.filter((country) => country.found)
  const percent = (share: number) =>
    `${String(Math.round(share * 100))}${lang === 'ar' ? '٪' : '%'}`
  return (
    <section
      aria-labelledby="crux-title"
      className="flex flex-col gap-3 border-b border-line p-card"
    >
      <h3 id="crux-title" className="heading-3 m-0">
        {t.title}
      </h3>
      <p className="m-0 text-body font-semibold">
        {found.length === 0 ? t.none(fact.month) : t.summary(found.length, fact.month)}
      </p>
      <p className="m-0 text-small text-ink-2">
        {fact.bytes === 0 ? t.cached : t.billed((fact.bytes / 1_048_576).toFixed(1))}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-96 border-collapse text-small">
          <thead>
            <tr className="text-meta text-ink-3">
              <th scope="col" className="py-2 text-start font-normal" />
              {METRICS.map((metric) => (
                <th key={metric} scope="col" className="py-2 text-start font-normal" dir="ltr">
                  {t.metrics[metric]}
                </th>
              ))}
              <th scope="col" className="py-2 text-start font-normal">
                {t.rank}
              </th>
            </tr>
          </thead>
          <tbody>
            {fact.countries.map((country) => (
              <tr key={country.country} className="border-t border-line">
                <th scope="row" className="py-2 text-start font-semibold">
                  {t.countries[country.country]}
                </th>
                {METRICS.map((metric) => {
                  const share = country.good[metric]
                  return (
                    <td key={metric} className="py-2 tabular-nums">
                      {!country.found || share === null ? (
                        <span className="text-ink-3">·</span>
                      ) : (
                        <span className={share >= 0.75 ? 'text-pass' : 'text-moderate'}>
                          {percent(share)}
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className="py-2 text-ink-2">
                  {country.rank === null ? '–' : t.top(country.rank)}
                  {!country.found && <span className="ms-2">{t.noData}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-meta text-ink-3">{t.note}</p>
    </section>
  )
}
