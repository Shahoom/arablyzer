const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Safe in text and in quoted attribute values. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char)
}

const NAMED: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

/**
 * The text of markup our own renderers wrote (so its entities are the five escapeHtml writes), for
 * the places that take plain text only: a question and its answer in FAQPage JSON-LD.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(?:p|li|tr|h[1-6]|pre)>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => NAMED[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim()
}
