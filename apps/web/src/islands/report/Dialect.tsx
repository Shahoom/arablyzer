import { NATIVE2 } from '@arablyzer/i18n/native2'
import { NATIVE } from '@arablyzer/i18n/native'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { Revealed } from './Bidi'

const ORDER = ['msa', 'gulf', 'egyptian', 'levantine', 'maghrebi'] as const

/**
 * The dialect of the page's Arabic (rule dialect-register): the variety, the mix of telling words
 * and whether it fits the page's country. Draws nothing when the rule did not run.
 */
export function Dialect({ report, lang }: { report: Report; lang: Lang }) {
  const fact = report.facts.dialect
  if (fact === undefined) return null
  const t = NATIVE2[lang].dialect
  const country = fact.country === null ? null : NATIVE[lang].country.names[fact.country]
  return (
    <section
      aria-labelledby="dialect-title"
      className="flex flex-col gap-3 border-b border-line p-card"
    >
      <h3 id="dialect-title" className="heading-3 m-0">
        {t.title}
      </h3>
      <p className="m-0 text-body font-semibold">
        {fact.label === null ? t.tooLittle(fact.words) : t.headline(t.varieties[fact.label])}
      </p>
      {fact.label !== null && (
        <>
          <p className="m-0 text-meta text-ink-3">{t.mix}</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {ORDER.map((variety) => (
              <li key={variety} className="chip">
                {t.varieties[variety]} {fact.mix[variety]}
                {lang === 'ar' ? '٪' : '%'}
              </li>
            ))}
          </ul>
          {fact.headings !== null && fact.headings !== fact.label && (
            <p className="m-0 text-small text-ink-2">{t.headings(t.varieties[fact.headings])}</p>
          )}
          {fact.fits !== null && country !== null && (
            <p className="m-0 text-small text-ink-2">
              {fact.fits ? t.fits(country) : t.clashes(country)}
            </p>
          )}
          {fact.markers.length > 0 && (
            <p className="m-0 text-small text-ink-2">
              {t.markers}:{' '}
              {fact.markers.map((marker, index) => (
                <span key={marker.word} dir="rtl" lang="ar">
                  {index > 0 && '، '}
                  <Revealed text={marker.word} />
                </span>
              ))}
            </p>
          )}
          <p className="m-0 text-meta text-ink-3">{t.note}</p>
        </>
      )}
    </section>
  )
}
