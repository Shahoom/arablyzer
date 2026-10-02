import { GENERATORS_UI } from '@arablyzer/i18n/generators'
import type { Lang } from '@arablyzer/seo/site'
import { Check, Copy } from 'lucide-preact'
import { useRef, useState } from 'preact/hooks'

/**
 * A generator's output, with a button that copies it: in the click's own handler, as browsers
 * ask; where the clipboard is refused, the text is selected for the visitor to copy.
 */
export function CopyBox({
  lang,
  label,
  text,
  mono = true,
}: {
  lang: Lang
  label: string
  text: string
  mono?: boolean
}) {
  const t = GENERATORS_UI[lang].common
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLPreElement>(null)
  const select = () => {
    const node = box.current
    if (node === null) return
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
      }, 2000)
    }, select)
  }
  return (
    <div className="flex min-w-0 flex-col border border-rule-strong bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-rule-soft px-4 py-2.5">
        <span className="text-sm font-semibold text-ink-2">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="flex cursor-pointer items-center gap-1.5 border border-rule-strong px-2.5 py-1 text-sm hover:border-ink"
        >
          {copied ? (
            <Check size={14} strokeWidth={2.4} aria-hidden="true" className="text-pass" />
          ) : (
            <Copy size={14} strokeWidth={2} aria-hidden="true" />
          )}
          <span aria-live="polite">{copied ? t.copied : t.copy}</span>
        </button>
      </div>
      <pre
        ref={box}
        dir="ltr"
        tabIndex={0}
        className={`m-0 px-4 py-3.5 text-start text-sm leading-[1.7] whitespace-pre-wrap [overflow-wrap:anywhere] ${mono ? 'font-mono' : ''}`}
      >
        {text}
      </pre>
    </div>
  )
}

/** The fields' look, as the tool form's: a label above, a bordered field. */
export const FIELD =
  'h-12 min-w-0 border-[1.5px] border-ink bg-white px-3.5 text-base text-ink placeholder:text-ink-3'
export const LABEL = 'text-sm font-semibold'
export const SUBMIT =
  'flex h-12 cursor-pointer items-center justify-center gap-2.5 self-start bg-ink px-7 text-[17px] font-semibold text-white hover:bg-brand-ink'
