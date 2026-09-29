import { REPORT } from '@arablyzer/i18n/report'
import type { Notice } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { Bidi } from './Bidi'

/**
 * What the scan says of itself: what it could not do, and why. The report page and a tool's
 * result show them the same way; the heading is for a screen reader, at the level the page needs.
 */
export function Notices({
  notices,
  lang,
  id,
  level = 2,
}: {
  notices: readonly Notice[]
  lang: Lang
  id: string
  level?: 2 | 3
}) {
  if (notices.length === 0) return null
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <Heading id={id} className="sr-only">
        {REPORT[lang].notices}
      </Heading>
      {notices.map((notice) => (
        <p
          key={notice.code}
          role="note"
          className="m-0 border border-measure-soft bg-measure-soft px-5 py-3.5 text-[15px] leading-[1.7] text-ink-2"
        >
          <Bidi text={notice.message[lang]} lang={lang} />
        </p>
      ))}
    </section>
  )
}
