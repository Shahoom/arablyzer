// What the page and the explorer both write: numbers and bars, with no import, so that the
// explorer's script bundles none of the build's modules (node:crypto among them).

/** `{name}` in a line of copy, filled in. A name with no value stays, so a mistake is seen. */
export function fill(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  )
}

/** A share as a percentage: whole from 10%, a decimal under it, and «<0.1%» for what rounds to nothing. */
export function pct(share: number): string {
  const percent = share * 100
  if (percent === 0) return '0%'
  if (percent < 0.1) return '<0.1%'
  if (percent < 10) return `${percent.toFixed(1)}%`
  return `${Math.round(percent).toString()}%`
}

/** A number with thousands separators, in Western digits as the rest of the site's figures. */
export const count = (n: number): string => n.toLocaleString('en-US')

/** A bar as an SVG draws it on 0 to 100: `x` and `width`, from the right in a right-to-left page. */
export function span(from: number, to: number, reading: boolean): { x: number; width: number } {
  const width = Math.max(0, round(to - from))
  return { x: reading ? round(100 - to) : from, width }
}

/** A size for a download: kilobytes or megabytes. */
export function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toString()} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const round = (value: number): number => Math.round(value * 100) / 100
