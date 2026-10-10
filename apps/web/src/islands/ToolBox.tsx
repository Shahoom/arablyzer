import type { ComponentChildren } from 'preact'

/**
 * A tool's box (M2.6 R7): a plain white box (`scan-box`: a 1 px border, the soft shadow, an indigo
 * ring while a control inside has focus), which a check in progress sweeps with the reading beam.
 * The turning ring and the glow are the home page's scan box alone. In it, a small label that
 * names the tool in its category's colour, the tool's own form (`children`: the address and its
 * button, or the generator's fields) and, under it, the fine print (`note`, a ScanNote). Every
 * tool's island wears it. On a scan tool's page it sits in the aside, 320 to 360 px wide; a
 * generator's, which needs the room, in the main column.
 */
export function ToolBox({
  title,
  dot,
  busy = false,
  note,
  children,
}: {
  /** The tool's name. */
  title: string
  /** The category's colour as a background class (CATEGORY_STYLE.dot), for the label's dot. */
  dot: string
  /** A check is running. */
  busy?: boolean
  /** The fine print under the form. */
  note?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <div className={`scan-box flex flex-col gap-3 p-card text-start ${busy ? 'reading-beam' : ''}`}>
      <p className="m-0 flex items-center gap-2 text-meta font-semibold text-ink-2">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
        <span className="min-w-0">{title}</span>
      </p>
      {children}
      {note}
    </div>
  )
}

/**
 * The generators' and the paste tool's fields: 48 px high, 16 px type (a phone does not zoom in
 * on it), a hairline in the field's colour (3:1 on white), 12 px of radius. `AREA` is the same for
 * a text area, which takes its height from its rows.
 */
export const FIELD =
  'h-12 min-w-0 rounded-xl border border-field bg-white px-4 text-body text-ink placeholder:text-ink-3'
export const AREA =
  'min-w-0 rounded-xl border border-field bg-white px-4 py-3 text-body text-ink placeholder:text-ink-3'
export const LABEL = 'text-small font-semibold text-ink'
/** A secondary button inside the box: the page's white one, 44 px high. */
export const SECONDARY = 'btn-white'
/** The submit button: the page's gradient action, 48 px high, the box's width on a phone. */
export const SUBMIT = 'btn-grad btn-lg w-full sm:w-auto sm:self-start'
