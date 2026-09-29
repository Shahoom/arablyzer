/**
 * The rules' "how to fix" HTML (packages/seo's Markdown) made for the report page. Every change
 * here is to markup the renderer wrote, whose text is already escaped.
 */

/** A table in a sideways scroller of its own, so a narrow phone never scrolls the whole page. */
export function scrollableTables(html: string): string {
  return html
    .replaceAll('<table>', '<div class="fix-table" tabindex="0"><table>')
    .replaceAll('</table>', '</table></div>')
}

/** Code blocks a keyboard can reach, and so scroll: they are as wide as their longest line. */
export function focusableBlocks(html: string): string {
  return html.replaceAll('<pre dir="ltr">', '<pre dir="ltr" tabindex="0">')
}

/** Inline code short enough for any phone's line: it never splits at a hyphen. */
export const WHOLE = 32
const ENTITY = /&(?:lt|gt|amp|quot|#39);/g

/**
 * Short inline code marked to stay whole, so `margin-inline-end` moves to the next line in one
 * piece; longer code wraps as text does. Only inline code carries `dir="ltr"` on its own element:
 * a block's code sits in its `<pre>`.
 */
export function wholeCode(html: string): string {
  return html.replace(/<code dir="ltr">([^<]*)<\/code>/g, (code, text: string) =>
    text.replace(ENTITY, '_').length > WHOLE
      ? code
      : `<code dir="ltr" class="whole">${text}</code>`,
  )
}

export function fixHtml(html: string): string {
  return wholeCode(focusableBlocks(scrollableTables(html)))
}
