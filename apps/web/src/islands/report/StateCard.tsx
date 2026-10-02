import { REPORT } from '@arablyzer/i18n/report'
import type { Notice } from '@arablyzer/report-schema'
import { localePath, type Lang } from '@arablyzer/seo/site'
import { Ban, SearchX, ShieldAlert, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-preact'
import { Bidi } from './Bidi'
import { Thread } from './Thread'

export type StateKind = 'blocked' | 'opted-out' | 'failed' | 'missing' | 'offline'

/** A state's icon, and the tone of the tile it sits in: a refusal is serious, an absence is quiet. */
const ICON: Readonly<Record<StateKind, { readonly Icon: LucideIcon; readonly tone: string }>> = {
  blocked: { Icon: ShieldAlert, tone: 'bg-serious-soft text-serious' },
  'opted-out': { Icon: Ban, tone: 'bg-indigo-soft text-indigo-ink' },
  failed: { Icon: TriangleAlert, tone: 'bg-serious-soft text-serious' },
  missing: { Icon: SearchX, tone: 'bg-surface-2 text-ink-2' },
  offline: { Icon: WifiOff, tone: 'bg-moderate-soft text-moderate' },
}

/**
 * When a scan does not go as it should (the approved States design): what happened, in plain
 * words, and what the visitor can do. Never a vague error, never a report of what was not scanned.
 * A site that asked not to be checked (M2.4 plan §2) is told with its rule, from the notice. The
 * answer sits in the thread, under the address that was asked for, when there is one.
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
  const { Icon, tone } = ICON[kind]
  return (
    <div className="flex flex-1 flex-col">
      <Thread lang={lang} url={url}>
        <section aria-labelledby="state-title" className="card flex flex-col gap-4 p-6 md:p-8">
          <span
            aria-hidden="true"
            className={`grid size-12 place-items-center rounded-2xl forced-colors:border ${tone}`}
          >
            <Icon size={24} />
          </span>
          <h1 id="state-title" className="m-0 text-2xl font-semibold text-balance md:text-[28px]">
            {title}
          </h1>
          <p className="m-0 text-base leading-[1.8] text-ink-2">
            <Bidi text={text} lang={lang} />
          </p>
          {notices.map((notice) => (
            <p
              key={notice.code}
              className="m-0 rounded-lg bg-surface-2 px-4 py-3 text-[15px] leading-[1.8] text-ink-2"
            >
              <Bidi text={notice.message[lang]} lang={lang} />
            </p>
          ))}
          <div className="flex flex-wrap gap-3 pt-2">
            {url !== null && kind !== 'offline' && (
              <a href={`${home}?url=${encodeURIComponent(url)}#scan`} className="btn-grad">
                {t.again}
              </a>
            )}
            <a
              href={`${home}#scan`}
              className={url !== null && kind !== 'offline' ? 'btn-white' : 'btn-grad'}
            >
              {t.another}
            </a>
          </div>
        </section>
      </Thread>
    </div>
  )
}
