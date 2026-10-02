import { TOOL_APP } from '@arablyzer/i18n/tool-app'
import type { Lang } from '@arablyzer/seo/site'
import { X } from 'lucide-preact'
import type { ComponentChildren } from 'preact'

/**
 * A tool's box, the home page's scan box with the tool in its pill (M2.6 R3): the white box with
 * the colour ring turning around it and the glow under it, which a check in progress sweeps with
 * the reading beam. The pill names the tool, in its category's colour; a tool that checks a page
 * has a × in it, which leaves for the home page's full check. Every tool's island wears it: the
 * scan tools' address field, the generators' fields and the paste tool's.
 */
export function ToolBox({
  lang,
  title,
  dot,
  fullScanHref,
  busy = false,
  children,
}: {
  lang: Lang
  /** The tool's name. */
  title: string
  /** The category's colour as a background class (CATEGORY_STYLE.dot), for the pill's dot. */
  dot: string
  /** Where the pill's × goes. A tool that does not check a page has none. */
  fullScanHref?: string
  /** A check is running. */
  busy?: boolean
  children: ComponentChildren
}) {
  const t = TOOL_APP[lang].form
  return (
    <div className="relative">
      <div aria-hidden="true" className="scan-glow" />
      <div className="scan-ring">
        <div
          className={`flex flex-col gap-3.5 rounded-[24px] bg-white p-3.5 text-start sm:p-4 ${busy ? 'reading-beam' : ''}`}
        >
          <div
            className={`inline-flex min-h-[34px] max-w-full items-center gap-2 self-start rounded-[10px] bg-indigo-soft py-1 text-sm font-semibold text-indigo-ink ${fullScanHref === undefined ? 'px-3' : 'ps-3 pe-1'}`}
          >
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
            <span className="min-w-0 leading-snug">{title}</span>
            {fullScanHref !== undefined && (
              <a
                href={fullScanHref}
                aria-label={t.fullScan}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-indigo-ink hover:bg-indigo-ink/10"
              >
                <X size={16} strokeWidth={2.2} aria-hidden="true" />
              </a>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * The generators' and the paste tool's fields, in the v2 look: 48 px high, a hairline in the
 * field's colour (3:1 on white), 12 px of radius. `AREA` is the same for a text area, which takes
 * its height from its rows.
 */
export const FIELD =
  'h-12 min-w-0 rounded-xl border border-field bg-white px-3.5 text-base text-ink placeholder:text-ink-3'
export const AREA =
  'min-w-0 rounded-xl border border-field bg-white px-3.5 py-2.5 text-base text-ink placeholder:text-ink-3'
export const LABEL = 'text-sm font-semibold text-ink'
/** A secondary button inside the box: a white one that lines up with the 48 px fields. */
export const SECONDARY =
  'inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-2 bg-white px-4 text-sm font-semibold text-ink hover:border-field'
/** The submit button: the page's gradient action, 48 px high. */
export const SUBMIT = 'btn-grad btn-lg self-start'
