/**
 * Arabic text with Latin words and code in it, split so each Latin run can be isolated: in a
 * right-to-left line, an unisolated `[A-Za-z ]{3,40}` or `04-rtl-layout` is drawn out of order.
 * A run starts at a Latin letter, a digit or an opening bracket, and holds a Latin letter or a
 * bracket; it ends before Arabic, «», or Arabic punctuation, without its trailing spaces and
 * stops. Numbers alone stay as they are: they read the same either way.
 */
export interface TextPart {
  readonly text: string
  readonly isolate: boolean
}

const RUN = /[A-Za-z0-9[{(][^؀-ۿ«»،؛؟]*/g
const TRAILING = /[\s.,:;]+$/
const LATIN_OR_BRACKET = /[A-Za-z[\]{}()]/

export function isolateLatin(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(RUN)) {
    const run = match[0].replace(TRAILING, '')
    if (!LATIN_OR_BRACKET.test(run)) continue
    const start = match.index
    if (start > last) parts.push({ text: text.slice(last, start), isolate: false })
    parts.push({ text: run, isolate: true })
    last = start + run.length
  }
  if (last < text.length) parts.push({ text: text.slice(last), isolate: false })
  return parts
}
