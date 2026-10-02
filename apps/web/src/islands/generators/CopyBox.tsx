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
    <div className="card flex min-w-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-card py-2">
        <span className="text-small font-semibold text-ink-2">{label}</span>
        <button type="button" onClick={copy} className="btn-white">
          {copied ? (
            <Check size={16} strokeWidth={2.4} aria-hidden="true" />
          ) : (
            <Copy size={16} strokeWidth={2} aria-hidden="true" />
          )}
          <span aria-live="polite">{copied ? t.copied : t.copy}</span>
        </button>
      </div>
      <pre
        ref={box}
        dir="ltr"
        tabIndex={0}
        className={`m-0 px-card py-3 text-start text-small leading-[1.7] whitespace-pre-wrap text-ink [overflow-wrap:anywhere] ${mono ? 'font-mono' : ''}`}
      >
        {text}
      </pre>
    </div>
  )
}
