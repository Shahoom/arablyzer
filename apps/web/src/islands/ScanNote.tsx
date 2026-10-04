import { SCAN_FORM } from '@arablyzer/i18n/scan-form'
import type { Lang } from '@arablyzer/seo/site'
import { ChevronDown } from 'lucide-preact'

interface Props {
  lang: Lang
  /**
   * The note's id, which its parts take their own from: `${id}-line` is the line and `${id}-keep`
   * the body of the disclosure. A field's `aria-describedby` names them. One note to a page, so
   * the default is enough.
   */
  id?: string
  /** The one line. Default: «مجاني وبلا تسجيل.» / "Free, no sign-up." */
  line?: string
  /**
   * The disclosure's body, a paragraph for each. Default: the warning that the address is kept as
   * it is sent (`SCAN_FORM.queryNote`). An empty list leaves the disclosure out, for a tool that
   * keeps nothing.
   */
  keep?: readonly string[]
}

/**
 * The fine print of a scan box (M2.6 R7), one component for every box that scans or runs a tool:
 * a line of meta text, and under it a native `<details>` whose summary, «ماذا نحفظ؟» / "What we
 * keep", opens what the service keeps of a scan. It needs no script to open, so it works before
 * its island has started. The summary is a 44 px target with the page's focus ring.
 */
export function ScanNote({ lang, id = 'scan-note', line, keep }: Props) {
  const t = SCAN_FORM[lang]
  const body = keep ?? [t.queryNote]
  return (
    <div id={id} className="flex flex-col items-start text-start">
      <p id={`${id}-line`} className="m-0 text-meta text-ink-2">
        {line ?? t.note.free}
      </p>
      {body.length > 0 && (
        <details className="group w-full">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm text-meta text-brand-ink hover:text-ink">
            {t.note.keepTitle}
            <ChevronDown
              size={14}
              strokeWidth={2.2}
              aria-hidden="true"
              className="shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <div id={`${id}-keep`} className="flex flex-col gap-2 pt-1 pb-1 text-meta text-ink-2">
            {body.map((paragraph) => (
              <p key={paragraph} className="m-0">
                {paragraph}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
