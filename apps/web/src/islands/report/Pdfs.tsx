import { NATIVE2 } from '@arablyzer/i18n/native2'
import type { Report } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { Check, TriangleAlert } from 'lucide-preact'
import { Revealed } from './Bidi'

/**
 * The Arabic PDF forensics (rules pdf-arabic-text and pdf-metadata): each PDF the page links, what
 * is wrong with its Arabic and how to export it again. Draws nothing when the tool did not run.
 */
export function Pdfs({ report, lang }: { report: Report; lang: Lang }) {
  const fact = report.facts.pdfs
  if (fact === undefined) return null
  const t = NATIVE2[lang].pdfs
  const read = fact.files.filter((file) => file.outcome === 'read').length
  return (
    <section
      aria-labelledby="pdfs-title"
      className="flex flex-col gap-3 border-b border-line p-card"
    >
      <h3 id="pdfs-title" className="heading-3 m-0">
        {t.title}
      </h3>
      <p className="m-0 text-body font-semibold">
        {fact.linked === 0 ? t.none : t.summary(read, fact.linked)}
      </p>
      {fact.linked > fact.files.length && (
        <p className="m-0 text-small text-ink-2">{t.more(fact.linked - fact.files.length)}</p>
      )}
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {fact.files.map((file) => (
          <li
            key={file.url}
            className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0"
          >
            <span dir="ltr" className="font-mono text-small font-semibold break-all">
              {file.url}
            </span>
            {file.outcome !== 'read' ? (
              <span className="text-small text-ink-2">{t.outcomes[file.outcome]}</span>
            ) : (
              <>
                <span className="text-meta text-ink-3">
                  {t.pages(file.pagesRead, file.pages)} · {t.titleLabel}:{' '}
                  {file.title === null ? '·' : <Revealed text={file.title} />} · {t.languageLabel}:{' '}
                  <span dir="ltr">{file.language ?? '·'}</span>
                </span>
                {file.issues.length === 0 ? (
                  <span className="flex items-center gap-2 text-small">
                    <Check size={14} strokeWidth={2.6} aria-hidden="true" className="text-pass" />
                    {t.clean}
                  </span>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {file.issues.map((issue) => (
                      <li key={issue.kind} className="flex flex-col gap-0.5 text-small">
                        <span className="flex flex-wrap items-center gap-2 font-semibold">
                          <TriangleAlert
                            size={14}
                            strokeWidth={2.4}
                            aria-hidden="true"
                            className="text-moderate"
                          />
                          {t.issues[issue.kind].name}
                          {issue.measure > 0 && issue.measure <= 1 && (
                            <span className="text-meta font-normal text-ink-2">
                              {t.measure(Math.round(issue.measure * 100))}
                            </span>
                          )}
                          {issue.example !== '' && (
                            <span dir="auto" className="font-mono text-meta font-normal text-ink-3">
                              <Revealed text={issue.example} />
                            </span>
                          )}
                        </span>
                        <span className="text-ink-2">{t.issues[issue.kind].fix}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="m-0 text-meta text-ink-3">{t.note}</p>
    </section>
  )
}
