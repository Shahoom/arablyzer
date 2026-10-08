import { ChevronDown } from 'lucide-preact'
import type { ComponentChildren } from 'preact'

/**
 * One item of an accordion (WAI-ARIA's pattern): a heading around a button that says whether its
 * panel is open (aria-expanded) and which panel it opens (aria-controls), and the panel, which stays
 * in the page while it is closed, hidden, so the button's reference holds. Enter and Space work as
 * on any button. The panel is not a landmark: a report has many of them.
 */
export function Disclosure({
  id,
  open,
  onToggle,
  level = 3,
  head,
  buttonClass = '',
  children,
}: {
  /** The start of the ids of the button and its panel. */
  id: string
  open: boolean
  onToggle: () => void
  /** The level of the heading around the button. */
  level?: 2 | 3
  /** What the button holds, before its chevron. */
  head: ComponentChildren
  buttonClass?: string
  children: ComponentChildren
}) {
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <>
      <Heading className="m-0">
        <button
          type="button"
          id={`${id}-button`}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={onToggle}
          className={`flex w-full cursor-pointer items-start gap-3 text-start focus-visible:outline-offset-[-3px] ${buttonClass}`}
        >
          {head}
          <ChevronDown
            aria-hidden="true"
            size={20}
            className={`mt-0.5 shrink-0 text-ink-3 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
      </Heading>
      <div id={`${id}-panel`} hidden={!open}>
        {children}
      </div>
    </>
  )
}
