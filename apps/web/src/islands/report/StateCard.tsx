import { REPORT } from '@arablyzer/i18n/report'
import type { Notice } from '@arablyzer/report-schema'
import { localePath, type Lang } from '@arablyzer/seo/site'
import { Bidi } from './Bidi'

export type StateKind = 'blocked' | 'opted-out' | 'failed' | 'missing' | 'offline'

/**
 * When a scan does not go as it should (the approved States design): what happened, in plain
 * words, and what the visitor can do. Never a vague error, never a report of what was not scanned.
 * A site that asked not to be checked (M2.4 plan §2) is told with its rule, from the notice.
 */
export function StateCard({
  kind,
  lang,
  status = null,
  url = null,
  notices = [],
}: {
  kind: StateKind
  lang: Lang
  status?: number | null
  url?: string | null
  notices?: readonly Notice[]
}) {
  const t = REPORT[lang].states
  const title =
    kind === 'blocked' ? t.blocked.title : kind === 'opted-out' ? t.optedOut.title : t[kind].title
  const text =
    kind === 'blocked'
      ? t.blocked.text(String(status ?? ''))
      : kind === 'opted-out'
        ? t.optedOut.text
        : kind === 'failed' && notices.length > 0
          ? t.failed.why
          : t[kind].text
  const home = localePath(lang, '/')
  return (
    <section
      aria-labelledby="state-title"
      className="mx-5 my-10 flex max-w-3xl flex-col gap-4 border-[1.5px] border-ink bg-white p-6 shadow-key md:mx-16 md:p-8"
    >
      <h1 id="state-title" className="m-0 text-2xl font-semibold md:text-3xl">
        {title}
      </h1>
      <p className="m-0 text-base leading-[1.8] text-ink-2">
        <Bidi text={text} lang={lang} />
      </p>
      {url !== null && (
        <span dir="ltr" className="self-start font-mono text-sm break-all text-ink-3">
          {url}
        </span>
      )}
      {notices.map((notice) => (
        <p
          key={notice.code}
          className="m-0 border-s-2 border-rule-strong ps-4 text-[15px] text-ink-2"
        >
          <Bidi text={notice.message[lang]} lang={lang} />
        </p>
      ))}
      <div className="flex flex-wrap gap-3 pt-2">
        {url !== null && kind !== 'offline' && (
          <a
            href={`${home}?url=${encodeURIComponent(url)}#scan`}
            className="flex h-11 items-center bg-ink px-5 font-semibold text-white hover:bg-signal"
          >
            {t.again}
          </a>
        )}
        <a
          href={`${home}#scan`}
          className="flex h-11 items-center border-[1.5px] border-ink bg-white px-5 font-semibold hover:text-signal"
        >
          {t.another}
        </a>
      </div>
    </section>
  )
}
