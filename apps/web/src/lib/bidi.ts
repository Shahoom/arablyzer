/**
 * Arabic text with Latin words and code in it, split so each Latin run can be isolated: in a
 * right-to-left line, an unisolated `[A-Za-z ]{3,40}` or `04-rtl-layout` is drawn out of order.
 * A run starts at a Latin letter, a digit, a plus sign or an opening bracket, a tag's "<" among
 * them (`<html>`); it ends before Arabic, «», or Arabic punctuation, without its trailing spaces
 * and stops. It is isolated when it holds a Latin letter, or numbers that spaces, brackets or a
 * plus sign join into one, such as `+968 9123 4567` or `[0-9]{8}`, which would otherwise be drawn
 * in pieces, right to left.
 * Numbers alone stay as they are, and so do brackets around Arabic: they read the same either way.
 */
export interface TextPart {
  readonly text: string
  readonly isolate: boolean
}

const RUN = /[A-Za-z0-9[{(+<][^؀-ۿ«»،؛؟]*/g
const TRAILING = /[\s.,:;]+$/
const LATIN = /[A-Za-z]/
/** Digits, and a space, bracket or plus sign that makes them one written thing. */
const JOINED_NUMBERS = /\d.*[\s[\]{}()+]|[\s[\]{}()+].*\d/

export function isolateLatin(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(RUN)) {
    const run = match[0].replace(TRAILING, '')
    if (!LATIN.test(run) && !JOINED_NUMBERS.test(run)) continue
    const start = match.index
    if (start > last) parts.push({ text: text.slice(last, start), isolate: false })
    parts.push({ text: run, isolate: true })
    last = start + run.length
  }
  if (last < text.length) parts.push({ text: text.slice(last), isolate: false })
  return parts
}

/**
 * The characters that change the direction of the text around them without being seen:
 * embeddings and overrides (U+202A to U+202E), isolates (U+2066 to U+2069), and the marks
 * (U+200E, U+200F, U+061C).
 */
const CONTROLS = /[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/g

export interface ShownPart {
  readonly text: string
  /** A control, named: `⟨U+202E⟩`. */
  readonly control: boolean
}

/**
 * A page's own text, as a finding quotes it (its code, its selector, its values), with each
 * direction control named instead of obeyed: a hostile page's U+202E would draw the rest of the
 * line backwards: `text=`, U+202E and `evil">` drawn as `text=<"live`.
 */
export function revealControls(text: string): ShownPart[] {
  const parts: ShownPart[] = []
  let last = 0
  for (const match of text.matchAll(CONTROLS)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), control: false })
    const code = match[0].codePointAt(0) ?? 0
    parts.push({
      text: `⟨U+${code.toString(16).toUpperCase().padStart(4, '0')}⟩`,
      control: true,
    })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), control: false })
  return parts
}
