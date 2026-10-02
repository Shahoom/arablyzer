import { REPORT } from '@arablyzer/i18n/report'
import type { Lang } from '@arablyzer/seo/site'
import type { ComponentChildren } from 'preact'
import { Mark } from './ui'

/**
 * The page as a thread (the approved Report and Scan designs, in the v2 look): the address the
 * visitor asked for, in a bubble at the end of the line, and Arablyzer's answer under it, with its
 * mark at the start. The bubble is a link to the page when the scan is over (`href`); the line
 * under it (`meta`) says when, and what the page answered.
 */
export function Thread({
  lang,
  url,
  href,
  meta,
  children,
}: {
  lang: Lang
  /** The address; none for a link that names no scan. */
  url: string | null
  href?: string
  meta?: ComponentChildren
  children: ComponentChildren
}) {
  const t = REPORT[lang].thread
  const address = 'min-w-0 font-semibold break-all [overflow-wrap:anywhere]'
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col gap-7 px-5 pt-8 pb-12 md:px-6 md:pt-10">
      {url !== null && (
        <div className="flex max-w-full min-w-0 flex-col items-end gap-2 self-end">
          <div className="flex max-w-full min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 rounded-2xl rounded-ee-xs bg-brand bg-(image:--gradient-btn) px-5 py-3 text-base text-white shadow-btn md:text-[17px] forced-colors:border">
            <span>{t.scan}</span>
            {href === undefined ? (
              <span dir="ltr" className={address}>
                {url}
              </span>
            ) : (
              <a
                href={href}
                dir="ltr"
                rel="nofollow noreferrer noopener"
                className={`${address} underline decoration-white/60 decoration-2 underline-offset-4 hover:decoration-white`}
              >
                {url}
              </a>
            )}
          </div>
          {meta !== undefined && (
            <div className="flex flex-wrap items-center justify-end gap-1.5 text-[13px] text-ink-3">
              {meta}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
        <Mark />
        <div className="flex w-full min-w-0 flex-1 flex-col gap-6">{children}</div>
      </div>
    </div>
  )
}
