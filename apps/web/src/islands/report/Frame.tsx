import { ArrowUpRight, Globe } from 'lucide-preact'
import type { ComponentChildren } from 'preact'

/**
 * The address that was scanned, as a quiet bubble (M2.6 R7): the quiet fill, a hairline, the
 * address read left to right whichever way the page runs, and no underline, so it cannot be taken
 * for a button. When the scan is over it is a link to the page (`href`, `rel` as before), told by
 * its arrow and by nothing louder. A 300-character address breaks anywhere inside it.
 */
function Address({ url, href }: { url: string; href?: string | undefined }) {
  const box =
    'inline-flex max-w-full min-w-0 items-start gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-small text-ink-2'
  const text = 'min-w-0 break-all [overflow-wrap:anywhere]'
  const globe = <Globe aria-hidden="true" size={16} className="mt-1 shrink-0 text-ink-3" />
  if (href === undefined) {
    return (
      <div className={box}>
        {globe}
        <span dir="ltr" className={text}>
          {url}
        </span>
      </div>
    )
  }
  return (
    <a
      href={href}
      rel="nofollow noreferrer noopener"
      className={`${box} no-underline hover:border-line-2 hover:text-ink`}
    >
      {globe}
      <span dir="ltr" className={text}>
        {url}
      </span>
      <ArrowUpRight
        aria-hidden="true"
        size={14}
        className="mt-2 shrink-0 text-ink-3 rtl:-scale-x-100"
      />
    </a>
  )
}

/**
 * The frame of every state of the report page (M2.6 R7): a head, then the answer. The head is the
 * address that was scanned, a line that says when and what the page answered (`meta`), and the
 * page's heading (`head`). The answer is two columns from lg, as `PageColumns.astro` draws an
 * Astro page's: the aside, which comes first in the page so that it is first on a phone and sticks
 * under the header from lg, and the main column, at most 760 px. A state that is one card has no
 * aside: the head and the card are one column, centred.
 */
export function Frame({
  url,
  href,
  meta,
  head,
  aside,
  children,
}: {
  /** The address; none for a link that names no scan. */
  url: string | null
  href?: string | undefined
  meta?: ComponentChildren
  /** The page's heading, and what goes under it. */
  head?: ComponentChildren
  aside?: ComponentChildren
  children: ComponentChildren
}) {
  const hasHead = url !== null || head !== undefined
  const top = hasHead && (
    <header className="flex flex-col items-start gap-3">
      {url !== null && <Address url={url} href={href} />}
      {meta}
      {head}
    </header>
  )
  if (aside === undefined) {
    return (
      <div className="wrap flex flex-1 flex-col pt-6 pb-section lg:pt-8">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 lg:gap-8">
          {top}
          {children}
        </div>
      </div>
    )
  }
  return (
    <div className="wrap flex flex-1 flex-col gap-6 pt-6 pb-section lg:gap-8 lg:pt-8">
      {top}
      <div className="page-columns gap-y-6">
        {/* A focus ring at 2 px from the edge (not 3) fits in the 4 px the sticky aside keeps. */}
        <div className="page-aside page-aside-sticky flex flex-col gap-card [&_:focus-visible]:outline-offset-2">
          {aside}
        </div>
        <div className="page-main flex flex-col gap-8 lg:gap-10">{children}</div>
      </div>
    </div>
  )
}
